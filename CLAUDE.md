# two.desk — Claude Code Instructions

> System-level rules and deployment gates are in `system.md`.
> This file contains only project-specific information.

---

## Project

**two.desk** is a real-time trading debate interface where two opinionated AI agents (Elena Sokolov and Marcus Vance) debate your trading setup until they reach consensus or you break the tie. The agents stream live analysis, technical indicators, and structured recommendations. Built for thinking through trades, not as financial advice.

**GitHub repo:** https://github.com/zoharp/trading-agents

---

## Tech Stack

- **Frontend:** Next.js 15 (App Router, React 19, Tailwind CSS)
- **Backend:** Next.js API Routes (Node.js)
- **AI/LLM:** Anthropic Claude (Opus/Sonnet/Haiku) via official SDK
- **Market Data:** Supabase (stock-predictor database) with 25-second timeout protection
- **Streaming:** Server-Sent Events (SSE)
- **Hosting:** Vercel (frontend) — auto-deploys on push to main

---

## Deployment

Push to `main` branch → Vercel auto-deploys.
**STOP:** Do not push without explicit user approval (see `system.md` deployment gate).

Production URL: `https://two-desk.vercel.app` (or your Vercel custom domain)

### Prerequisites for Vercel deployment
1. Repo on GitHub (user: zoharp, repo: trading-agents)
2. Vercel account connected to GitHub
3. Add environment variables in Vercel project settings:
   - `ANTHROPIC_API_KEY` — from [Anthropic Console](https://console.anthropic.com/account/keys)
   - `SUPABASE_URL` — from stock-predictor Supabase project
   - `SUPABASE_KEY` — from stock-predictor Supabase project (anon key)
4. Vercel Pro required for 5-minute debate timeout (`maxDuration = 300` in `app/api/debate/route.ts`)

---

## Current versions

- **Frontend:** `0.2.0`
- **Backend:** `0.2.0`
- **Data Integration:** Supabase (stock-predictor) — live since May 17, 2026

---

## Data Pipeline (NEW)

**trading-agents now sources market data directly from stock-predictor's Supabase database** instead of Yahoo Finance. This gives agents richer context and faster access.

### Architecture:
```
User submits: "What about TSLA?"
        ↓
trading-agents extracts ticker: TSLA
        ↓
Query Supabase prices table: SELECT * FROM prices WHERE ticker='TSLA' ORDER BY date
        ↓
Get ~1 year of OHLCV candles (paginated, 1000 rows per request)
        ↓
Calculate technical indicators locally (EMA, RSI, MACD, Bollinger, ATR)
        ↓
Build market context block for Elena & Marcus
        ↓
Debate proceeds with full technical setup
```

### Connection Details:
- **Database:** Supabase (shared with stock-predictor)
- **Table:** `prices` (schema: `date`, `ticker`, `open`, `high`, `low`, `close`, `volume`)
- **Auth:** API key-based (anon key with RLS)
- **Timeout:** 25 seconds (protects against Supabase slowness)
- **Caching:** Local file cache (`.cache/market-data-cache.json`, 1-hour TTL)

### Future Enhancement — stock-predictor Integration:
When data is > 1 hour old, could query stock-predictor's `/api/stock/<ticker>/refresh` endpoint to fetch pre-calculated features:
- **ML Prediction:** Probability of price rising 4%+ within 30 days (XGBoost-trained per ticker)
- **Edge Score (0-100):** Composite score combining weighted signals:
  - ML probability, analyst consensus, put/call ratio, short interest, alpha vs SPY, accumulation score, Google Trends, insider activity
  - Labels: STRONG BUY (80+), BUY (65+), WEAK/AVOID (<65), OVERSOLD BOUNCE
- **Accumulation Detection:** Detects institutional buying during sideways price action
  - OBV trend, Chaikin Money Flow, price range tightness, volume patterns
- **Support & Resistance:** Calculated 20-day support/resistance levels, safe strike recommendations
- **Technical Features:** RSI, MACD, Bollinger Bands, ATR, OBV, CMF, momentum, returns

This would give Elena & Marcus much richer pre-calculated context instead of just OHLCV, accelerating debate and improving conviction confidence.

**See also:** [stock-predictor PROJECT_SUMMARY.md](../stock-predictor/stock-predictor/PROJECT_SUMMARY.md) for complete architecture.

---

## Project Structure

```
trading-agents/
├── CLAUDE.md                   ← this file (project-specific)
├── system.md                   ← deployment gate, mandatory rules
├── README.md                   ← user-facing overview
├── .env.local.example          ← template for .env.local (never commit)
├── .gitignore
├── .next/                      ← build output
├── public/                     ← static assets
├── node_modules/
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.js              ← Next.js configuration
├── tailwind.config.js
├── postcss.config.js
│
├── app/                        ← Next.js app directory (App Router)
│   ├── layout.tsx              ← root layout
│   ├── page.tsx                ← main UI (debate interface, cost panel, chat-style layout)
│   └── api/
│       └── debate/
│           └── route.ts        ← SSE endpoint: receives user request, yields debate events
│
├── lib/                        ← shared logic
│   ├── claude.ts               ← streamAgent() AsyncGenerator, AgentChunk type
│   ├── orchestrator.ts         ← runDebate() orchestration, consensus logic, token tracking
│   └── market-data.ts          ← getTechnicalSnapshot(), indicator calcs (EMA, RSI, MACD, etc.)
│
├── agents/                     ← agent personas (Markdown)
│   ├── agent-meanrev.md        ← Elena Sokolov (mean reversion, lead)
│   └── agent-trend.md          ← Marcus Vance (trend/momentum, challenger)
│
└── profile/                    ← user customization
    └── user-profile.md         ← your trading profile (edited by user)
```

---

## Environment Variables (`.env.local`)

```bash
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://...
SUPABASE_KEY=eyJ...
```

**Key notes:**
- `.env.local` is git-ignored (do NOT commit)
- `.env.local.example` shows the required keys only (no values)
- `SUPABASE_URL` and `SUPABASE_KEY` are copied from stock-predictor's `.env` (shared Supabase project)
- On Vercel, set all three variables in project settings → Environment Variables

---

## How to Run

### Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy template and add your Anthropic API key
cp .env.local.example .env.local
# Then edit .env.local and paste your key

# 3. (Optional) Edit your trading profile
# Open profile/user-profile.md and customize

# 4. Start dev server
npm run dev

# Or use the provided script (Windows):
run.dev
```

Then open http://localhost:3000.

### Testing the API directly

```bash
curl -X POST http://localhost:3000/api/debate \
  -H "Content-Type: application/json" \
  -d '{"request": "Should I buy NVDA here?"}'
```

The response is SSE (text/event-stream). Each line is a JSON event:
- `{"type":"system", "text":"..."}`
- `{"type":"turn-start", "agent":"Elena", "round":1}`
- `{"type":"token", "agent":"Elena", "text":"Some text chunk"}`
- `{"type":"turn-end", "agent":"Elena", "round":1, "stance":{...}}`
- `{"type":"usage", "totalInputTokens":123, "totalOutputTokens":456}`
- `{"type":"final", "text":"..."}`
- `{"type":"escalation", "text":"..."}`

---

## Key Files & What They Do

| File | Purpose |
|------|---------|
| `lib/claude.ts` | Streams agent responses from Claude API. Yields `AgentChunk` union (text, usage, retry). Auto-retries on `overloaded_error` up to 3× (3s/6s/9s delays). Yields `retry` chunk so UI can show feedback. |
| `lib/orchestrator.ts` | Debate loop: Elena & Marcus take turns, parse stances, track tokens, detect consensus. `formatSnapshot()` converts `TechnicalSnapshot` to compact text (~150 tokens vs ~630 for JSON). Early exit when both agents have conviction 0 (missing ticker). Saves costs to JSON. Respects `AbortSignal`. |
| `lib/market-data.ts` | Fetches OHLCV from Supabase `prices` table (always live). Computes EMA/RSI/MACD/BB/ATR/OBV/CMF/accumulation score. Also queries `slow_data` table in parallel for: earnings date, analyst target/consensus/P-E, cash/debt ratio, put/call ratio, short interest, insider activity, Google Trends, alpha vs SPY/sector, support/resistance. |
| `app/page.tsx` | Main UI: model selector, alternating chat-style bubbles, round summaries, cost panel (current + session total), pause/resume, stop button. |
| `app/api/debate/route.ts` | SSE endpoint: accepts user request + model choice, calls `runDebate()`, streams events to client. Supports resume state. |
| `app/api/debate-costs/route.ts` | GET endpoint: returns JSON array of all debate costs from `.cache/debate-costs.json`. Used to calculate session totals. |
| `agents/agent-meanrev.md` | Elena's persona: mean reversion philosophy, risk management focus, leader role. |
| `agents/agent-trend.md` | Marcus's persona: trend/momentum philosophy, reactive approach, challenger role. |
| `profile/user-profile.md` | Your trading profile: experience, risk appetite, account size, goals. Agents read this to contextualize advice. |

---

## UI Features

- **Model selector:** Choose from Claude Opus, Sonnet, or Haiku before each debate. **Default: Haiku** (fastest/cheapest).
- **User query card:** Gold card at the top of the feed showing your question once the debate starts
- **Chat-style layout:** Messages alternate left (Marcus) / right (Elena) in a scrollable feed
- **System messages:** Full-width italic dividers (market data fetching, consensus detected, etc.)
- **Debate bubbles:** Each agent's turn is a styled card with name, round, and live-rendered markdown
- **Streaming rendering:** Plain `<pre>` while tokens arrive (avoids partial-markdown glitches); switches to ReactMarkdown when turn is `done`
- **Round Summary Card:** After each round, displays side-by-side stance cards showing:
  - Each agent's stance (bullish/bearish/neutral) and conviction level (1-10)
  - Agreement status (✓ Agrees / ⊕ Partial / ✗ Disagrees)
  - **Agreement Score** (0-100%) showing how aligned they are
  - Color-coded: green for strong agreement, orange for partial, red for disagreement
- **Cursor animation:** Pulsing `▌` cursor while agent is speaking
- **Stop button:** Red "STOP" button visible during debate; clicking aborts the stream
- **Resume button:** Green "RESUME" button appears after stopping; preserves full debate context (transcript, stances, round number)
- **Number colorization:** All numeric values in agent messages render in soft cyan (`#7ec4cf`) for quick scanning — in both streaming and final rendered views.
- **Market data panel:** Right sidebar, sectioned: Earnings, Analyst/Fundamentals, Sentiment, Performance, Support/Resistance, Technical, Accumulation. Sections only render when data is present.
  - Price, % change, 52-week range bar
  - Earnings date + days away (red when soon)
  - Analyst target, consensus, count, P/E, cash/debt ratio
  - Put/call ratio, short interest, insider signal (45d), Google Trends
  - Alpha vs SPY, alpha vs sector ETF, 18m trend direction
  - Support/resistance/safe-strike levels
  - RSI, MACD, EMA/SMA, BB%, ATR, OBV trend, CMF, accumulation score
- **Cost panel:** Right sidebar showing two sections:
  - **Current Debate:** Input/output tokens and USD cost (updates in real-time via ref accumulation)
  - **Session Total:** Cumulative cost across all debates in this session (ref-accumulated, not re-read from file)
  - Model-specific pricing: Opus ($15/$75), Sonnet ($3/$15), Haiku ($0.80/$4) per 1M tokens
- **Export panel:** Always-visible sidebar section, two buttons:
  - **↓ Conversation** — transcript + market data as Markdown file
  - **↓ Conversation + Prompts** — same plus all Claude system prompts and message arrays
- **Debug panel:** Toggle to view exact system prompt and message array sent to each agent
- **Smart scroll:** Page only auto-scrolls to bottom if you're already near the bottom; won't yank you away while reading
- **Final/Escalation boxes:** Styled full-width boxes (green for consensus, red for tie-breaker)

---

## Customizing the Agents

**Agent personas live entirely in Markdown files.** Edit `agents/agent-meanrev.md` or `agents/agent-trend.md` to change:
- Philosophy and indicators
- Tone and communication style
- Risk tolerance and conviction levels
- Anything else

**Agent Instructions:**
Both agents include guidance on avoiding repetition, tracking convergence, and accelerating consensus:
- **Detect redundancy** — Flag if repeating previous points, focus on NEW points
- **Track convergence** — Actively acknowledge agreements
- **Avoid stalling** — Request missing data when stuck (round 3+)

See `DEBATE_STRUCTURE.md` for design rationale and how these guidelines reduce debate length 60-70% while keeping substance.

**Constraints:**
- Keep the `STANCE` block structure (parsed by consensus detection):
  ```
  STANCE: bullish/bearish/neutral
  CONVICTION: 1-10
  AGREE_WITH_PARTNER: yes/no/partial
  KEY_DISAGREEMENT: ...
  ```

---

## Token Usage & Cost Tracking

**Real-time tracking:**
1. Each agent turn emits token usage via `lib/claude.ts` → `streamAgent()` → `AgentChunk` with `kind: 'usage'`
2. `lib/orchestrator.ts` accumulates tokens across all turns in `const cumulative = { input: 0, output: 0 }`
3. Each usage event yields `{ type: 'usage', totalInputTokens, totalOutputTokens }`
4. Frontend listens for usage events and updates the cost panel in real-time
5. Pricing is model-specific (see `MODEL_PRICING` in `lib/orchestrator.ts`)

**Cost persistence:**
- After each debate completes (FINAL or ESCALATION), costs are saved to `.cache/debate-costs.json`
- Each record includes: `timestamp`, `ticker`, `rounds`, `inputTokens`, `outputTokens`, `costUsd`, `model`
- Session total cost is loaded on page mount and displayed in the cost panel
- File format: JSON array of cost records

**Cost file location:** `.cache/debate-costs.json`

---

## Tracking Progress: Round Summary Cards

**After each round, you'll see a summary card showing:**
- **Elena's stance** (bullish/bearish/neutral) + conviction (1-10) + agreement status
- **Marcus's stance** + conviction + agreement status  
- **Agreement Score** (0-100%) based on:
  - Same stance: +30 points
  - Both agree fully: +40 points
  - Similar conviction levels: +15 points

**Color coding:**
- 🟢 **80-100%** — Strong agreement (consensus likely next)
- 🟡 **60-79%** — Partial agreement (close, minor divergence)
- 🟠 **40-59%** — Moderate difference (still debating)
- 🔴 **0-39%** — Significant difference (still far apart)

**Why this helps:**
You can see at a glance if they're converging or repeating. If agreement score stays flat for 2+ rounds, they're going in circles and need more data.

---

## Consensus & Escalation Rules

**Consensus is reached when:**
1. Both Elena and Marcus agree (agree field = "yes")
2. Both have the same stance (bullish, bearish, or neutral)
3. Neither stance is "unknown"

**Once consensus is detected:**
- The debate stops
- Elena writes a `## FINAL RECOMMENDATION` block with structured advice (action, direction, conviction, entry, stop, targets, position sizing, risks, invalidation conditions)

**If 10 rounds pass without consensus:**
- Elena writes a `## ESCALATION` block explaining both theses, the core disagreement, and what information would resolve it
- You read both sides and decide

---

## Market Data & Indicators

**What we fetch:**
- 1 year of daily OHLCV candles from Supabase (stock-predictor database) for each detected ticker
- Data is sourced from stock-predictor's continuous data collection pipeline

**Reliability:**
- **25-second timeout protection:** Supabase API calls are wrapped with a timeout to prevent hanging indefinitely
- If fetch times out, falls back to cached data (even if stale)
- Graceful degradation: one ticker timeout won't block the debate

**Caching:**
- **Always fetches live from Supabase on every request** — no stale data ever shown to agents
- Cache at `.cache/market-data-cache.json` is written after each successful fetch
- Cache is only read as **emergency fallback** when Supabase is unreachable
- If API fails and no cache exists, the debate errors with a clear message

**Cache behavior:**
| Scenario | Action |
|----------|--------|
| Any request for NVDA | Fetch live from Supabase (25s timeout) → Save cache |
| API times out + cache exists | Use stale cache (graceful fallback) |
| API times out + no cache | Error — debate cannot proceed |

**To clear cache:**
```bash
rm -rf .cache/
```

**Future enhancement:**
- When data is > 1 hour old, trigger stock-predictor's refresh endpoint to get fresh ML predictions and edge scores
- Currently just uses OHLCV data; can later include pre-calculated indicators from stock-predictor

**Indicators included (computed locally from OHLCV):**
- EMA (20, 50, 200), RSI (14), MACD (12/26/9), Bollinger Bands (20,2), ATR (14)
- OBV (trend: rising/falling over last 20 bars)
- CMF (20-period Chaikin Money Flow)
- Accumulation score (0-100): 60% OBV trend + 40% CMF

**Slow data (from Supabase `slow_data` table, fetched in parallel with prices):**
- `earnings_flag` → earnings date, days away, soon flag
- `analyst_data` → target, low/high, recommendation, count, P/E, cash/debt, sector
- `put_call_ratio` → PCR + label
- `short_interest` → short %, label
- `insider_transactions` → BUYING/SELLING/MIXED signal + detail
- `google_trends` → current score (0-100), % change, label
- `relative_strength` → 30d stock return, SPY return, alpha
- `trend_18m` → trend direction (up/down/flat)
- `industry_chart` → alpha vs sector ETF + ETF name
- `support_resistance` → support 20d, resistance 20d, safe strike

**Token cost of market data block per turn:**
- Old (raw JSON dump): ~630 tokens per ticker
- New (`formatSnapshot()` text): ~150 tokens per ticker (~75% reduction)

**To add more:**
Edit `lib/market-data.ts` → `getTechnicalSnapshot()` for local indicators, or add new `call_name` entries from `slow_data`.

---

## Critical Architecture Notes (do not regress)

### React StrictMode + state mutation bug
`setTurns` updater functions **must never mutate objects inside `prev`**. React StrictMode calls updaters twice with the same `prev` reference — any mutation causes tokens to be appended twice. Always return new objects:
```js
// WRONG — mutates last (seen twice by StrictMode):
last.text += token;
return [...prev.slice(0, -1), last];

// CORRECT — always spread:
return [...prev.slice(0, idx), { ...last, text: last.text + token }];
```

### Streaming rendering split
While a turn is streaming (`done === false`), render in `<pre className="whitespace-pre-wrap font-sans">`. Switch to `<ReactMarkdown>` only when `done === true`. ReactMarkdown on partial tokens creates artifacts like `##ng` and `hat400.75`.

### Final/Escalation dedup
When a `final` or `escalation` event arrives, **drop the last Elena turn** from the turns array before inserting the SpecialBubble. The orchestrator emits Elena's final text as both streamed tokens (ChatBubble) and a `final` event — without this, the recommendation appears twice.

### Context window management (orchestrator)
Transcript passed to agents: **last 6 entries in full**, older entries summarized to stance/conviction/agree one-liners. Prevents context growth from degrading response quality in long debates.

### Session cost accumulation
Session total is accumulated via a `useRef` counter that adds each debate's cost in the `finally` block of the fetch — not re-read from the costs file. This avoids race conditions and stale reads.

### Market data format (orchestrator)
Never pass raw `JSON.stringify(snapshot)` to agents — it was ~630 tokens/ticker and included `recentCandles` (10 raw OHLCV bars the agents never use). Use `formatSnapshot()` which produces a compact human-readable text block (~150 tokens). Agents read text better than raw JSON anyway.

### Anthropic overloaded errors
`streamAgent` in `lib/claude.ts` retries up to 3× on `overloaded_error` / HTTP 529 (3s, 6s, 9s delays) before throwing. Yields a `retry` chunk so the orchestrator can surface "API overloaded — retrying (1 of 3)..." as a system message. Only retries if no tokens have been streamed yet (`started === false`). Check condition: `e?.status === 529 || e?.error?.type === 'overloaded_error' || e?.message?.includes('overloaded_error')`.

### Debate early exit (no ticker)
After each round, if both agents have `conviction === 0`, the orchestrator immediately yields an escalation with "MISSING DATA" and exits. Prevents wasted rounds where agents loop asking for the ticker.

---

## Debugging & Troubleshooting

### Dev server won't start
```bash
# Kill any process on port 3000
lsof -ti :3000 | xargs kill -9
# Then restart
npm run dev
```

### TypeScript errors
```bash
npx tsc --noEmit
```

### Market data fetch errors
Market data is fetched via Supabase with 25-second timeout protection. If fetches time out frequently:
- Check your internet connection and firewall rules
- Verify `.env.local` has correct `SUPABASE_URL` and `SUPABASE_KEY`
- The system gracefully falls back to cached data if available (check `.cache/market-data-cache.json` for recent entries)
- If Supabase is down, debates can still proceed using cached data from previous queries

### Agents give wrong answers
Edit their personas in `agents/*.md` — adjust indicators, tone, conviction rules.

### API key missing
```bash
# Check .env.local exists and has ANTHROPIC_API_KEY
cat .env.local
```

---

## One-time Setup Checklist

- [ ] Clone repo
- [ ] `npm install`
- [ ] `cp .env.local.example .env.local`
- [ ] Add your `ANTHROPIC_API_KEY` to `.env.local`
- [ ] Edit `profile/user-profile.md` with your trading profile
- [ ] (Optional) Customize agents in `agents/agent-*.md`
- [ ] `npm run dev`
- [ ] Open http://localhost:3000
- [ ] Submit a test question (e.g., "Should I buy NVDA?")

---

## Notes & Limitations

- **Not financial advice.** This is a thinking tool. The agents can be confidently wrong.
- **Ticker extraction is regex-based** (2–5 uppercase letters or `$SYMBOL`). Refine in `lib/market-data.ts` if needed.
- **No persistence.** Each session is fresh (no chat history storage).
- **Daily data only.** Supabase provides OHLCV daily candles. Intraday data would require additional API integration.
- **Vercel Pro required** for 5-minute debates. Hobby tier (free) has 10-second limit.
- **Rate limits:** Anthropic API has per-minute and monthly quotas. Monitor usage via your Anthropic dashboard. Supabase has soft rate limits per project.

---

## Stack choices & why

| Choice | Why |
|--------|-----|
| Next.js 15 App Router | Fast, full-stack, SSE support out-of-box, easy Vercel deploy |
| Claude models (Opus/Sonnet/Haiku) | User selects per debate: Opus for best reasoning, Sonnet for balanced, Haiku for speed/cost. Good at structured output (stances). |
| Supabase (stock-predictor DB) | Centralized data source, shared with stock-predictor, 25-second timeout, 1-hour file caching, pagination support |
| Markdown agents | Easy to edit (no code deploy), version-controllable, agents "speak" their philosophy |
| Tailwind CSS | Fast styling, dark theme looks professional |
| Server-Sent Events | Natural fit for streaming, simpler than WebSocket for this use case |

