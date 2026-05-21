# two.desk — Live Trading Debate

Two opinionated trading agents debate your setup in real-time until they reach consensus or you break the tie. Watch them think, see the costs tick up, stop them mid-stream if they're going nowhere.

- **Elena Sokolov** (lead) — mean reversion, structure, patience
- **Marcus Vance** (challenger) — trend, momentum, react not predict

**Live UI:**
- **Model selector** — Choose Claude Opus (best reasoning), Sonnet (balanced), or Haiku (fast + cheap) before each debate
- Chat-style alternating bubbles (Marcus left, Elena right)
- **Round Summary Cards** — See stance, conviction, and agreement % after each round
- **Cost panel** with two sections:
  - **Current Debate** — tokens and cost in real-time
  - **Session Total** — cumulative cost across all debates today
- Markdown rendering (no raw tags visible)
- Smart scroll that doesn't yank you away while reading
- **Stop button** to halt mid-debate, **Resume button** to pick up where you left off (full context preserved)
- **Follow-up questions** — after a final recommendation, ask a follow-up; agents do a mini 1-round discussion and produce an updated recommendation. Type a new ticker to start fresh instead.
- Final recommendation or escalation (needs you to decide)
- **Optimized for clarity** — Track debate progress at a glance instead of reading walls of text

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/zoharp/trading-agents.git
cd trading-agents
npm install

# 2. Add environment variables
cp .env.local.example .env.local
# Edit .env.local and fill in:
# - ANTHROPIC_API_KEY from https://console.anthropic.com/account/keys
# - SUPABASE_URL and SUPABASE_KEY from stock-predictor's .env (shared database)

# 3. (Optional) Customize your profile
# Open profile/user-profile.md and fill in your details
# Agents read this to contextualize advice

# 4. Run
npm run dev
```

Then open **http://localhost:3000** and ask a question.

Example: _"Should I take a swing long in NVDA here?"_

---

## How It Works

```
You submit: "Should I buy NVDA here?"
    ↓
Backend extracts ticker (NVDA)
    ↓
Fetch 1yr daily candles from Supabase (stock-predictor database)
    ↓
Compute indicators: EMA, RSI, MACD, Bollinger, ATR
    ↓
Elena (lead) opens analysis → streams live → you see tokens accumulate
    ↓
Marcus (challenger) responds → live debate unfolds
    ↓
Repeat (max 10 rounds)
    ↓
Each turn: agents produce STANCE block (bullish/bearish, conviction, agreement)
    ↓
Consensus reached?
  → YES: Elena writes FINAL RECOMMENDATION → you see action plan
  → NO:  10 rounds passed → Elena writes ESCALATION → you decide
```

**Data source:** Uses market data from stock-predictor's Supabase database. Can later be enhanced with stock-predictor's pre-calculated ML predictions and edge scores.

---

## UI Features

### Chat Layout
- **Left column (Marcus):** Trend/momentum perspective
- **Right column (Elena):** Mean reversion perspective
- **Alternating:** As they respond to each other

### Cost Panel (right sidebar)
- **Current Debate:** Input/output tokens and cost (updates in real-time)
- **Session Total:** Cumulative cost across all debates in your session
- **Model-specific pricing:**
  - Opus: $15/$75 per 1M tokens (best reasoning, slowest)
  - Sonnet: $3/$15 per 1M tokens (balanced, recommended)
  - Haiku: $0.80/$4 per 1M tokens (fastest, cheapest)
- Costs are saved to `.cache/debate-costs.json` after each debate completes

### Smart Scroll
- If you scroll up to read Elena's previous response, the page **stays put**
- Doesn't yank you to the bottom each time a new token arrives
- Scroll back to bottom to auto-scroll again

### Stop Button
- Red **STOP** button visible while debate is running
- Halts the stream immediately
- All cursors disappear, all text is final

### Markdown Rendering
- Headers, bold, code blocks, lists render properly
- No raw `##` or `**` symbols visible
- Agent responses look polished and readable

---

## Customizing the Agents

Each agent is **entirely defined by its Markdown file** — no code changes needed.

**Elena** (`agents/agent-meanrev.md`)
- Her philosophy, indicators, tone
- When she prioritizes safety vs. conviction
- Her view on risk management

**Marcus** (`agents/agent-trend.md`)
- His philosophy, indicators, tone
- When he prioritizes momentum vs. data
- His risk tolerance

### To edit:
1. Open `agents/agent-*.md`
2. Rewrite philosophy, indicators, tone, anything
3. Save and restart (`npm run dev`)
4. Try a new debate — new persona is live

**Constraint:** Keep the STANCE block format:
```
STANCE: bullish/bearish/neutral
CONVICTION: 1-10
AGREE_WITH_PARTNER: yes/no/partial
KEY_DISAGREEMENT: ...
```

---

## Deploying to Vercel

Push to GitHub → Vercel auto-deploys.

