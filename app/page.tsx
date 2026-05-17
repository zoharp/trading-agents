'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type EventKind = 'system' | 'turn-start' | 'token' | 'turn-end' | 'usage' | 'final' | 'escalation' | 'error';

interface Stance {
  stance: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  conviction: number;
  agree: 'yes' | 'no' | 'partial' | 'unknown';
  disagreement: string;
}

interface Turn {
  kind: 'system' | 'turn' | 'summary' | 'final' | 'escalation';
  agent?: 'Elena' | 'Marcus';
  round?: number;
  text: string;
  done: boolean;
  stance?: Stance;
  summary?: {
    round: number;
    elena: Stance;
    marcus: Stance;
    consensus: boolean;
    agreementScore: number;
  };
  resumeState?: any;
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
  const [sessionCostTotal, setSessionCostTotal] = useState<number>(0);
  const [model, setModel] = useState<string>('claude-sonnet-4-6');
  const [canResume, setCanResume] = useState<boolean>(false);
  const [resumeState, setResumeState] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<{ systemPrompt: string; messages: any[] } | null>(null);
  const [showDebug, setShowDebug] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUp = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnIdRef = useRef(0);

  // Load session cost total on mount
  useEffect(() => {
    async function loadSessionCost() {
      try {
        const res = await fetch('/api/debate-costs');
        if (res.ok) {
          const data = await res.json();
          const total = data.costs?.reduce((sum: number, c: any) => sum + c.costUsd, 0) || 0;
          setSessionCostTotal(total);
        }
      } catch (e) {
        // Ignore errors
      }
    }
    loadSessionCost();
  }, []);

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
    if (!resumeState) {
      setTurns([]);
      setCost({ inputTokens: 0, outputTokens: 0, totalUsd: 0 });
      setCanResume(false);
    }
    userScrolledUp.current = false;
    turnIdRef.current = 0;

    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch('/api/debate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: resumeState ? `Continue debate: ${input}` : input,
        model,
        resumeFrom: resumeState,
      }),
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

      // Reload session cost
      async function reloadCost() {
        try {
          const res = await fetch('/api/debate-costs');
          if (res.ok) {
            const data = await res.json();
            const total = data.costs?.reduce((sum: number, c: any) => sum + c.costUsd, 0) || 0;
            setSessionCostTotal(total);
          }
        } catch {}
      }
      reloadCost();
    }
  }

  function deduplicateText(text: string): string {
    // Split into sentences (split on . ! ? followed by space)
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const normalized = sentences[i].trim().toLowerCase();
      // Skip if we've seen this exact sentence recently (within last 3 sentences)
      let isDuplicate = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (seen.has(sentences[j].trim().toLowerCase())) {
          if (normalized === sentences[j].trim().toLowerCase()) {
            isDuplicate = true;
            break;
          }
        }
      }
      if (!isDuplicate) {
        deduped.push(sentences[i]);
        seen.add(normalized);
      }
    }

    return deduped.join(' ');
  }

  function handleEvent(evt: any) {
    if (evt.type === 'debug') {
      setDebugInfo(evt.debug);
      setShowDebug(true);
      return;
    }

    if (evt.type === 'usage') {
      // Update cost panel with token usage (calculate based on model)
      const pricing: Record<string, [number, number]> = {
        'claude-opus-4-7': [15, 75],
        'claude-sonnet-4-6': [3, 15],
        'claude-haiku-4-5-20251001': [0.8, 4],
      };
      const [inputPrice, outputPrice] = pricing[model] || [3, 15];
      setCost({
        inputTokens: evt.totalInputTokens,
        outputTokens: evt.totalOutputTokens,
        totalUsd: (evt.totalInputTokens * inputPrice + evt.totalOutputTokens * outputPrice) / 1_000_000,
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
      } else if (evt.type === 'turn-end' && evt.stance) {
        const last = copy[copy.length - 1];
        if (last) {
          last.done = true;
          last.stance = evt.stance;
          last.text = deduplicateText(last.text);
          if (evt.resumeState) {
            last.resumeState = evt.resumeState;
            setResumeState(evt.resumeState);
            setCanResume(true);
          }
        }
      } else if (evt.type === 'round-summary' && evt.summary) {
        copy.push({ kind: 'summary', round: evt.summary.round, text: '', done: true, summary: evt.summary });
      } else if (evt.type === 'final') {
        copy.push({ kind: 'final', text: deduplicateText(evt.text || ''), done: true });
        setCanResume(false);
        setResumeState(null);
      } else if (evt.type === 'escalation') {
        copy.push({ kind: 'escalation', text: deduplicateText(evt.text || ''), done: true });
        setCanResume(false);
        setResumeState(null);
      } else if (evt.type === 'error') {
        copy.push({ kind: 'system', text: `ERROR: ${evt.text}`, done: true });
      }
      return copy;
    });
  }

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-[#e8e6e1]">
      <div className="flex gap-6 px-6 py-8 max-w-full mx-auto">
        {/* Main debate area */}
        <div className="flex-1 min-w-0">
          <header className="border-b border-[#2a2a2d] pb-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  <span className="text-[#d4a574]">two</span>
                  <span className="text-[#7a9eaf]">.desk</span>
                </h1>
                <p className="text-sm text-[#888] mt-1">Marcus (trend) vs. Elena (mean-rev, lead) — they debate, you decide.</p>
              </div>
              <div className="flex gap-2">
                {running && (
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="px-3 py-1 bg-[#d97474] text-[#0a0a0b] font-bold text-sm rounded hover:bg-[#e08585] transition-colors"
                  >
                    STOP
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-4 items-center">
              <div>
                <label className="text-xs text-[#888] block mb-1">Model</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  disabled={running}
                  className="bg-[#15151a] border border-[#2a2a2d] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#d4a574] disabled:opacity-50"
                >
                  <option value="claude-opus-4-7">Opus 4.7</option>
                  <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                  <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                </select>
              </div>
              {canResume && (
                <button
                  onClick={() => {
                    setInput('Continue...');
                    submit();
                  }}
                  disabled={running}
                  className="px-3 py-1 bg-[#5ab884] text-[#0a0a0b] font-bold text-xs rounded hover:bg-[#6ac992] disabled:opacity-50 transition-colors"
                >
                  RESUME
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
              const result: ReactNode[] = [];
              for (const turn of turns) {
                if (turn.kind === 'system') {
                  result.push(
                    <div key={`system-${result.length}`} className="text-xs text-[#666] italic px-2">
                      — {turn.text} —
                    </div>
                  );
                } else if (turn.kind === 'turn') {
                  const isElena = turn.agent === 'Elena';
                  const colStart = isElena ? 'col-start-2' : '';
                  result.push(
                    <div key={`turn-${result.length}`} className={`grid grid-cols-2 gap-4 ${colStart ? '' : ''}`}>
                      <div className={isElena ? 'col-start-2' : ''}>
                        <ChatBubble
                          agent={turn.agent!}
                          text={turn.text}
                          done={turn.done}
                          round={turn.round}
                          stance={turn.stance}
                        />
                      </div>
                    </div>
                  );
                } else if (turn.kind === 'summary' && turn.summary) {
                  result.push(
                    <RoundSummary key={`summary-${turn.round}`} summary={turn.summary} />
                  );
                } else if (turn.kind === 'final' || turn.kind === 'escalation') {
                  result.push(
                    <SpecialBubble key={`special-${result.length}`} kind={turn.kind} text={turn.text} />
                  );
                }
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

        {/* Right sidebar: Cost panel + Debug */}
        <div className="w-96 shrink-0 flex flex-col gap-4">
          <CostPanel cost={cost} sessionTotal={sessionCostTotal} />

          {/* Debug toggle button */}
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="px-3 py-1 bg-[#2a2a2d] text-[#888] hover:text-[#d4a574] text-xs font-bold rounded transition-colors"
          >
            {showDebug ? '▼ CLAUDE INPUT' : '▶ CLAUDE INPUT'}
          </button>

          {/* Debug panel */}
          {showDebug && debugInfo && (
            <div className="bg-[#15151a] border border-[#2a2a2d] rounded p-3 text-xs font-mono overflow-hidden flex flex-col max-h-96">
              <div className="font-bold text-[#d4a574] mb-2">System Prompt (first 500 chars)</div>
              <div className="bg-[#0a0a0b] p-2 rounded mb-3 text-[#888] overflow-y-auto max-h-32 whitespace-pre-wrap break-words text-[10px]">
                {debugInfo.systemPrompt.substring(0, 500)}...
              </div>

              <div className="font-bold text-[#7a9eaf] mb-2">Messages</div>
              <div className="bg-[#0a0a0b] p-2 rounded overflow-y-auto max-h-40 text-[#888] text-[10px]">
                {debugInfo.messages.map((msg, i) => (
                  <div key={i} className="mb-2">
                    <span className="text-[#d4a574]">[{msg.role.toUpperCase()}]</span>
                    <div className="ml-2 whitespace-pre-wrap break-words">
                      {msg.content.substring(0, 200)}
                      {msg.content.length > 200 ? '...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
  stance,
}: {
  agent: 'Elena' | 'Marcus';
  text: string;
  done: boolean;
  round?: number;
  stance?: Stance;
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

function RoundSummary({ summary }: { summary: { round: number; elena: Stance; marcus: Stance; consensus: boolean; agreementScore: number } }) {
  const getStanceColor = (stance: string) => {
    switch (stance) {
      case 'bullish': return 'text-[#5ab884]';
      case 'bearish': return 'text-[#d97474]';
      case 'neutral': return 'text-[#d4a574]';
      default: return 'text-[#888]';
    }
  };

  const getAgreementLabel = (score: number) => {
    if (score >= 80) return { text: 'Strong agreement', color: 'text-[#5ab884]' };
    if (score >= 60) return { text: 'Partial agreement', color: 'text-[#d4a574]' };
    if (score >= 40) return { text: 'Moderate difference', color: 'text-[#d4a574]' };
    return { text: 'Significant difference', color: 'text-[#d97474]' };
  };

  const agreementLabel = getAgreementLabel(summary.agreementScore);

  return (
    <div className="my-2 bg-[#15151a] border border-[#2a2a2d] rounded p-3">
      <div className="text-xs font-bold text-[#888] mb-2">Round {summary.round} Status</div>
      <div className="grid grid-cols-2 gap-4 text-xs">
        {/* Elena */}
        <div className="space-y-1">
          <div className="font-bold text-[#7a9eaf]">Elena</div>
          <div className={`${getStanceColor(summary.elena.stance)} font-bold`}>{summary.elena.stance}</div>
          <div className="text-[#888]">Conv: {summary.elena.conviction}/10</div>
          <div className={summary.elena.agree === 'yes' ? 'text-[#5ab884]' : summary.elena.agree === 'partial' ? 'text-[#d4a574]' : 'text-[#d97474]'}>
            {summary.elena.agree === 'yes' ? '✓ Agrees' : summary.elena.agree === 'partial' ? '⊕ Partial' : '✗ Disagrees'}
          </div>
        </div>
        {/* Marcus */}
        <div className="space-y-1">
          <div className="font-bold text-[#d4a574]">Marcus</div>
          <div className={`${getStanceColor(summary.marcus.stance)} font-bold`}>{summary.marcus.stance}</div>
          <div className="text-[#888]">Conv: {summary.marcus.conviction}/10</div>
          <div className={summary.marcus.agree === 'yes' ? 'text-[#5ab884]' : summary.marcus.agree === 'partial' ? 'text-[#d4a574]' : 'text-[#d97474]'}>
            {summary.marcus.agree === 'yes' ? '✓ Agrees' : summary.marcus.agree === 'partial' ? '⊕ Partial' : '✗ Disagrees'}
          </div>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-[#2a2a2d]">
        <div className={`text-xs font-bold ${agreementLabel.color}`}>
          {summary.consensus ? '✓ CONSENSUS' : `${agreementLabel.text} (${summary.agreementScore}%)`}
        </div>
      </div>
    </div>
  );
}

function CostPanel({ cost, sessionTotal }: { cost: Cost; sessionTotal: number }) {
  return (
    <div className="sticky top-8 bg-[#15151a] border border-[#2a2a2d] rounded p-4 text-sm font-mono space-y-4">
      <div>
        <div className="text-xs font-bold text-[#888] mb-3 uppercase">Current Debate</div>
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
      <div className="border-t border-[#2a2a2d] pt-4">
        <div className="text-xs font-bold text-[#888] mb-2 uppercase">Session Total</div>
        <div>
          <span className="text-[#888]">All debates:</span>
          <span className="float-right text-[#5ab884] font-bold">${sessionTotal.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
