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

function saveDebateCost(ticker: string, rounds: number, inputTokens: number, outputTokens: number, model: string) {
  try {
    const costFile = path.join(process.cwd(), '.cache', 'debate-costs.json');
    const dir = path.dirname(costFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let costs: any[] = [];
    if (fs.existsSync(costFile)) {
      costs = JSON.parse(fs.readFileSync(costFile, 'utf-8'));
    }

    const costUsd = getCostUsd(inputTokens, outputTokens, model);
    costs.push({
      timestamp: new Date().toISOString(),
      ticker,
      rounds,
      inputTokens,
      outputTokens,
      costUsd,
      model,
    });

    fs.writeFileSync(costFile, JSON.stringify(costs, null, 2));
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
      ? `## CURRENT MARKET DATA\n\`\`\`json\n${JSON.stringify(marketData, null, 2)}\n\`\`\``
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
          } else {
            cumulative.input += chunk.inputTokens;
            cumulative.output += chunk.outputTokens;
            yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
          }
        }
        saveDebateCost(tickers.join(',') || 'unknown', round, cumulative.input, cumulative.output, model);
        yield { type: 'final', text: finalText };
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
      } else {
        cumulative.input += chunk.inputTokens;
        cumulative.output += chunk.outputTokens;
        yield { type: 'usage', totalInputTokens: cumulative.input, totalOutputTokens: cumulative.output };
      }
    }
    saveDebateCost(tickers.join(',') || 'unknown', MAX_ROUNDS, cumulative.input, cumulative.output, model);
    yield { type: 'escalation', text: escText };

  } catch (e) {
    yield { type: 'error', text: (e as Error).message };
  }
}
