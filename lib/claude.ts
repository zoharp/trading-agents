import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AgentChunk =
  | { kind: 'text'; text: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number }
  | { kind: 'retry'; attempt: number; max: number };

export async function* streamAgent(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string = 'claude-sonnet-4-6'
): AsyncGenerator<AgentChunk, void, void> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let started = false;
    try {
      const stream = client.messages.stream({
        model: model as any,
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          started = true;
          yield { kind: 'text', text: event.delta.text };
        }
      }

      try {
        const msg = await stream.finalMessage();
        yield {
          kind: 'usage',
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
        };
      } catch {
        // Stream was aborted, skip usage
      }

      return;
    } catch (e: any) {
      const isOverloaded =
        e?.status === 529 ||
        e?.error?.type === 'overloaded_error' ||
        e?.error?.error?.type === 'overloaded_error' ||
        (typeof e?.message === 'string' && e.message.includes('overloaded_error'));
      if (isOverloaded && !started && attempt < MAX_RETRIES) {
        console.log(`[claude] overloaded, retry ${attempt + 1}/${MAX_RETRIES}`);
        yield { kind: 'retry', attempt: attempt + 1, max: MAX_RETRIES };
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      console.log(`[claude] error (attempt ${attempt}): status=${e?.status} type=${e?.error?.type}`, e?.message?.substring?.(0, 120));
      throw e;
    }
  }
}
