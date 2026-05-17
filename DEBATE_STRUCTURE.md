# Debate Structure & Deduplication Guide

> **Status:** These instructions have been integrated into the agent personas (`agents/agent-meanrev.md` and `agents/agent-trend.md`). Elena and Marcus now follow the "Avoiding Repetition & Accelerating Consensus" guidelines below.

## Problem with Current Output
The raw debate transcript has:
- **Repeated paragraphs** (same point stated 2-3x with different wording)
- **No progress summary** (hard to see what changed from round to round)
- **Verbose synthesis** (agents re-explain everything in each turn)
- **No quick reference** (need to read full text to find disagreement)

## Proposed Solution: Condensed Debate Format

Instead of full transcripts, track:
1. **Agent Positions Table** — their stance + conviction at each round
2. **Agreement/Disagreement Matrix** — what they agree/disagree on
3. **Key Questions** — what still needs data/clarification
4. **Decision Tree** — final framework they produced
5. **Deduplication Markers** — flag when an agent repeats previous points

---

## Example: NVDA Debate Compressed

### Round-by-Round Positions

| Round | Elena Stance | Conviction | Marcus Stance | Conviction | AGREE_WITH_PARTNER | Key Disagreement |
|-------|--------------|-----------|---------------|-----------|-------------------|------------------|
| 1 | neutral | 3 | bullish | 7 | partial | Elena wants data first; Marcus trusts momentum trend |
| 2 | bullish | 6 | bullish | 8 | partial | Elena: wait for retracement; Marcus: buy dips in strong trend |
| 3 | bullish | 6 | bullish | 8 | partial | Same as R2 (REPEATED) |
| 4 | bullish | 7 | bullish | 8 | partial | Same as R2 (REPEATED) |
| 5 | bullish | 7 | bullish | 8 | **yes** | None — converged on 5 scenarios |
| 6 | — | — | — | — | **CONSENSUS** | Both agree on decision tree |

### Key Disagreement Areas (Not Yet Resolved)

| Issue | Elena | Marcus | Status |
|-------|-------|--------|--------|
| Buy breakout immediately? | No, wait for retest | Yes, if volume confirms | **CONVERGED** (both agree on Setup 1 & 2) |
| RSI 70-80 is safe? | Requires structure | Acceptable if trend intact | **CONVERGED** (both use context) |
| New money priority | Edge (high prob) | Participation (catch moves) | **ACKNOWLEDGED** — valid for different trader types |
| Entry timing | Day 2+ (confirmation) | Day 1 (early entry) | **PERSISTENT** — but they frame it as temperament, not wrong |

### Required User Data (Still Waiting)

```
❌ NVDA current price
❌ Price vs 20 EMA, 50 SMA
❌ RSI(14) reading
❌ What happened last 3-5 days?
❌ Volume trend
❌ Account size
❌ Current positions
❌ Timeframe (day/swing/position)
❌ Risk tolerance
❌ SPY/QQQ status
```

### Rounds 2-4: Redundancy Alert

**Elena's R2, R3, R4 all say the same thing:**
- "I want structure, not strength into blue sky"
- "Define your entry and stop"
- "Risk/reward minimum 1.5:1"

**Marcus's R2, R3, R4 all say the same thing:**
- "Setup 1 (breakout), 2 (pullback support), 3 (continuation on strength)"
- "My stops are structural, not arbitrary %"
- "Waiting costs you moves in momentum regimes"

**Solution:** Flag "REPEATED FROM ROUND X" and move to synthesis.

---

## Efficient Debate Format (Proposed)

Instead of streaming full prose responses, output:

```json
{
  "round": 5,
  "elena": {
    "stance": "bullish",
    "conviction": 7,
    "agree_with_partner": "yes",
    "new_points": [
      "I'll accept your aggressive entry in Scenario 2 if user has discipline"
    ],
    "repeated_from_previous": [
      "Structure + signal + context required (rounds 1-4)",
      "Risk/reward 1.5:1 minimum (rounds 1-4)"
    ]
  },
  "marcus": {
    "stance": "bullish",
    "conviction": 8,
    "agree_with_partner": "yes",
    "new_points": [
      "Happy to present both entry styles and let user choose"
    ],
    "repeated_from_previous": [
      "Setup 1, 2, 3 framework (round 2-4)",
      "Structure-based stops only (rounds 2-4)"
    ]
  },
  "consensus_areas": [
    "Scenarios 1, 2, 5 are buys",
    "Scenarios 3, 4 are nos",
    "Both want data before final answer"
  ],
  "divergences_remaining": [
    "Timing of entry (Day 1 aggressive vs Day 2 patient)",
    "Setup 3 (RSI 70-80 continuation): Marcus takes it small, Elena stands aside"
  ],
  "user_action": "WAITING FOR DATA: Which scenario is NVDA in? Account size? Experience level?"
}
```

---

## Implementation Ideas

1. **Detect Redundancy** — Track which points agents have already made; flag "REPEATED" instead of reprinting
2. **Summary Tables** — Every 2 rounds, output a "where we stand" table
3. **Divergence Tracker** — Highlight only what's *different* from the previous round
4. **Early Termination** — If agents have converged on 5 rounds, move to decision tree instead of round 6
5. **Escalation Trigger** — If the same disagreement repeats 3 rounds in a row without new data, escalate to "you decide" format

---

## Benefits

- **User doesn't scroll through duplicate paragraphs**
- **Debate length drops 60-70%** while keeping all substantive content
- **Progress is visible** (stance, conviction, agreement % by round)
- **Waiting-for-data signal is clear** (no more endless debate without facts)
- **Decision tree emerges faster** (Elena & Marcus can jump to it at R3-4 instead of R5-6)

---

## Next Steps

Would you like me to:
1. Refactor the orchestrator to output condensed JSON format?
2. Create a UI that renders both full transcript AND condensed summary?
3. Add "round-end summary card" showing agreement/divergence status?
4. Build redundancy detection that interrupts agents when they repeat?

