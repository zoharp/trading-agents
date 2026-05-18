'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type EventKind = 'system' | 'turn-start' | 'token' | 'turn-end' | 'usage' | 'final' | 'escalation' | 'error';

function normForDedup(s: string): string {
  return s
    .replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/gm, '')
    .toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Only catches the specific model-restart pattern: a prefix repeats immediately on the same line.
// e.g. "TSLA $400 CSP, June 18 TSLA $400 CSP, June 18 — more context"
// Uses a high minLen (30) to avoid false positives in dense financial text.
function deduplicateLine(line: string): string {
  const minLen = 30;
  if (line.length < minLen * 2) return line;
  for (let checkLen = minLen; checkLen <= Math.floor(line.length / 2); checkLen++) {
    const prefix = line.substring(0, checkLen);
    const rest = line.substring(checkLen).trimStart();
    if (rest.startsWith(prefix)) return deduplicateLine(rest);
  }
  return line;
}

// Conservative dedup: exact normalized line matching only.
// No fuzzy/Jaccard — financial text shares too many terms and triggers false positives.
function deduplicateText(text: string): string {
  const lines = text.split('\n');
  const seenNorm = new Set<string>();
  const out: string[] = [];

  for (const rawLine of lines) {
    const line = deduplicateLine(rawLine);
    const norm = normForDedup(line);
    if (norm.length >= 30) {
      if (seenNorm.has(norm)) continue;
      seenNorm.add(norm);
    }
    out.push(line);
  }

  return out.join('\n');
}

const NUM_SPLIT = /(-?\$?(?:\d[\d,]*)(?:\.\d+)?%?)/g;
const NUM_TEST = /^-?\$?(?:\d[\d,]*)(?:\.\d+)?%?$/;

