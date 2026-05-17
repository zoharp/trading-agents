import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AgentChunk =
  | { kind: 'text'; text: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number };

export async function* streamAgent(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string = 'claude-sonnet-4-6'
): AsyncGenerator<AgentChunk, void, void> {
  const stream = client.messages.stream({
    model: model as any,
    max_tokens: 1500,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
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
}
