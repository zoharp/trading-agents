import { runDebate, ResumeState } from '@/lib/orchestrator';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for the debate

export async function POST(req: NextRequest) {
  const { request: userRequest, model = 'claude-sonnet-4-6', resumeFrom } = await req.json();
  if (!userRequest || typeof userRequest !== 'string') {
    return new Response('Missing request', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runDebate(userRequest, req.signal, model, resumeFrom as ResumeState | undefined)) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (e) {
        const errData = `data: ${JSON.stringify({ type: 'error', text: (e as Error).message })}\n\n`;
        controller.enqueue(encoder.encode(errData));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