### One-time setup:
1. Push repo to GitHub (user: `zoharp`, repo: `trading-agents`)
2. Connect on [vercel.com](https://vercel.com) (import repo)
3. Add environment variables in Vercel project settings:
   - `ANTHROPIC_API_KEY` → from [Anthropic Console](https://console.anthropic.com/account/keys)
   - `SUPABASE_URL` → from stock-predictor's Supabase project
   - `SUPABASE_KEY` → from stock-predictor's Supabase project (anon key)
4. Deploy

### Important:
- **Vercel Pro required** ($20/mo) for 5-minute debates
- Hobby tier (free) has 10-second limit — not enough for agents to finish
- To reduce timeout: lower `MAX_ROUNDS` in `lib/orchestrator.ts`
- Supabase must be accessible from Vercel (check firewall rules if needed)

---

## Files You'll Likely Touch

| File | What it does | Edit when |
|------|-------|-----------|
| `profile/user-profile.md` | Your trading profile (experience, risk, goals) | Always — agents read this |
| `agents/agent-meanrev.md` | Elena's persona | You want to change her philosophy/tone |
| `agents/agent-trend.md` | Marcus's persona | You want to change his philosophy/tone |
| `app/page.tsx` | The UI | Adding features (cost display, etc.) |
| `lib/orchestrator.ts` | Debate loop, consensus rules | Adding indicators or changing MAX_ROUNDS |
| `lib/market-data.ts` | Technical indicator calculations | Adding EMA-200, or your own indicators |

For technical details, see **[CLAUDE.md](./CLAUDE.md)** (developer reference).

For design rationale on debate efficiency, see **[DEBATE_STRUCTURE.md](./DEBATE_STRUCTURE.md)** — explains how agents avoid repetition and accelerate consensus.

---

## Notes & Limitations

🚨 **Not financial advice.** This is a thinking tool. The agents can be confidently wrong.

- **Ticker extraction:** Regex-based (2–5 uppercase letters or `$SYMBOL`). Refine if needed.
- **Daily data only:** Supabase (stock-predictor) provides daily OHLCV candles. Intraday requires additional API integration.
- **No persistence:** Each session is fresh (no history storage).
- **Rate limits:** Anthropic has per-minute and monthly quotas. Monitor your [Anthropic dashboard](https://console.anthropic.com/account/usage).
- **Market data caching:** 1-hour TTL. Reuse cached data to reduce API calls. Second debate on same ticker = instant (no Supabase call). Cached data is used as fallback if API times out.
- **Cost:** Varies by model:
  - Haiku: ~$0.02–$0.05 per debate (fastest, cheapest)
  - Sonnet: ~$0.10–$0.25 per debate (balanced, recommended)
  - Opus: ~$0.50–$1.50 per debate (best reasoning, slowest)

---

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS
- **Backend:** Next.js API Routes (Node.js)
- **AI:** Anthropic Claude (Opus, Sonnet, or Haiku — user selects per debate)
- **Market Data:** Supabase (stock-predictor database, 25-second timeout protection, 1-hour caching)
- **Streaming:** Server-Sent Events (SSE)
- **Hosting:** Vercel
- **Cost persistence:** Supabase `debate_costs` table

---

## Troubleshooting

**Dev server won't start?**
```bash
# Kill any process on port 3000, restart
npm run dev
```

**TypeScript errors?**
```bash
npx tsc --noEmit
```

**Agents give wrong answers?**
- Edit their personas in `agents/*.md` — they're just Markdown files.
- Check they're receiving market data: Look for "CURRENT MARKET DATA" section in the UI or debug panel.
- If market data is missing/zero, make sure tickers are extracted correctly (`$NVDA` or `NVDA 2-5 letters).
- Clear cache if data seems stale: `rm -rf .cache/`

**Cost panel stuck at $0?**
- Make sure debate is running. Cost updates as agents speak.
- Check the Network tab in DevTools to see if usage events are streaming.
- Costs are persisted to the Supabase `debate_costs` table after each debate completes.
- Session total loads from `/api/debate-costs` on page mount.

**Market data fetch timing out?**
- Yahoo Finance requests have a 25-second timeout. If this happens frequently, check your internet connection.
- The system gracefully falls back to cached data (even if stale) if the fetch times out.
- Cached data is stored in `.cache/market-data-cache.json` (1-hour TTL).
- To clear cache and force fresh fetches: `rm -rf .cache/`

---

## Questions?

- **Setup help:** See [CLAUDE.md](./CLAUDE.md) → Setup Checklist
- **Customization:** See agent Markdown files (`agents/*.md`)
- **Technical details:** See [CLAUDE.md](./CLAUDE.md) and [system.md](./system.md)
- **Bug report:** Open an issue or DM [@zoharp](https://twitter.com/zoharp)

---

**Made with [Claude](https://www.anthropic.com/claude) + [Next.js](https://nextjs.org/)** — think better, trade smarter.
