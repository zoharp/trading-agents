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
- **AI/LLM:** Anthropic Claude (Sonnet 4.5) via official SDK
- **Market Data:** `yahoo-finance2` (free, no API key needed)
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
3. Add `ANTHROPIC_API_KEY` in Vercel project settings → Environment Variables
4. Vercel Pro required for 5-minute debate timeout (`maxDuration = 300` in `app/api/debate/route.ts`)

---

## Current versions

- **Frontend:** `0.1.0`
- **Backend:** `0.1.0`

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
├── next.config.js              ← webpack config to handle yahoo-finance2 test files
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
```

**Key notes:**
- `.env.local` is git-ignored (do NOT commit)
- `.env.local.example` shows the required keys only (no values)
- On Vercel, set `ANTHROPIC_API_KEY` in project settings → Environment Variables

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
| `lib/claude.ts` | Streams agent responses from Claude API. Yields `AgentChunk` union (text or usage). |
| `lib/orchestrator.ts` | Debate loop: Elena & Marcus take turns, parse stances, track tokens, detect consensus. Respects `AbortSignal` for early stopping. |
| `lib/market-data.ts` | Fetches 1-year daily candles from Yahoo Finance, computes indicators (EMA, RSI, MACD, Bollinger Bands, ATR). |
| `app/page.tsx` | Main UI: alternating chat-style bubbles (Marcus left, Elena right), cost panel, markdown rendering, smart scroll, stop button. |
| `app/api/debate/route.ts` | SSE endpoint: accepts user request, calls `runDebate()`, streams events to client. |
| `agents/agent-meanrev.md` | Elena's persona: mean reversion philosophy, risk management focus, leader role. |
| `agents/agent-trend.md` | Marcus's persona: trend/momentum philosophy, reactive approach, challenger role. |
| `profile/user-profile.md` | Your trading profile: experience, risk appetite, account size, goals. Agents read this to contextualize advice. |

---

## UI Features

- **Chat-style layout:** Messages alternate left (Marcus) / right (Elena) in a scrollable feed
- **System messages:** Full-width italic dividers (market data fetching, consensus detected, etc.)
- **Debate bubbles:** Each agent's turn is a styled card with name, round, and live-rendered markdown
- **Streaming text:** Content appears as agents think (progressive text chunks)
- **Cursor animation:** Pulsing `▌` cursor while agent is speaking
- **Stop button:** Red "STOP" button visible during debate; clicking aborts the stream
- **Cost panel:** Sticky right sidebar showing cumulative input/output tokens and USD cost
  - Input: $3 per 1M tokens (Claude Sonnet 4.5)
  - Output: $15 per 1M tokens (Claude Sonnet 4.5)
- **Smart scroll:** Page only auto-scrolls to bottom if you're already near the bottom; won't yank you away while reading
- **Markdown rendering:** Headers, bold, code blocks, lists render properly (no raw markdown tags)
- **Final/Escalation boxes:** Styled full-width boxes (green for consensus, red for tie-breaker)

---

## Customizing the Agents

**Agent personas live entirely in Markdown files.** Edit `agents/agent-meanrev.md` or `agents/agent-trend.md` to change:
- Philosophy and indicators
- Tone and communication style
- Risk tolerance and conviction levels
- Anything else

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

1. Each agent turn emits token usage via `lib/claude.ts` → `streamAgent()` → `AgentChunk` with `kind: 'usage'`
2. `lib/orchestrator.ts` accumulates tokens across all turns in `const cumulative = { input: 0, output: 0 }`
3. Each usage event yields `{ type: 'usage', totalInputTokens, totalOutputTokens }`
4. Frontend listens for usage events and updates the cost panel in real-time
5. Formula: `(inputTokens × $3 + outputTokens × $15) / 1,000,000`

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
- 1 year of daily OHLCV candles from Yahoo Finance for each detected ticker
- Computed on-the-fly (no caching)

**Indicators included:**
- EMA (50, 200)
- RSI (14)
- MACD (12, 26, 9)
- Bollinger Bands (20, 2)
- ATR (14)

**To add more:**
Edit `lib/market-data.ts` and add your indicator function in `getTechnicalSnapshot()`.

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

### Build errors (yahoo-finance2 test imports)
Already fixed in `next.config.js` — webpack excludes `yahoo-finance2/**/tests/` directory.
If new errors appear, check `next.config.js` webpack aliases.

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
- **Daily data only.** Yahoo Finance provides OHLCV daily candles. Intraday requires Polygon/Alpaca integration.
- **Vercel Pro required** for 5-minute debates. Hobby tier (free) has 10-second limit.
- **Rate limits:** Anthropic API has per-minute and monthly quotas. Monitor usage via your Anthropic dashboard.

---

## Stack choices & why

| Choice | Why |
|--------|-----|
| Next.js 15 App Router | Fast, full-stack, SSE support out-of-box, easy Vercel deploy |
| Claude Sonnet 4.5 | Best price/performance for reasoning, good at structured output (stances) |
| Yahoo Finance | Free, no key required, good enough for debate use case |
| Markdown agents | Easy to edit (no code deploy), version-controllable, agents "speak" their philosophy |
| Tailwind CSS | Fast styling, dark theme looks professional |
| Server-Sent Events | Natural fit for streaming, simpler than WebSocket for this use case |

