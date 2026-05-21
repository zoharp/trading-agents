import { streamAgent, ChatMessage, AgentChunk } from './claude';
import { getTechnicalSnapshot, extractTickers, TechnicalSnapshot } from './market-data';
import fs from 'fs';
import path from 'path';

const MAX_ROUNDS = 10;

export const MODEL_PRICING = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

function getCostUsd(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING] || MODEL_PRICING['claude-sonnet-4-6'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

async function saveDebateCost(ticker: string, rounds: number, inputTokens: number, outputTokens: number, model: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const costUsd = getCostUsd(inputTokens, outputTokens, model);
  try {
    await fetch(`${supabaseUrl}/rest/v1/debate_costs`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        ticker,
        rounds,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        model,
      }),
    });
  } catch (e) {
    console.error('Failed to save debate cost:', e);
  }
}

interface StanceBlock {
  stance: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  conviction: number;
  agree: 'yes' | 'no' | 'partial' | 'unknown';
  disagreement: string;
}

function parseStance(text: string): StanceBlock {
  const get = (key: string): string => {
    const re = new RegExp(`${key}:\\s*([^\\n]+)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim().toLowerCase().replace(/[<>]/g, '') : '';
  };
  const stanceRaw = get('STANCE');
  const convRaw = get('CONVICTION');
  const agreeRaw = get('AGREE_WITH_PARTNER');
  const disagree = get('KEY_DISAGREEMENT') || 'none';

  const stance = (['bullish', 'bearish', 'neutral'].includes(stanceRaw) ? stanceRaw : 'unknown') as StanceBlock['stance'];
  const conviction = parseInt(convRaw) || 0;
  const agree = (['yes', 'no', 'partial'].includes(agreeRaw) ? agreeRaw : 'unknown') as StanceBlock['agree'];

  return { stance, conviction, agree, disagreement: disagree };
}

function consensusReached(a: StanceBlock, b: StanceBlock): boolean {
  return a.agree === 'yes' && b.agree === 'yes' && a.stance === b.stance && a.stance !== 'unknown';
}

function calculateAgreementScore(a: StanceBlock, b: StanceBlock): number {
  let score = 0;
  // Same stance: +30 points
  if (a.stance === b.stance && a.stance !== 'unknown') score += 30;
  // Both agree: +40 points
  if (a.agree === 'yes' && b.agree === 'yes') score += 40;
  // Partial agreement: +15 points
  if (a.agree === 'partial' && b.agree === 'partial') score += 15;
  // Similar conviction (within 2): +15 points
  if (Math.abs(a.conviction - b.conviction) <= 2) score += 15;
  return Math.min(100, score);
}

function loadFile(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

function formatSnapshot(s: TechnicalSnapshot): string {
  const lines: string[] = [];
  const n = (v: number | undefined, decimals = 2) => v !== undefined ? v.toFixed(decimals) : 'n/a';

  lines.push(`### ${s.symbol} — as of ${s.asOf}`);
  lines.push(`Price: $${n(s.price)} (${s.changePct >= 0 ? '+' : ''}${n(s.changePct)}%) | 52w: $${n(s.low52w)} – $${n(s.high52w)}`);
  lines.push(`Volume: ${s.volume?.toLocaleString() ?? 'n/a'} (avg 20d: ${s.avgVolume?.toLocaleString() ?? 'n/a'})`);

  lines.push(`\nTechnical:`);
  lines.push(`  RSI(14): ${n(s.rsi14, 1)} | MACD hist: ${s.macd.hist >= 0 ? '+' : ''}${n(s.macd.hist, 3)} (macd: ${n(s.macd.macd, 3)}, signal: ${n(s.macd.signal, 3)})`);
  lines.push(`  EMA20: $${n(s.ema20)} | SMA50: $${n(s.sma50)} | SMA200: $${n(s.sma200)}`);
  lines.push(`  BB: upper $${n(s.bollinger.upper)} / mid $${n(s.bollinger.mid)} / lower $${n(s.bollinger.lower)} (${(s.bollinger.pctB * 100).toFixed(0)}%B)`);
  lines.push(`  ATR(14): $${n(s.atr14)} | OBV trend: ${s.obvTrend} | CMF(20): ${n(s.cmf, 3)}`);
  lines.push(`  Accumulation score: ${s.accumulationScore}/100`);
  lines.push(`  Regime: ${s.regime}`);
  lines.push(`  Structure: ${s.trendStructure}`);

  if (s.earningsDate) {
    lines.push(`\nEarnings: ${s.earningsDate}${s.earningsDaysAway !== undefined ? ` (${s.earningsDaysAway}d away)` : ''}${s.earningsSoon ? ' ⚠️ SOON' : ''}`);
  }

  const hasAnalyst = s.analystTarget || s.peRatio || s.cashDebtRatio !== undefined;
  if (hasAnalyst) {
    lines.push(`\nFundamentals:`);
    if (s.analystTarget) lines.push(`  Analyst target: $${n(s.analystTarget)} (${s.analystRecommendation ?? '?'}, n=${s.analystCount ?? '?'})`);
    if (s.peRatio) lines.push(`  P/E: ${n(s.peRatio, 1)}`);
    if (s.cashDebtRatio !== undefined) lines.push(`  Cash/Debt: ${n(s.cashDebtRatio)}x (${s.cashDebtLabel ?? ''})`);
    if (s.sector) lines.push(`  Sector: ${s.sector}`);
  }

  const hasSentiment = s.putCallRatio !== undefined || s.shortPct !== undefined || s.insiderSignal || s.googleTrendsChange !== undefined;
  if (hasSentiment) {
    lines.push(`\nSentiment:`);
    if (s.putCallRatio !== undefined) lines.push(`  Put/Call: ${n(s.putCallRatio, 2)} (${s.putCallLabel ?? ''})`);
    if (s.shortPct !== undefined) lines.push(`  Short interest: ${n(s.shortPct, 1)}% (${s.shortLabel ?? ''})`);
    if (s.insiderSignal) lines.push(`  Insider (45d): ${s.insiderSignal}${s.insiderDetail ? ` — ${s.insiderDetail}` : ''}`);
    if (s.googleTrendsChange !== undefined) lines.push(`  Google Trends: ${s.googleTrendsChange >= 0 ? '+' : ''}${n(s.googleTrendsChange, 1)}% (${s.googleTrendsLabel ?? ''})`);
  }

  const hasPerf = s.stockReturn30d !== undefined || s.alphaVsSpy !== undefined;
  if (hasPerf) {
    lines.push(`\nPerformance:`);
    if (s.stockReturn30d !== undefined) lines.push(`  30d return: ${s.stockReturn30d >= 0 ? '+' : ''}${n(s.stockReturn30d, 2)}%`);
    if (s.alphaVsSpy !== undefined) lines.push(`  Alpha vs SPY: ${s.alphaVsSpy >= 0 ? '+' : ''}${n(s.alphaVsSpy, 2)}%`);
    if (s.industryAlpha !== undefined) lines.push(`  Alpha vs ${s.industryEtfName ?? 'sector'}: ${s.industryAlpha >= 0 ? '+' : ''}${n(s.industryAlpha, 2)}%`);
    if (s.trendDirection) lines.push(`  18m trend: ${s.trendDirection}`);
  }

  if (s.support20d || s.resistance20d) {
    lines.push(`\nLevels:`);
    if (s.support20d) lines.push(`  Support 20d: $${n(s.support20d)}`);
    if (s.safeStrike) lines.push(`  Safe strike: $${n(s.safeStrike)}`);
    if (s.resistance20d) lines.push(`  Resistance 20d: $${n(s.resistance20d)}`);
  }

  return lines.join('\n');
}

export interface DebateEvent {
  type: 'system' | 'turn-start' | 'token' | 'turn-end' | 'usage' | 'round-summary' | 'final' | 'escalation' | 'error' | 'debug';
  agent?: 'Elena' | 'Marcus';
  round?: number;
  text?: string;
  stance?: StanceBlock;
  summary?: {
    round: number;
    elena: StanceBlock;
    marcus: StanceBlock;
    consensus: boolean;
    agreementScore: number; // 0-100: % agreement (higher = more aligned)
  };
  marketData?: Record<string, TechnicalSnapshot>;
  inputTokens?: number;
  outputTokens?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  resumeState?: ResumeState;
  debug?: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
  };
}

export interface ResumeState {
  transcript: { speaker: 'Elena' | 'Marcus'; text: string }[];
  round: number;
  lastElena: StanceBlock | null;
  lastMarcus: StanceBlock | null;
}

export async function* runDebate(
  userRequest: string,
  signal?: AbortSignal,
  model: string = 'claude-sonnet-4-6',
  resumeFrom?: ResumeState
): AsyncGenerator<DebateEvent> {
  try {
    const cumulative = { input: 0, output: 0 };
    const tickers = extractTickers(userRequest);

    // 1. Load personas + profile
    const elenaPersona = loadFile('agents/agent-meanrev.md');
    const marcusPersona = loadFile('agents/agent-trend.md');
    const userProfile = loadFile('profile/user-profile.md');

    // 2. Fetch market data for any tickers in the request
    const marketData: Record<string, TechnicalSnapshot> = {};
    if (tickers.length > 0 && !resumeFrom) {
      yield { type: 'system', text: `Fetching market data for: ${tickers.join(', ')}...` };
      for (const t of tickers) {
        try {
          marketData[t] = await getTechnicalSnapshot(t);
        } catch (e) {
          yield { type: 'system', text: `Could not fetch ${t}: ${(e as Error).message}` };
        }
      }
    }
    if (!resumeFrom) {
      yield { type: 'system', text: 'Market data ready. Starting debate.', marketData };
    } else {
      yield { type: 'system', text: 'Resuming debate from last position.' };
    }

    // 3. Build the shared context block
    const marketBlock = Object.keys(marketData).length
      ? Object.entries(marketData).map(([, s]) => formatSnapshot(s)).join('\n\n')
      : '## CURRENT MARKET DATA\n(No specific tickers detected in the request.)';

    const sharedContext = `
## USER PROFILE
${userProfile}

## USER REQUEST
${userRequest}

${marketBlock}
`.trim();

    // 4. Debate state — each agent sees the conversation from their own perspective
    // We maintain a single shared transcript and rebuild per-agent message arrays each turn.
    const transcript: { speaker: 'Elena' | 'Marcus'; text: string }[] = resumeFrom?.transcript || [];
    let lastElena: StanceBlock | null = resumeFrom?.lastElena || null;
    let lastMarcus: StanceBlock | null = resumeFrom?.lastMarcus || null;
    let startRound = resumeFrom?.round || 1;

    const buildMessages = (forAgent: 'Elena' | 'Marcus'): ChatMessage[] => {
      const msgs: ChatMessage[] = [{ role: 'user', content: sharedContext }];

      // Keep only the last 6 transcript entries (3 rounds) in full.
      // Older rounds are replaced with a compact stance summary to prevent context bloat.
      const FULL_WINDOW = 6;
      const older = transcript.slice(0, Math.max(0, transcript.length - FULL_WINDOW));
      const recent = transcript.slice(-FULL_WINDOW);

      if (older.length > 0) {
        const summary = older.map(e => {
          const stanceMatch = e.text.match(/STANCE:\s*(\w+).*?CONVICTION:\s*(\d+).*?AGREE_WITH_PARTNER:\s*(\w+)/s);
          if (stanceMatch) {
            return `[${e.speaker} — earlier: stance=${stanceMatch[1]}, conviction=${stanceMatch[2]}, agree=${stanceMatch[3]}]`;
          }
          return `[${e.speaker} — earlier turn (summarized)]`;
        }).join('\n');
        msgs.push({ role: 'user', content: `Previous rounds summary:\n${summary}` });
        msgs.push({ role: 'assistant', content: 'Understood. I will build on those prior positions.' });
      }

      for (const entry of recent) {
        if (entry.speaker === forAgent) {
          msgs.push({ role: 'assistant', content: entry.text });
        } else {
          msgs.push({ role: 'user', content: `[${entry.speaker} said]:\n${entry.text}` });
        }
      }

      if (msgs[msgs.length - 1].role === 'assistant') {
        msgs.push({ role: 'user', content: 'Continue the debate.' });
      }
      return msgs;
    };

    let agreementHistory: { elena: StanceBlock; marcus: StanceBlock }[] = [];

    for (let round = startRound; round <= MAX_ROUNDS; round++) {
      // --- Elena's turn (lead opens) ---
      yield { type: 'turn-start', agent: 'Elena', round };
      const elenaMessages = buildMessages('Elena');
      const elenaSystem = `${elenaPersona}\n\n## CONTEXT FOR THIS DEBATE\nYou are debating with Marcus Vance (trend/momentum trader). This is round ${round} of max ${MAX_ROUNDS}. ${round === startRound ? 'Open with your initial analysis based on the market data.' : 'Respond to Marcus\'s last message specifically.'}`;

      // Emit debug info so user can see what Claude receives
      yield {
        type: 'debug',
        agent: 'Elena',
        round,
        debug: {
          systemPrompt: elenaSystem,
          messages: elenaMessages,
        },
      };

      let elenaText = '';
      const elenaGen = streamAgent(elenaSystem, elenaMessages, model);
      for await (const chunk of elenaGen) {
        if (signal?.aborted) return;
        if (chunk.kind === 'text') {
          elenaText += chunk.text;
          yield { type: 'token', agent: 'Elena', text: chunk.text };
        } else if (chunk.kind === 'retry') {
          yield { type: 'system', text: `API overloaded — retrying (${chunk.attempt} of ${chunk.max})...` };
        } else {
          cumulative.input += chunk.inputTokens;
          cumulative.output += chunk.outputTokens;
          yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
        }
      }
      const elenaStance = parseStance(elenaText);
      transcript.push({ speaker: 'Elena', text: elenaText });
      lastElena = elenaStance;
      yield { type: 'turn-end', agent: 'Elena', round, stance: elenaStance };

      // Check if Elena delivered a FINAL recommendation already (consensus from prior round)
      if (elenaText.includes('## FINAL RECOMMENDATION') || elenaText.includes('## ESCALATION')) {
        yield { type: elenaText.includes('FINAL') ? 'final' : 'escalation', text: elenaText };
        return;
      }

      // --- Marcus's turn ---
      yield { type: 'turn-start', agent: 'Marcus', round };
      const marcusMessages = buildMessages('Marcus');
      const marcusSystem = `${marcusPersona}\n\n## CONTEXT FOR THIS DEBATE\nYou are debating with Elena Sokolov (mean-reversion trader, the lead). This is round ${round} of max ${MAX_ROUNDS}. Respond to her last message specifically.`;

      // Emit debug info so user can see what Claude receives
      yield {
        type: 'debug',
        agent: 'Marcus',
        round,
        debug: {
          systemPrompt: marcusSystem,
          messages: marcusMessages,
        },
      };

      let marcusText = '';
      const marcusGen = streamAgent(marcusSystem, marcusMessages, model);
      for await (const chunk of marcusGen) {
        if (signal?.aborted) return;
        if (chunk.kind === 'text') {
          marcusText += chunk.text;
          yield { type: 'token', agent: 'Marcus', text: chunk.text };
        } else if (chunk.kind === 'retry') {
          yield { type: 'system', text: `API overloaded — retrying (${chunk.attempt} of ${chunk.max})...` };
        } else {
          cumulative.input += chunk.inputTokens;
          cumulative.output += chunk.outputTokens;
          yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
        }
      }
      const marcusStance = parseStance(marcusText);
      transcript.push({ speaker: 'Marcus', text: marcusText });
      lastMarcus = marcusStance;

      const resumeState: ResumeState = { transcript, round: round + 1, lastElena, lastMarcus };
      yield { type: 'turn-end', agent: 'Marcus', round, stance: marcusStance, resumeState };

      // --- Round summary (for UI) ---
      agreementHistory.push({ elena: lastElena!, marcus: lastMarcus });
      const agreementScore = calculateAgreementScore(lastElena!, lastMarcus);
      yield {
        type: 'round-summary',
        round,
        summary: {
          round,
          elena: lastElena!,
          marcus: lastMarcus,
          consensus: consensusReached(lastElena!, lastMarcus),
          agreementScore,
        },
      };

      // --- Blocked check: both agents have conviction 0 — missing data, can't proceed ---
      if (lastElena.conviction === 0 && lastMarcus.conviction === 0) {
        yield { type: 'system', text: 'Both agents are blocked — no ticker or critical data missing. Stopping debate.' };
        await saveDebateCost(tickers.join(',') || 'unknown', round, cumulative.input, cumulative.output, model);
        yield {
          type: 'escalation',
          text: '## ESCALATION — MISSING DATA\n\nBoth agents cannot proceed without a specific ticker and current price.\n\n**What they need:**\n- Which instrument? (e.g. TSLA, SPY, NVDA)\n- Current price or price level you\'re analyzing\n- Timeframe (daily, weekly?)\n\nPlease resubmit with a ticker symbol.',
          resumeState: { transcript, round, lastElena, lastMarcus },
        };
        return;
      }

      // --- Consensus check ---
      if (consensusReached(lastElena, lastMarcus)) {
        // Ask Elena to write the FINAL recommendation
        yield { type: 'system', text: '✓ Consensus reached. Elena will write the final recommendation.' };
        yield { type: 'turn-start', agent: 'Elena', round: round + 1 };
        const finalMessages = buildMessages('Elena');
        finalMessages.push({
          role: 'user',
          content: 'Consensus is reached. Now write the FINAL RECOMMENDATION block as specified in your instructions — Action, Direction, Conviction, Entry zone, Stop, Target(s), Position sizing note, Key risks, What invalidates the thesis.',
        });
        let finalText = '';
        const finalGen = streamAgent(elenaSystem, finalMessages, model);
        for await (const chunk of finalGen) {
          if (signal?.aborted) return;
          if (chunk.kind === 'text') {
            finalText += chunk.text;
            yield { type: 'token', agent: 'Elena', text: chunk.text };
          } else if (chunk.kind === 'retry') {
            yield { type: 'system', text: `API overloaded — retrying (${chunk.attempt} of ${chunk.max})...` };
          } else {
            cumulative.input += chunk.inputTokens;
            cumulative.output += chunk.outputTokens;
            yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
          }
        }
        transcript.push({ speaker: 'Elena', text: finalText });
        const finalResumeState: ResumeState = { transcript, round: round + 2, lastElena, lastMarcus };
        await saveDebateCost(tickers.join(',') || 'unknown', round, cumulative.input, cumulative.output, model);
        yield { type: 'final', text: finalText, resumeState: finalResumeState };
        return;
      }
    }

    // --- Max rounds hit without consensus → escalate ---
    yield { type: 'system', text: 'Max rounds reached without consensus. Escalating.' };
    const escalationMessages: ChatMessage[] = [
      { role: 'user', content: sharedContext },
      ...transcript.map(t => ({
        role: 'user' as const,
        content: `[${t.speaker}]: ${t.text}`,
      })),
      {
        role: 'user',
        content: 'You and Marcus could not reach consensus after 10 rounds. Write the ESCALATION block as specified — the two competing theses, the core disagreement, and what specific information or user input would resolve it.',
      },
    ];
    let escText = '';
    const escGen = streamAgent(loadFile('agents/agent-meanrev.md'), escalationMessages, model);
    for await (const chunk of escGen) {
      if (signal?.aborted) return;
      if (chunk.kind === 'text') {
        escText += chunk.text;
        yield { type: 'token', agent: 'Elena', text: chunk.text };
      } else if (chunk.kind === 'retry') {
        yield { type: 'system', text: `API overloaded — retrying (${chunk.attempt} of ${chunk.max})...` };
      } else {
        cumulative.input += chunk.inputTokens;
        cumulative.output += chunk.outputTokens;
        yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
      }
    }
    const escResumeState: ResumeState = { transcript, round: MAX_ROUNDS + 1, lastElena, lastMarcus };
    await saveDebateCost(tickers.join(',') || 'unknown', MAX_ROUNDS, cumulative.input, cumulative.output, model);
    yield { type: 'escalation', text: escText, resumeState: escResumeState };

  } catch (e: any) {
    let msg: string = e?.message || 'Unknown error';
    // Anthropic errors sometimes serialize as JSON strings — extract the human message
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.error?.message) msg = `API error: ${parsed.error.message}`;
      else if (parsed?.message) msg = parsed.message;
    } catch {}
    // Also handle structured error objects
    if (e?.error?.message) msg = `API error: ${e.error.message}`;
    yield { type: 'error', text: msg };
  }
}

