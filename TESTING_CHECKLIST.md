# Testing Checklist — Round Summary Cards & Market Data Cache

## What's New

1. **Round Summary Cards** — After each round, see a status card showing:
   - Elena's stance (bullish/bearish/neutral) + conviction + agreement status
   - Marcus's stance + conviction + agreement status
   - Agreement Score (0-100%) showing alignment
   - Color-coded indicator (green = strong agreement, red = disagreement)

2. **Market Data Cache** — Saves data to `.cache/market-data-cache.json`:
   - 1-hour TTL (if cache is fresh, no API call)
   - Fallback to stale cache if API fails
   - Reduces Yahoo Finance API load

---

## Test Plan

### Test 1: UI Summary Cards (No Market Data Needed)

1. Run `npm run dev`
2. Open http://localhost:3000
3. Ask a question: **"Should I buy NVDA tomorrow?"**
4. **Watch for:**
   - ✅ Elena speaks (Round 1)
   - ✅ Round summary card appears below Elena with:
     - Elena's stance, conviction, agreement status
   - ✅ Marcus speaks (Round 1)
   - ✅ Round summary card appears below Marcus with:
     - Marcus's stance, conviction, agreement status
     - Agreement score (visible in card)
   - ✅ Each round repeats with new summary cards
5. **Expected:** Cards should show increasing agreement score if they're converging

### Test 2: Market Data Cache

1. **First run:** Ask "Should I buy NVDA?" (same as Test 1)
   - Check `.cache/market-data-cache.json` exists
   - Look for NVDA entry with `fetchedAt` timestamp

2. **Within 1 hour:** Ask "What about NVDA?" or "Buy SPY?"
   - ✅ NVDA should load from cache (faster, no "Fetching market data..." message)
   - ✅ SPY should fetch fresh data (new ticker)

3. **Check cache file:**
   ```bash
   cat .cache/market-data-cache.json
   ```
   Should show:
   ```json
   {
     "NVDA": {
       "symbol": "NVDA",
       "data": { ...technical snapshot... },
       "fetchedAt": 1716234567890
     }
   }
   ```

### Test 3: Clear & Refresh Cache

1. Delete cache:
   ```bash
   rm -rf .cache/
   ```

2. Run debate again — cache should be recreated

---

## What to Report

✅ **If working:**
- Round summary cards appear after each round
- Agreement scores make sense (go up if converging, stay flat if repeating)
- Cache file is created and reused

❌ **If broken:**
- Round summary cards don't appear
- Agreement scores are always 0 or nonsensical
- Cache file not created
- Include screenshot of the issue

---

## Files Changed

| File | Change |
|------|--------|
| `lib/orchestrator.ts` | Added `round-summary` event type, agreement scoring, event emission |
| `app/page.tsx` | Added `RoundSummary` component, updated Turn interface, handleEvent for summaries |
| `lib/market-data.ts` | Added caching logic with 1-hour TTL, fallback to stale cache |
| `.gitignore` | Added `.cache/` |
| `CLAUDE.md` | Documented round summary cards and market data caching |
| `README.md` | Added summary cards and caching to feature list |

---

**After testing**, let me know:
1. Do the summary cards appear?
2. Is the cache file created?
3. Does cache improve performance on repeated tickers?
4. Any UI glitches?
