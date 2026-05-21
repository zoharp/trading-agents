# Database Schema

Supabase project: `nkhyphhrqfbhzjvqonhq` (shared with stock-predictor)

---

## Tables (stock-predictor — read-only)

### `prices`
Daily OHLCV candles per ticker.

| Column | Type | Notes |
|--------|------|-------|
| date | date | |
| ticker | text | |
| open | numeric | |
| high | numeric | |
| low | numeric | |
| close | numeric | |
| volume | bigint | |

### `slow_data`
Pre-calculated fundamental and sentiment signals per ticker.

| Column | Type | Notes |
|--------|------|-------|
| ticker | text | |
| call_name | text | Signal type key (e.g. `analyst_data`, `put_call_ratio`) |
| data | jsonb | Signal payload |
| updated_at | timestamptz | |

---

## Tables (trading-agents — owned)

### `debate_costs`
Persists token usage and USD cost after each completed debate.

| Column | Type | Notes |
|--------|------|-------|
| id | bigserial | Primary key |
| timestamp | timestamptz | Debate completion time |
| ticker | text | Ticker(s) debated |
| rounds | int | Number of debate rounds |
| input_tokens | int | Total input tokens |
| output_tokens | int | Total output tokens |
| cost_usd | numeric(10,6) | Calculated USD cost |
| model | text | Claude model used |

Created: 2026-05-21. No RLS.
