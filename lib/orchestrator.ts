import { streamAgent, ChatMessage, AgentChunk } from './claude';
import { getTechnicalSnapshot, extractTickers, TechnicalSnapshot } from './market-data';
import fs from 'fs';
import path from 'path';

const MAX_ROUNDS = 10;

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

function loadFile(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

export interface DebateEvent {
  type: 'system' | 'turn-start' | 'token' | 'turn-end' | 'usage' | 'final' | 'escalation' | 'error';
  agent?: 'Elena' | 'Marcus';
  round?: number;
  text?: string;
  stance?: StanceBlock;
  marketData?: Record<string, TechnicalSnapshot>;
  inputTokens?: number;
  outputTokens?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
}

export async function* runDebate(userRequest: string, signal?: AbortSignal): AsyncGenerator<DebateEvent> {
  try {
    const cumulative = { input: 0, output: 0 };
    // 1. Load personas + profile
    const elenaPersona = loadFile('agents/agent-meanrev.md');
    const marcusPersona = loadFile('agents/agent-trend.md');
    const userProfile = loadFile('profile/user-profile.md');

    // 2. Fetch market data for any tickers in the request
    const tickers = extractTickers(userRequest);
    const marketData: Record<string, TechnicalSnapshot> = {};
    if (tickers.length > 0) {
      yield { type: 'system', text: `Fetching market data for: ${tickers.join(', ')}...` };
      for (const t of tickers) {
        try {
          marketData[t] = await getTechnicalSnapshot(t);
        } catch (e) {
          yield { type: 'system', text: `Could not fetch ${t}: ${(e as Error).message}` };
        }
      }
    }
    yield { type: 'system', text: 'Market data ready. Starting debate.', marketData };

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
    const transcript: { speaker: 'Elena' | 'Marcus'; text: string }[] = [];

    const buildMessages = (forAgent: 'Elena' | 'Marcus'): ChatMessage[] => {
      const msgs: ChatMessage[] = [{ role: 'user', content: sharedContext }];
      for (const entry of transcript) {
        if (entry.speaker === forAgent) {
          msgs.push({ role: 'assistant', content: entry.text });
        } else {
          msgs.push({ role: 'user', content: `[${entry.speaker} said]:\n${entry.text}` });
        }
      }
      // Ensure last message is from "user" (the partner)
      if (msgs[msgs.length - 1].role === 'assistant') {
        msgs.push({ role: 'user', content: 'Continue the debate.' });
      }
      return msgs;
    };

    let lastElena: StanceBlock | null = null;
    let lastMarcus: StanceBlock | null = null;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      // --- Elena's turn (lead opens) ---
      yield { type: 'turn-start', agent: 'Elena', round };
      const elenaMessages = buildMessages('Elena');
      const elenaSystem = `${elenaPersona}\n\n## CONTEXT FOR THIS DEBATE\nYou are debating with Marcus Vance (trend/momentum trader). This is round ${round} of max ${MAX_ROUNDS}. ${round === 1 ? 'Open with your initial analysis based on the market data.' : 'Respond to Marcus\'s last message specifically.'}`;
      let elenaText = '';
      const elenaGen = streamAgent(elenaSystem, elenaMessages);
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
      let marcusText = '';
      const marcusGen = streamAgent(marcusSystem, marcusMessages);
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
      yield { type: 'turn-end', agent: 'Marcus', round, stance: marcusStance };

      // --- Consensus check ---
      if (consensusReached(lastElena, lastMarcus)) {
        // Ask Elena to write the FINAL recommendation
        yield { type: 'system', text: 'Consensus reached. Elena will write the final recommendation.' };
        yield { type: 'turn-start', agent: 'Elena', round: round + 1 };
        const finalMessages = buildMessages('Elena');
        finalMessages.push({
          role: 'user',
          content: 'Consensus is reached. Now write the FINAL RECOMMENDATION block as specified in your instructions — Action, Direction, Conviction, Entry zone, Stop, Target(s), Position sizing note, Key risks, What invalidates the thesis.',
        });
        let finalText = '';
        const finalGen = streamAgent(elenaSystem, finalMessages);
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
    const escGen = streamAgent(loadFile('agents/agent-meanrev.md'), escalationMessages);
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
    yield { type: 'escalation', text: escText };

  } catch (e) {
    yield { type: 'error', text: (e as Error).message };
  }
}