export async function* runFollowUp(
  followUpQuestion: string,
  previousState: ResumeState,
  originalRequest: string,
  signal?: AbortSignal,
  model: string = 'claude-haiku-4-5-20251001',
): AsyncGenerator<DebateEvent> {
  try {
    const cumulative = { input: 0, output: 0 };

    const elenaPersona = loadFile('agents/agent-meanrev.md');
    const marcusPersona = loadFile('agents/agent-trend.md');
    const userProfile = loadFile('profile/user-profile.md');

    const sharedContext = `
## USER PROFILE
${userProfile}

## ORIGINAL USER REQUEST
${originalRequest}

## USER FOLLOW-UP QUESTION
${followUpQuestion}

Note: A final recommendation was already reached in the previous debate. The user is asking a follow-up question. Market data and technical analysis were discussed in the prior debate; build on that context.
`.trim();

    const transcript = [...previousState.transcript];
    const followUpRound = previousState.round;

    const buildMessages = (forAgent: 'Elena' | 'Marcus'): ChatMessage[] => {
      const msgs: ChatMessage[] = [{ role: 'user', content: sharedContext }];

      const FULL_WINDOW = 6;
      const older = transcript.slice(0, Math.max(0, transcript.length - FULL_WINDOW));
      const recent = transcript.slice(-FULL_WINDOW);

      if (older.length > 0) {
        const summary = older.map(e => {
          const stanceMatch = e.text.match(/STANCE:\s*(\w+).*?CONVICTION:\s*(\d+).*?AGREE_WITH_PARTNER:\s*(\w+)/s);
          if (stanceMatch) {
            return `[${e.speaker} — earlier: stance=${stanceMatch[1]}, conviction=${stanceMatch[2]}, agree=${stanceMatch[3]}]`;
          }
          return `[${e.speaker} — earlier turn (summarized)]`;
        }).join('\n');
        msgs.push({ role: 'user', content: `Previous rounds summary:\n${summary}` });
        msgs.push({ role: 'assistant', content: 'Understood. I will build on those prior positions.' });
      }

      for (const entry of recent) {
        if (entry.speaker === forAgent) {
          msgs.push({ role: 'assistant', content: entry.text });
        } else {
          msgs.push({ role: 'user', content: `[${entry.speaker} said]:\n${entry.text}` });
        }
      }

      if (msgs[msgs.length - 1].role === 'assistant') {
        msgs.push({ role: 'user', content: 'Address the user\'s follow-up question.' });
      }
      return msgs;
    };

    yield { type: 'system', text: `Follow-up: "${followUpQuestion}"` };

    // --- Elena responds to follow-up ---
    yield { type: 'turn-start', agent: 'Elena', round: followUpRound };
    const elenaSystem = `${elenaPersona}\n\n## FOLLOW-UP MODE\nA final recommendation was already reached. The user has a follow-up question. Address it directly, referencing the prior debate and Marcus\'s position. After Marcus responds, you will write an updated FINAL RECOMMENDATION.`;

    const elenaMessages = buildMessages('Elena');
    yield { type: 'debug', agent: 'Elena', round: followUpRound, debug: { systemPrompt: elenaSystem, messages: elenaMessages } };

    let elenaText = '';
    for await (const chunk of streamAgent(elenaSystem, elenaMessages, model)) {
      if (signal?.aborted) return;
      if (chunk.kind === 'text') {
        elenaText += chunk.text;
        yield { type: 'token', agent: 'Elena', text: chunk.text };
      } else if (chunk.kind === 'retry') {
        yield { type: 'system', text: `API overloaded — retrying (${chunk.attempt} of ${chunk.max})...` };
      } else {
        cumulative.input += chunk.inputTokens;
        cumulative.output += chunk.outputTokens;
        yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
      }
    }
    transcript.push({ speaker: 'Elena', text: elenaText });
    const elenaStance = parseStance(elenaText);
    yield { type: 'turn-end', agent: 'Elena', round: followUpRound, stance: elenaStance };

    // --- Marcus responds ---
    yield { type: 'turn-start', agent: 'Marcus', round: followUpRound };
    const marcusSystem = `${marcusPersona}\n\n## FOLLOW-UP MODE\nA final recommendation was reached. The user has a follow-up question and Elena has responded. React to her points in light of the follow-up question.`;

    const marcusMessages = buildMessages('Marcus');
    yield { type: 'debug', agent: 'Marcus', round: followUpRound, debug: { systemPrompt: marcusSystem, messages: marcusMessages } };

    let marcusText = '';
    for await (const chunk of streamAgent(marcusSystem, marcusMessages, model)) {
      if (signal?.aborted) return;
      if (chunk.kind === 'text') {
        marcusText += chunk.text;
        yield { type: 'token', agent: 'Marcus', text: chunk.text };
      } else if (chunk.kind === 'retry') {
        yield { type: 'system', text: `API overloaded — retrying (${chunk.attempt} of ${chunk.max})...` };
      } else {
        cumulative.input += chunk.inputTokens;
        cumulative.output += chunk.outputTokens;
        yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
      }
    }
    transcript.push({ speaker: 'Marcus', text: marcusText });
    const marcusStance = parseStance(marcusText);
    yield { type: 'turn-end', agent: 'Marcus', round: followUpRound, stance: marcusStance };

    // --- Elena writes updated FINAL ---
    yield { type: 'system', text: 'Writing updated final recommendation...' };
    yield { type: 'turn-start', agent: 'Elena', round: followUpRound + 1 };

    const finalMessages = buildMessages('Elena');
    finalMessages.push({
      role: 'user',
      content: 'Based on this follow-up discussion, write an updated ## FINAL RECOMMENDATION block — Action, Direction, Conviction, Entry zone, Stop, Target(s), Position sizing note, Key risks, What invalidates the thesis.',
    });

    let finalText = '';
    for await (const chunk of streamAgent(elenaSystem, finalMessages, model)) {
      if (signal?.aborted) return;
      if (chunk.kind === 'text') {
        finalText += chunk.text;
        yield { type: 'token', agent: 'Elena', text: chunk.text };
      } else if (chunk.kind === 'retry') {
        yield { type: 'system', text: `API overloaded — retrying (${chunk.attempt} of ${chunk.max})...` };
      } else {
        cumulative.input += chunk.inputTokens;
        cumulative.output += chunk.outputTokens;
        yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
      }
    }

    transcript.push({ speaker: 'Elena', text: finalText });
    const newResumeState: ResumeState = { transcript, round: followUpRound + 2, lastElena: elenaStance, lastMarcus: marcusStance };
    const tickers = extractTickers(originalRequest);
    await saveDebateCost(tickers.join(',') || 'unknown', followUpRound, cumulative.input, cumulative.output, model);
    yield { type: 'final', text: finalText, resumeState: newResumeState };

  } catch (e: any) {
    let msg: string = e?.message || 'Unknown error';
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.error?.message) msg = `API error: ${parsed.error.message}`;
      else if (parsed?.message) msg = parsed.message;
    } catch {}
    if (e?.error?.message) msg = `API error: ${e.error.message}`;
    yield { type: 'error', text: msg };
  }
}