function NumberHighlight({ text }: { text: string }) {
  const parts = text.split(NUM_SPLIT);
  return (
    <>
      {parts.map((part, i) =>
        NUM_TEST.test(part) && /\d/.test(part) ? (
          <span key={i} className="text-[#7ec4cf] font-medium">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function colorizeChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') return <NumberHighlight text={children} />;
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === 'string' ? <NumberHighlight key={i} text={child} /> : child
    );
  }
  return children;
}

interface MarketSnapshot {
  symbol: string;
  asOf: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  high52w: number;
  low52w: number;
  ema20: number;
  sma50: number;
  sma200: number;
  rsi14: number;
  macd: { macd: number; signal: number; hist: number };
  bollinger: { upper: number; mid: number; lower: number; pctB: number };
  atr14: number;
  obv: number;
  obvTrend: 'rising' | 'falling';
  cmf: number;
  accumulationScore: number;
  regime: string;
  trendStructure: string;
  // slow_data fields
  earningsDate?: string;
  earningsDaysAway?: number;
  earningsSoon?: boolean;
  analystTarget?: number;
  analystRecommendation?: string;
  analystCount?: number;
  peRatio?: number;
  cashDebtRatio?: number;
  cashDebtLabel?: string;
  sector?: string;
  putCallRatio?: number;
  putCallLabel?: string;
  shortPct?: number;
  shortLabel?: string;
  insiderSignal?: string;
  insiderDetail?: string;
  googleTrendsCurrent?: number;
  googleTrendsChange?: number;
  googleTrendsLabel?: string;
  stockReturn30d?: number;
  spyReturn30d?: number;
  alphaVsSpy?: number;
  trendDirection?: string;
  industryAlpha?: number;
  industryEtfName?: string;
  support20d?: number;
  resistance20d?: number;
  safeStrike?: number;
}

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
  const [model, setModel] = useState<string>('claude-haiku-4-5-20251001');
  const [canResume, setCanResume] = useState<boolean>(false);
  const [resumeState, setResumeState] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<{ systemPrompt: string; messages: any[] } | null>(null);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [marketData, setMarketData] = useState<Record<string, MarketSnapshot> | null>(null);
  const [currentQuery, setCurrentQuery] = useState<string>('');
  const [allDebugInfo, setAllDebugInfo] = useState<Array<{ agent: string; round: number; systemPrompt: string; messages: any[] }>>([]);

  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUp = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnIdRef = useRef(0);
  const currentDebateCostRef = useRef(0);

  // Load historical session cost on mount (file total, not accumulating during this browser session)
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
      currentDebateCostRef.current = 0;
      setCurrentQuery(input.trim());
      setAllDebugInfo([]);
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
      // Accumulate this debate's cost into session total
      setSessionCostTotal(prev => prev + currentDebateCostRef.current);
    }
  }

  function handleEvent(evt: any) {
    if (evt.type === 'debug') {
      setDebugInfo(evt.debug);
      // Accumulate every turn's prompt for export (don't auto-open the panel)
      setAllDebugInfo(prev => [...prev, {
        agent: evt.agent || '?',
        round: evt.round || 0,
        systemPrompt: evt.debug.systemPrompt,
        messages: evt.debug.messages,
      }]);
      return;
    }

    if (evt.type === 'usage') {
      const pricing: Record<string, [number, number]> = {
        'claude-opus-4-7': [15, 75],
        'claude-sonnet-4-6': [3, 15],
        'claude-haiku-4-5-20251001': [0.8, 4],
      };
      const [inputPrice, outputPrice] = pricing[model] || [3, 15];
      const totalUsd = (evt.totalInputTokens * inputPrice + evt.totalOutputTokens * outputPrice) / 1_000_000;
      currentDebateCostRef.current = totalUsd;
      setCost({ inputTokens: evt.totalInputTokens, outputTokens: evt.totalOutputTokens, totalUsd });
    }

    if (evt.type === 'system' && evt.marketData) {
      setMarketData(evt.marketData as Record<string, MarketSnapshot>);
    }

    setTurns(prev => {
      if (evt.type === 'system') {
        return [...prev, { kind: 'system', text: evt.text || '', done: true }];
      }
      if (evt.type === 'turn-start' && evt.agent) {
        return [...prev, { kind: 'turn', agent: evt.agent, round: evt.round, text: '', done: false }];
      }
      if (evt.type === 'token' && evt.agent) {
        const idx = prev.length - 1;
        const last = prev[idx];
        if (!last || last.agent !== evt.agent || last.done) return prev;
        // Create new object — never mutate; StrictMode calls updaters twice with same prev
        return [...prev.slice(0, idx), { ...last, text: last.text + (evt.text || '') }];
      }
      if (evt.type === 'turn-end' && evt.stance) {
        const idx = prev.length - 1;
        const last = prev[idx];
        if (!last) return prev;
        const updated: Turn = { ...last, done: true, stance: evt.stance, text: deduplicateText(last.text) };
        if (evt.resumeState) {
          updated.resumeState = evt.resumeState;
          setResumeState(evt.resumeState);
          setCanResume(true);
        }
        return [...prev.slice(0, idx), updated];
      }
      if (evt.type === 'round-summary' && evt.summary) {
        return [...prev, { kind: 'summary', round: evt.summary.round, text: '', done: true, summary: evt.summary }];
      }
      if (evt.type === 'final') {
        setCanResume(false);
        setResumeState(null);
        // The final text was already streamed as an Elena turn bubble — remove it before adding the SpecialBubble
        const last = prev[prev.length - 1];
        const base = (last?.kind === 'turn' && last?.agent === 'Elena') ? prev.slice(0, -1) : prev;
        return [...base, { kind: 'final', text: deduplicateText(evt.text || ''), done: true }];
      }
      if (evt.type === 'escalation') {
        setCanResume(false);
        setResumeState(null);
        const last = prev[prev.length - 1];
        const base = (last?.kind === 'turn' && last?.agent === 'Elena') ? prev.slice(0, -1) : prev;
        return [...base, { kind: 'escalation', text: deduplicateText(evt.text || ''), done: true }];
      }
      if (evt.type === 'error') {
        return [...prev, { kind: 'system', text: `ERROR: ${evt.text}`, done: true }];
      }
      return prev;
    });
  }

  function buildMarkdown(includePrompts = false): string {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const lines: string[] = [];

    lines.push(`# two.desk Debate Export`);
    lines.push(`**Date:** ${now}  `);
    lines.push(`**Question:** ${input}  `);
    lines.push(`**Model:** ${model}  `);
    lines.push('');
    lines.push('---');
    lines.push('');

    if (marketData && Object.keys(marketData).length > 0) {
      lines.push('## Market Data');
      lines.push('');
      for (const s of Object.values(marketData)) {
        lines.push(`### ${s.symbol}`);
        lines.push(`**As of:** ${s.asOf}  `);
        lines.push(`**Price:** $${s.price.toFixed(2)} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%)  `);
        lines.push(`**52w Range:** $${s.low52w} – $${s.high52w}  `);
        lines.push('');
        lines.push('| Indicator | Value |');
        lines.push('|-----------|-------|');
        lines.push(`| RSI (14) | ${s.rsi14} |`);
        lines.push(`| MACD | ${s.macd.macd.toFixed(3)} |`);
        lines.push(`| MACD Signal | ${s.macd.signal.toFixed(3)} |`);
        lines.push(`| MACD Hist | ${s.macd.hist >= 0 ? '+' : ''}${s.macd.hist.toFixed(3)} |`);
        lines.push(`| EMA20 | $${s.ema20} |`);
        lines.push(`| SMA50 | $${s.sma50} |`);
        lines.push(`| SMA200 | $${s.sma200} |`);
        lines.push(`| BB Upper | $${s.bollinger.upper} |`);
        lines.push(`| BB Mid | $${s.bollinger.mid} |`);
        lines.push(`| BB Lower | $${s.bollinger.lower} |`);
        lines.push(`| BB% | ${(s.bollinger.pctB * 100).toFixed(0)}% |`);
        lines.push(`| ATR (14) | $${s.atr14} |`);
        lines.push(`| Volume | ${s.volume?.toLocaleString() ?? 'n/a'} |`);
        lines.push(`| Avg Vol (20d) | ${s.avgVolume?.toLocaleString() ?? 'n/a'} |`);
        lines.push('');
        lines.push(`**Regime:** ${s.regime}  `);
        lines.push(`**Trend:** ${s.trendStructure}  `);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }

    lines.push('## Debate Transcript');
    lines.push('');

    let currentRound = 0;
    for (const turn of turns) {
      if (turn.kind === 'system') {
        lines.push(`> *${turn.text}*`);
        lines.push('');
      } else if (turn.kind === 'turn') {
        if (turn.round && turn.round !== currentRound) {
          currentRound = turn.round;
          lines.push(`### Round ${currentRound}`);
          lines.push('');
        }
        const label = turn.agent === 'Elena' ? '**Elena** *(mean reversion, lead)*' : '**Marcus** *(trend/momentum)*';
        lines.push(`#### ${label}`);
        lines.push('');
        lines.push(turn.text);
        lines.push('');
        if (turn.stance) {
          lines.push(`> **STANCE:** ${turn.stance.stance} | **CONVICTION:** ${turn.stance.conviction}/10 | **AGREE:** ${turn.stance.agree}`);
          if (turn.stance.disagreement && turn.stance.disagreement !== 'none') {
            lines.push(`> **KEY DISAGREEMENT:** ${turn.stance.disagreement}`);
          }
          lines.push('');
        }
      } else if (turn.kind === 'summary' && turn.summary) {
        const s = turn.summary;
        lines.push(`**Round ${s.round} Result:** ${s.consensus ? '✓ CONSENSUS REACHED' : `${s.agreementScore}% agreement`}`);
        lines.push(`- Elena: ${s.elena.stance}, conviction ${s.elena.conviction}/10, ${s.elena.agree}`);
        lines.push(`- Marcus: ${s.marcus.stance}, conviction ${s.marcus.conviction}/10, ${s.marcus.agree}`);
        lines.push('');
        lines.push('---');
        lines.push('');
      } else if (turn.kind === 'final') {
        lines.push('## Final Recommendation');
        lines.push('');
        lines.push(turn.text);
        lines.push('');
      } else if (turn.kind === 'escalation') {
        lines.push('## Escalation — No Consensus');
        lines.push('');
        lines.push(turn.text);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
    lines.push('## Cost');
    lines.push('');
    lines.push('| | Tokens | Cost |');
    lines.push('|---|---|---|');
    lines.push(`| Input | ${cost.inputTokens.toLocaleString()} | |`);
    lines.push(`| Output | ${cost.outputTokens.toLocaleString()} | |`);
    lines.push(`| **Total** | | **$${cost.totalUsd.toFixed(4)}** |`);
    lines.push('');

    if (includePrompts && allDebugInfo.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Claude Prompts (All Turns)');
      lines.push('');
      for (const d of allDebugInfo) {
        lines.push(`### ${d.agent} — Round ${d.round}`);
        lines.push('');
        lines.push('**System Prompt:**');
        lines.push('');
        lines.push('```');
        lines.push(d.systemPrompt);
        lines.push('```');
        lines.push('');
        lines.push('**Messages:**');
        lines.push('');
        for (const msg of d.messages) {
          lines.push(`**[${msg.role.toUpperCase()}]**`);
          lines.push('```');
          lines.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2));
          lines.push('```');
          lines.push('');
        }
        lines.push('---');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  function downloadMarkdown(includePrompts = false) {
    const md = buildMarkdown(includePrompts);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ticker = marketData ? Object.keys(marketData).join('-') : 'debate';
    const date = new Date().toISOString().split('T')[0];
    const suffix = includePrompts ? '-with-prompts' : '';
    a.href = url;
    a.download = `two-desk-${ticker}-${date}${suffix}.md`;
    a.click();
    URL.revokeObjectURL(url);
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
              <div className="flex gap-2 items-center">
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
            {currentQuery && (turns.length > 0 || running) && (
              <div className="bg-[#1a1610] border border-[#3a2e1a] rounded px-4 py-3">
                <div className="text-[10px] text-[#888] uppercase font-bold mb-1">Your question</div>
                <div className="text-sm text-[#e8c98a]">{currentQuery}</div>
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

        {/* Right sidebar: Market data + Cost panel + Debug */}
        <div className="w-96 shrink-0 flex flex-col gap-4">
          {marketData && <MarketDataPanel data={marketData} />}
          <CostPanel cost={cost} sessionTotal={sessionCostTotal + (running ? cost.totalUsd : 0)} />

          {/* Export panel — always visible */}
          <div className="bg-[#15151a] border border-[#2a2a2d] rounded p-4 space-y-2">
            <div className="text-xs font-bold text-[#888] uppercase mb-3">Export</div>
            <button
              onClick={() => downloadMarkdown(false)}
              disabled={turns.length === 0}
              title="Download market data, full debate transcript, and cost summary"
              className="w-full px-3 py-2 bg-[#1a1a1f] border border-[#2a2a2d] text-[#d8d6d1] hover:border-[#5ab884] hover:text-[#5ab884] font-bold text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
            >
              ↓ Conversation <span className="font-normal text-[#666]">— transcript + market data</span>
            </button>
            <button
              onClick={() => downloadMarkdown(true)}
              disabled={turns.length === 0}
              title="Includes full Claude system prompts and message arrays for every turn"
              className="w-full px-3 py-2 bg-[#1a1a1f] border border-[#2a2a2d] text-[#d8d6d1] hover:border-[#7a9eaf] hover:text-[#7a9eaf] font-bold text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
            >
              ↓ Conversation + Prompts <span className="font-normal text-[#666]">— incl. all Claude input</span>
            </button>
            {turns.length === 0 && (
              <div className="text-[10px] text-[#555] pt-1">Available after debate starts.</div>
            )}
          </div>

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
  const displayText = done ? deduplicateText(text) : text;

  return (
    <div className={`${bgColor} rounded p-3`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-sm font-bold ${color}`}>{agent}</span>
        {round && <span className="text-xs text-[#666]">round {round}</span>}
        {!done && <span className="text-xs text-[#666] animate-pulse">▌</span>}
      </div>
      <div className="text-sm leading-relaxed text-[#d8d6d1]">
        {done ? (
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
              p: ({ children }) => <p className="mb-1">{colorizeChildren(children)}</p>,
              strong: ({ children }) => <strong className="text-[#e8e6e1]">{colorizeChildren(children)}</strong>,
              ul: ({ children }) => <ul className="list-disc list-inside my-2">{children}</ul>,
              li: ({ children }) => <li className="ml-2">{colorizeChildren(children)}</li>,
            }}
          >
            {displayText}
          </ReactMarkdown>
        ) : (
          <div className="whitespace-pre-wrap font-sans text-sm text-[#d8d6d1] leading-relaxed">
            <NumberHighlight text={displayText} />
          </div>
        )}
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
            p: ({ children }) => <p className="mb-1">{colorizeChildren(children)}</p>,
            strong: ({ children }) => <strong className="text-[#e8e6e1]">{colorizeChildren(children)}</strong>,
            ul: ({ children }) => <ul className="list-disc list-inside my-2">{children}</ul>,
            li: ({ children }) => <li className="ml-2">{colorizeChildren(children)}</li>,
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

function DataRow({ label, value, valueClass = 'text-[#d8d6d1]' }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2 text-xs">
      <span className="text-[#555]">{label}</span>
      <span className={`font-medium tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold text-[#666] uppercase tracking-wider pt-2 pb-0.5 border-t border-[#1e1e22]">{children}</div>;
}

function MarketDataPanel({ data }: { data: Record<string, MarketSnapshot> }) {
  const tickers = Object.keys(data);
  if (tickers.length === 0) return null;

  return (
    <div className="bg-[#15151a] border border-[#2a2a2d] rounded p-3 text-sm font-mono space-y-3">
      <div className="text-xs font-bold text-[#888] uppercase">Market Data</div>
      {tickers.map(ticker => {
        const s = data[ticker];
        const changeColor = s.changePct >= 0 ? 'text-[#5ab884]' : 'text-[#d97474]';
        const rsiColor = s.rsi14 > 70 ? 'text-[#d97474]' : s.rsi14 < 30 ? 'text-[#5ab884]' : 'text-[#7ec4cf]';
        const macdColor = s.macd.hist >= 0 ? 'text-[#5ab884]' : 'text-[#d97474]';
        const bbColor = s.bollinger.pctB > 1 ? 'text-[#d97474]' : s.bollinger.pctB < 0 ? 'text-[#5ab884]' : 'text-[#7ec4cf]';
        const cmfColor = s.cmf > 0.1 ? 'text-[#5ab884]' : s.cmf < -0.1 ? 'text-[#d97474]' : 'text-[#7ec4cf]';
        const obvColor = s.obvTrend === 'rising' ? 'text-[#5ab884]' : 'text-[#d97474]';
        const accColor = s.accumulationScore >= 60 ? 'text-[#5ab884]' : s.accumulationScore <= 40 ? 'text-[#d97474]' : 'text-[#d4a574]';
        const pricePct = s.high52w > s.low52w
          ? Math.round(((s.price - s.low52w) / (s.high52w - s.low52w)) * 100)
          : 50;

        return (
          <div key={ticker} className="space-y-1 pb-3 border-b border-[#2a2a2d] last:border-0 last:pb-0">
            {/* Header */}
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-bold text-[#e8e6e1] text-base">{s.symbol}</span>
              <span className="text-[#7ec4cf] font-medium">${s.price.toFixed(2)}</span>
              <span className={`text-xs font-bold ${changeColor}`}>
                {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
              </span>
            </div>

            {/* 52w range bar */}
            <div className="space-y-1 mb-2">
              <div className="flex justify-between text-[10px] text-[#555]">
                <span>${s.low52w}</span>
                <span className="text-[#555]">52w ({pricePct}%)</span>
                <span>${s.high52w}</span>
              </div>
              <div className="relative h-1 bg-[#2a2a2d] rounded-full">
                <div className="absolute top-0 w-2 h-1 bg-[#d4a574] rounded-full -ml-1" style={{ left: `${pricePct}%` }} />
              </div>
            </div>

            {/* Earnings */}
            {s.earningsDate && (
              <>
                <SectionLabel>Earnings</SectionLabel>
                <DataRow
                  label="Next date"
                  value={`${s.earningsDate}${s.earningsDaysAway !== undefined ? ` (${s.earningsDaysAway}d)` : ''}`}
                  valueClass={s.earningsSoon ? 'text-[#d97474] font-bold' : 'text-[#7ec4cf]'}
                />
              </>
            )}

            {/* Analyst / Fundamentals */}
            {(s.analystTarget || s.peRatio || s.cashDebtRatio) && (
              <>
                <SectionLabel>Analyst / Fundamentals</SectionLabel>
                {s.analystTarget && <DataRow label={`Analyst target (${s.analystCount ?? '?'})`} value={`$${s.analystTarget.toFixed(2)}`} valueClass="text-[#7ec4cf]" />}
                {s.analystRecommendation && <DataRow label="Consensus" value={s.analystRecommendation.toUpperCase()} valueClass={s.analystRecommendation.toLowerCase().includes('buy') ? 'text-[#5ab884]' : s.analystRecommendation.toLowerCase().includes('sell') ? 'text-[#d97474]' : 'text-[#d4a574]'} />}
                {s.peRatio && <DataRow label="P/E ratio" value={s.peRatio.toFixed(1)} valueClass="text-[#7ec4cf]" />}
                {s.cashDebtRatio !== undefined && <DataRow label={`Cash/Debt (${s.cashDebtLabel ?? ''})`} value={`${s.cashDebtRatio.toFixed(2)}x`} valueClass={s.cashDebtRatio > 2 ? 'text-[#5ab884]' : s.cashDebtRatio < 0.5 ? 'text-[#d97474]' : 'text-[#7ec4cf]'} />}
                {s.sector && <DataRow label="Sector" value={s.sector} valueClass="text-[#888]" />}
              </>
            )}

            {/* Sentiment */}
            {(s.putCallRatio || s.shortPct !== undefined || s.insiderSignal) && (
              <>
                <SectionLabel>Sentiment</SectionLabel>
                {s.putCallRatio !== undefined && <DataRow label={`Put/Call (${s.putCallLabel ?? ''})`} value={s.putCallRatio.toFixed(2)} valueClass={s.putCallRatio < 0.7 ? 'text-[#5ab884]' : s.putCallRatio > 1.3 ? 'text-[#d97474]' : 'text-[#7ec4cf]'} />}
                {s.shortPct !== undefined && <DataRow label={`Short interest (${s.shortLabel ?? ''})`} value={`${s.shortPct.toFixed(1)}%`} valueClass={s.shortPct > 15 ? 'text-[#d97474]' : s.shortPct < 5 ? 'text-[#5ab884]' : 'text-[#7ec4cf]'} />}
                {s.insiderSignal && <DataRow label="Insider (45d)" value={s.insiderSignal} valueClass={s.insiderSignal === 'BUYING' ? 'text-[#5ab884]' : s.insiderSignal === 'SELLING' ? 'text-[#d97474]' : 'text-[#d4a574]'} />}
                {s.googleTrendsChange !== undefined && <DataRow label={`Google Trends (${s.googleTrendsLabel ?? ''})`} value={`${s.googleTrendsChange >= 0 ? '+' : ''}${s.googleTrendsChange.toFixed(1)}%`} valueClass={s.googleTrendsChange > 0 ? 'text-[#5ab884]' : 'text-[#d97474]'} />}
              </>
            )}

            {/* Relative performance */}
            {(s.stockReturn30d !== undefined || s.alphaVsSpy !== undefined || s.industryAlpha !== undefined) && (
              <>
                <SectionLabel>Performance</SectionLabel>
                {s.stockReturn30d !== undefined && <DataRow label="Return 30d" value={`${s.stockReturn30d >= 0 ? '+' : ''}${s.stockReturn30d.toFixed(2)}%`} valueClass={s.stockReturn30d >= 0 ? 'text-[#5ab884]' : 'text-[#d97474]'} />}
                {s.alphaVsSpy !== undefined && <DataRow label="Alpha vs SPY" value={`${s.alphaVsSpy >= 0 ? '+' : ''}${s.alphaVsSpy.toFixed(2)}%`} valueClass={s.alphaVsSpy >= 0 ? 'text-[#5ab884]' : 'text-[#d97474]'} />}
                {s.industryAlpha !== undefined && s.industryEtfName && <DataRow label={`Alpha vs ${s.industryEtfName}`} value={`${s.industryAlpha >= 0 ? '+' : ''}${s.industryAlpha.toFixed(2)}%`} valueClass={s.industryAlpha >= 0 ? 'text-[#5ab884]' : 'text-[#d97474]'} />}
                {s.trendDirection && <DataRow label="18m trend" value={s.trendDirection} valueClass={s.trendDirection === 'up' ? 'text-[#5ab884]' : s.trendDirection === 'down' ? 'text-[#d97474]' : 'text-[#d4a574]'} />}
              </>
            )}

            {/* Support / Resistance */}
            {(s.support20d || s.resistance20d) && (
              <>
                <SectionLabel>Support / Resistance</SectionLabel>
                {s.support20d && <DataRow label="Support 20d" value={`$${s.support20d.toFixed(2)}`} valueClass="text-[#5ab884]" />}
                {s.safeStrike && <DataRow label="Safe strike" value={`$${s.safeStrike.toFixed(2)}`} valueClass="text-[#7ec4cf]" />}
                {s.resistance20d && <DataRow label="Resistance 20d" value={`$${s.resistance20d.toFixed(2)}`} valueClass="text-[#d97474]" />}
              </>
            )}

            {/* Technical */}
            <SectionLabel>Technical</SectionLabel>
            <DataRow label="RSI 14" value={s.rsi14} valueClass={rsiColor} />
            <DataRow label={`MACD hist`} value={`${s.macd.hist >= 0 ? '+' : ''}${s.macd.hist.toFixed(2)}`} valueClass={macdColor} />
            <DataRow label="EMA20" value={`$${s.ema20}`} />
            <DataRow label="SMA50" value={`$${s.sma50}`} />
            <DataRow label="SMA200" value={`$${s.sma200}`} />
            <DataRow label="ATR 14" value={`$${s.atr14}`} />
            <DataRow label="BB%" value={`${(s.bollinger.pctB * 100).toFixed(0)}%`} valueClass={bbColor} />

            {/* Accumulation */}
            <SectionLabel>Accumulation</SectionLabel>
            <DataRow label="Score" value={s.accumulationScore} valueClass={accColor} />
            <DataRow label="OBV trend" value={s.obvTrend} valueClass={obvColor} />
            <DataRow label="CMF 20" value={s.cmf.toFixed(3)} valueClass={cmfColor} />

            <div className="text-[10px] text-[#444] pt-1">
              <div>{s.regime}</div>
              <div>{s.trendStructure}</div>
              <div>as of {s.asOf}</div>
            </div>
          </div>
        );
      })}
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
          <span className="text-[#888]">Accumulated:</span>
          <span className="float-right text-[#5ab884] font-bold">${sessionTotal.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
