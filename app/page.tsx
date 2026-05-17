'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type EventKind = 'system' | 'turn-start' | 'token' | 'turn-end' | 'usage' | 'final' | 'escalation' | 'error';

interface Turn {
  kind: 'system' | 'turn' | 'final' | 'escalation';
  agent?: 'Elena' | 'Marcus';
  round?: number;
  text: string;
  done: boolean;
}

interface Cost {
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const [cost, setCost] = useState<Cost>({ inputTokens: 0, outputTokens: 0, totalUsd: 0 });

  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUp = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnIdRef = useRef(0);

  // Smart scroll: track if user scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollHeight = el.scrollHeight;
      const scrollTop = el.scrollTop;
      const clientHeight = el.clientHeight;
      const distFromBottom = scrollHeight - scrollTop - clientHeight;
      userScrolledUp.current = distFromBottom > 80;
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll only if user is at bottom
  useEffect(() => {
    if (!userScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  async function submit() {
    if (!input.trim() || running) return;
    setRunning(true);
    setTurns([]);
    setCost({ inputTokens: 0, outputTokens: 0, totalUsd: 0 });
    userScrolledUp.current = false;
    turnIdRef.current = 0;

    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch('/api/debate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: input }),
      signal: controller.signal,
    });

    if (!res.body) {
      setRunning(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload) as any;
            handleEvent(evt);
          } catch {}
        }
      }
    } catch (e) {
      // Abort or error
    } finally {
      setTurns(prev => prev.map(t => ({ ...t, done: true })));
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleEvent(evt: any) {
    if (evt.type === 'usage') {
      // Update cost panel with token usage
      setCost({
        inputTokens: evt.totalInputTokens,
        outputTokens: evt.totalOutputTokens,
        totalUsd: (evt.totalInputTokens * 3 + evt.totalOutputTokens * 15) / 1_000_000,
      });
    }

    setTurns(prev => {
      const copy = [...prev];
      if (evt.type === 'system') {
        copy.push({ kind: 'system', text: evt.text || '', done: true });
      } else if (evt.type === 'turn-start' && evt.agent) {
        copy.push({ kind: 'turn', agent: evt.agent, round: evt.round, text: '', done: false });
      } else if (evt.type === 'token' && evt.agent) {
        const last = copy[copy.length - 1];
        if (last && last.agent === evt.agent && !last.done) {
          last.text += evt.text || '';
        }
      } else if (evt.type === 'turn-end') {
        const last = copy[copy.length - 1];
        if (last) last.done = true;
      } else if (evt.type === 'final') {
        copy.push({ kind: 'final', text: evt.text || '', done: true });
      } else if (evt.type === 'escalation') {
        copy.push({ kind: 'escalation', text: evt.text || '', done: true });
      } else if (evt.type === 'error') {
        copy.push({ kind: 'system', text: `ERROR: ${evt.text}`, done: true });
      }
      return copy;
    });
  }

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-[#e8e6e1]">
      <div className="flex gap-6 px-6 py-8 max-w-[1400px] mx-auto">
        {/* Main debate area */}
        <div className="flex-1 min-w-0">
          <header className="border-b border-[#2a2a2d] pb-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  <span className="text-[#d4a574]">two</span>
                  <span className="text-[#7a9eaf]">.desk</span>
                </h1>
                <p className="text-sm text-[#888] mt-1">Marcus (trend) vs. Elena (mean-rev, lead) — they debate, you decide.</p>
              </div>
              {running && (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="px-3 py-1 bg-[#d97474] text-[#0a0a0b] font-bold text-sm rounded hover:bg-[#e08585] transition-colors"
                >
                  STOP
                </button>
              )}
            </div>
          </header>

          {/* Debate feed */}
          <div ref={scrollRef} className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-4 mb-6">
            {turns.length === 0 && !running && (
              <div className="text-[#666] text-sm italic">
                Ask about a ticker or setup. e.g.{' '}
                <span className="text-[#d4a574]">"Should I take a swing long in NVDA here?"</span>
              </div>
            )}

            {(() => {
              const systemTurns = turns.filter(t => t.kind === 'system');
              const elenaTurns = turns.filter(t => t.kind === 'turn' && t.agent === 'Elena');
              const marcusTurns = turns.filter(t => t.kind === 'turn' && t.agent === 'Marcus');
              const specialTurns = turns.filter((t): t is Turn & { kind: 'final' | 'escalation' } => t.kind === 'final' || t.kind === 'escalation');

              const result: ReactNode[] = [];

              // System messages full-width
              for (const t of systemTurns) {
                result.push(
                  <div key={`system-${result.length}`} className="text-xs text-[#666] italic px-2">
                    — {t.text} —
                  </div>
                );
              }

              // Debate turns in alternating columns
              const maxRounds = Math.max(elenaTurns.length, marcusTurns.length);
              for (let i = 0; i < maxRounds; i++) {
                result.push(
                  <div key={`round-${i}`} className="grid grid-cols-2 gap-4">
                    {marcusTurns[i] && (
                      <div key={`marcus-${i}`}>
                        <ChatBubble
                          agent="Marcus"
                          text={marcusTurns[i].text}
                          done={marcusTurns[i].done}
                          round={marcusTurns[i].round}
                        />
                      </div>
                    )}
                    {elenaTurns[i] && (
                      <div key={`elena-${i}`} className="col-start-2">
                        <ChatBubble
                          agent="Elena"
                          text={elenaTurns[i].text}
                          done={elenaTurns[i].done}
                          round={elenaTurns[i].round}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              // Special messages full-width
              for (const t of specialTurns) {
                result.push(
                  <SpecialBubble key={`special-${result.length}`} kind={t.kind} text={t.text} />
                );
              }

              return result;
            })()}
          </div>

          {/* Input */}
          <div className="flex gap-2 border-t border-[#2a2a2d] pt-4">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={running}
              placeholder="What do you want the desk to look at?"
              rows={2}
              className="flex-1 bg-[#15151a] border border-[#2a2a2d] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#d4a574] disabled:opacity-50 resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button
              onClick={submit}
              disabled={running || !input.trim()}
              className="px-5 bg-[#d4a574] text-[#0a0a0b] font-bold text-sm rounded hover:bg-[#e0b585] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {running ? '...' : 'ASK'}
            </button>
          </div>
        </div>

        {/* Cost panel */}
        <div className="w-52 shrink-0">
          <CostPanel cost={cost} />
        </div>
      </div>
    </main>
  );
}

function ChatBubble({
  agent,
  text,
  done,
  round,
}: {
  agent: 'Elena' | 'Marcus';
  text: string;
  done: boolean;
  round?: number;
}) {
  const isElena = agent === 'Elena';
  const bgColor = isElena ? 'bg-[#1a1a1f]' : 'bg-[#15151a]';
  const color = isElena ? 'text-[#7a9eaf]' : 'text-[#d4a574]';

  return (
    <div className={`${bgColor} rounded p-3`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-sm font-bold ${color}`}>{agent}</span>
        {round && <span className="text-xs text-[#666]">round {round}</span>}
        {!done && <span className="text-xs text-[#666] animate-pulse">▌</span>}
      </div>
      <div className="text-sm leading-relaxed text-[#d8d6d1]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ inline, children, ...props }: any) =>
              inline ? (
                <code className="bg-[#2a2a2d] px-1 rounded text-[#d4a574]">{children}</code>
              ) : (
                <pre className="bg-[#0a0a0b] p-2 rounded my-2 overflow-x-auto">
                  <code>{children}</code>
                </pre>
              ),
            h2: ({ children }) => <h2 className="font-bold text-[#e8e6e1] mt-3 mb-1">{children}</h2>,
            h3: ({ children }) => <h3 className="font-bold text-[#d8d6d1] mt-2 mb-1">{children}</h3>,
            strong: ({ children }) => <strong className="text-[#e8e6e1]">{children}</strong>,
            ul: ({ children }) => <ul className="list-disc list-inside my-2">{children}</ul>,
            li: ({ children }) => <li className="ml-2">{children}</li>,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function SpecialBubble({ kind, text }: { kind: 'final' | 'escalation'; text: string }) {
  const isFinal = kind === 'final';
  const borderColor = isFinal ? 'border-[#5ab884]' : 'border-[#d97474]';
  const labelColor = isFinal ? 'text-[#5ab884]' : 'text-[#d97474]';
  const label = isFinal ? 'CONSENSUS' : 'NEEDS YOU';

  return (
    <div className={`border-l-4 ${borderColor} bg-[#15151a] rounded p-3`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-xs font-bold ${labelColor}`}>▸ {label}</span>
      </div>
      <div className="text-sm leading-relaxed text-[#d8d6d1]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ inline, children, ...props }: any) =>
              inline ? (
                <code className="bg-[#2a2a2d] px-1 rounded text-[#d4a574]">{children}</code>
              ) : (
                <pre className="bg-[#0a0a0b] p-2 rounded my-2 overflow-x-auto">
                  <code>{children}</code>
                </pre>
              ),
            h2: ({ children }) => <h2 className="font-bold text-[#e8e6e1] mt-3 mb-1">{children}</h2>,
            h3: ({ children }) => <h3 className="font-bold text-[#d8d6d1] mt-2 mb-1">{children}</h3>,
            strong: ({ children }) => <strong className="text-[#e8e6e1]">{children}</strong>,
            ul: ({ children }) => <ul className="list-disc list-inside my-2">{children}</ul>,
            li: ({ children }) => <li className="ml-2">{children}</li>,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function CostPanel({ cost }: { cost: Cost }) {
  return (
    <div className="sticky top-8 bg-[#15151a] border border-[#2a2a2d] rounded p-4 text-sm font-mono">
      <div className="text-xs font-bold text-[#888] mb-3 uppercase">Token Cost</div>
      <div className="space-y-2">
        <div>
          <span className="text-[#888]">Input:</span>
          <span className="float-right text-[#d8d6d1]">{cost.inputTokens.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-[#888]">Output:</span>
          <span className="float-right text-[#d8d6d1]">{cost.outputTokens.toLocaleString()}</span>
        </div>
        <div className="border-t border-[#2a2a2d] pt-2 mt-2">
          <span className="text-[#888]">Total:</span>
          <span className="float-right text-[#d4a574] font-bold">${cost.totalUsd.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
