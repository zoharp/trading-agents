# Trading Profile for Agent Systems
**Trader: Z | Updated: May 17, 2026**

---

## IDENTITY
- **Name**: Z
- **Experience Level**: 2+ years trading options & equities; primarily premium-selling strategies
- **Account Type**: Taxable (Interactive Brokers)
- **Broker**: Interactive Brokers (IB account)

---

## CAPITAL & POSITION SIZING
- **Account Balance**: ~$164,448 (cost basis of holdings)
- **Max desired Risk Per credit spread Trade**: $500 per credit spread (via 2x stop)
- **Reserved Cash**: 15% minimum for margin buffer & assignment risk

---

## TRADING STYLE & TIME HORIZON
- **Primary Strategy**: 
  1. **Credit Spreads** (20 of income) — Index spreads (SPY/SPX/QQQ) + high-liquidity single stocks. 30-45 DTE, delta 0.15-0.20, $5-wide wings.
  2. **Covered Calls** (10% of income) — Monetize existing holdings; secondary to spread income.
  3. **Cash-Secured Puts** (50%) — Entry strategy on stocks wanting to buy (HOOD, TSLA, PLTR, SOFI).
- **Secondary Tactics**: LEAPs on core holdings (TSLA, PLTR, HOOD) for long-term recovery; diagonal spreads as alternative to straight CCs on volatile names.
- **Time Available**: Daily monitoring, decisions made end-of-day before 4pm ET
- **Decision Windows**: Primary entry/exit decisions 3-4pm, adjustments can happen anytime during market hours

---

## MARKETS & INSTRUMENTS
- **Primary Universe**: 
  - **Index spreads**: SPY, SPX, QQQ (primary income source — liquid, tight bid-ask)
  - **Single stocks**: HOOD, TSLA, PLTR, SOFI, APLD, plus other mega-cap tech 
- **Acceptable Instruments**: 
  - Vertical call spreads (bull call for CSP entry)
  - Vertical put spreads (credit spreads, iron condors)
  - Covered calls (strict rules — see Rule 5)
  - Cash-secured puts (only on desired entry points)
  - Diagonal spreads (sell short call against LEAP)
- **Minimum Liquidity**: 
  - Index spreads: Bid-ask spread ≤ $0.5, volume ≥ 1K contracts
  - Single stocks: Volume ≥ 1M shares/day
  - Options: Open interest ≥ 100 contracts at target strikes

---

## HARD RULES (Non-Negotiable — Agent Must Enforce)

### Rule 1: 2x Stop on ALL Credit Spreads
- **Trigger**: Set GTC buy-to-close at **2x the credit received** the moment trade opens
  - Example: Sold SPY spread for $1.50 credit → Set buy-to-close stop at $3.00
- **Inside 3 DTE**: Widen stop from 2x to **3x** (theta decay accelerates; 2x stop melt losses)
  - Example: Spread worth $0.50 with 2 DTE → Widen stop from $3.00 to $4.50
- **Exception**: NEVER override 2x rule based on "support," "RSI oversold," or "it'll bounce"
  - **Why**: 30-40% of stopped trades recover, but 60% don't — account killers
  - **Historical**: PLTR $130/$125 spread held past 2x, resulted in $700 loss instead of $500
  - **Agent must say**: "This is at 2x stop. Close it. Do not wait for recovery."

### Rule 2: Earnings Protocol (Strict)
Never hold credit spread OR covered call through earnings unless ALL three are true:
1. Short strike is ≥13% OTM from earnings opening estimate
2. ≥15 calendar days remain AFTER earnings for recovery
3. Stock is ≥10% away from short strike heading into earnings night

**If uncertain**: Close position 2 days before earnings.

**Why**: TSLA/HOOD can gap 10-15% on earnings; stops don't protect gaps.

**Current holdings with earnings risk**: HOOD (Apr 28 ✓ passed), SOFI (Apr 29 ✓ passed).

### Rule 3: Position Management at Profit
Close position when EITHER condition is met (whichever first):
- **75% of max profit captured**, OR
- **Remaining position value ≤ $100**

**Why**: Last 20-25% of premium takes longest to decay; exposes to reversal risk for minimal gain. Positions under $100 aren't worth the broker fee + time.

### Rule 4: NO Covered Calls on Growth Holdings
Do NOT sell covered calls on: **HOOD, TSLA, PLTR, SOFI, or any high-conviction recovery stock**

These are held for big moves — CCs cap exactly those moves while keeping full downside. The $200-300 premium is NOT worth giving up a $5,000-10,000 recovery.

**Historical**: Z bought back HOOD & TSLA CCs after sudden 10%+ jumps. Premium collected: ~$400. Loss on buyback: $9,500. Net: −$9,100.

**Exception — Diagonal Spreads Only**: 
- Sell short call against existing LEAP (call gains offset short call loss)
- Cover only 25-50% of shares, never 100%
- Only sell calls at strikes you'd genuinely be happy selling at

**Covered calls ARE appropriate for**: Stable, mature, non-growth names only (dividend payers, ETFs, boring large-caps).

### Rule 5: Never Sell CCs Through Earnings
If CC expiration falls before or during earnings, either:
- Close the CC 2 days before earnings, OR
- Roll CC out past earnings before event

**Why**: HOOD jumped $69→$83 in 4 days pre-earnings. Z had $80 CC expiring May 1 with earnings Apr 28 — forced buyback at large loss.

### Rule 6: Stop Type Selection
- **Stop-Market**: Use when gap risk is high (earnings approaching, volatile stock, tight OTM cushion). Guarantees exit but may fill worse.
- **Stop-Limit**: Use when strike is well OTM (13%+) and no imminent catalyst. Set limit $0.20 above trigger for fill room.

### Rule 7: Cash-Secured Puts Only on Genuine Entry Points
Never sell CSP on a stock you don't genuinely want to own at the strike price. Premium is a bonus for waiting, not the primary reason.

**If assignment happens**: Be ready to hold long-term OR transition to wheel (sell calls against new position).

---

## GUIDELINES (Flexible — Agent Should Suggest, Not Enforce)

### Entry Preferences for Credit Spreads
- **Delta**: 0.15–0.20 (15-20 delta is optimal — 75-80% edge probability)
- **Width**: $5-wide spreads preferred (enough room for slippage, not too wide)
- **DTE**: 30-45 days to expiration (sweet spot for theta decay + still room to adjust)
- **Target Profit**: 2–3% on account per trade (gives sustainable monthly 3-5% target)
- **Margin Requirement**: ≤ 5% of account per spread (leaves room for 8-10 concurrent positions)

### Entry Preferences for Covered Calls (Stable Stocks Only)
- **Strike Selection**: At-the-money (ATM) or out-of-the-money (OTM) only
  - If stock is below cost basis by >20%, sell OTM only with active rolling plan
- **DTE**: 30-45 days to expiration
- **Premium Target**: Minimum $200-300 per CC (commissions + effort threshold)

### Entry Preferences for Cash-Secured Puts
- **Strike Selection**: Only at prices you'd buy the stock
- **DTE**: 30-45 days preferred (theta decay + recovery room)
- **Capital Tie-Up**: Only if you have cash to handle assignment OR willing to hold indefinitely

### Exit/Rolling Strategy
- **Profit-taking**: Hit 75% max profit? Close it. Life is short.
- **Rolling on 2x stop**: If 7+ DTE remain AND trade hasn't violated earnings protocol:
  - Roll down and out (sell new spread further OTM, later expiration)
  - Take 50% of the loss, keep 50% of credit as risk
- **Rolling on edge**: If Edge Score < 40 on a CSP/CC, close instead of rolling

### Portfolio Composition Targets
- **60-70%**: Credit spreads (indexes + single stocks) — primary income engine
- **15-20%**: Covered calls (stable positions only) — secondary income
- **10-15%**: Cash-secured puts + long core holdings — core recovery positions
- **5%**: Hedges / learning experiments

---

## BEHAVIORAL PROFILE

### Strengths
- Disciplined on mechanical 2x stops when focused
- Patient with entry timing; doesn't FOMO into bad setups
- Honest about mistakes (HOOD, TSLA recovery thesis, earnings lessons)

### Weaknesses & Biases to Watch

1. **"Support" Trap**: Holds losing trades hoping for chart bounces. Has cost $5,000+ in blowout losses.
   - **Agent should**: Remind of PLTR example ($700 loss instead of $500). Enforce 2x stops mechanically.
   - **Trigger phrase**: If Z mentions "support," "resistance," or "it should bounce" — agent says "That's not in the rules. Close at 2x."

2. **Growth Stock CC Greed**: Sells CCs on high-conviction recovery plays (HOOD, TSLA) to "get a few hundred dollars," then watches stock run $5,000+ and regrets it.
   - **Agent should**: Pre-emptively ask "Is this a growth stock you're waiting for a big move on?" before approving any CC.
   - **Trigger phrase**: If Z wants to sell CC on HOOD/TSLA/PLTR/SOFI, push back: "You've lost $9k+ doing this. Do you genuinely want to sell these shares at this strike?"

3. **Earnings Blindness**: Holds positions through earnings and gets gapped. Doesn't always check calendar.
   - **Agent should**: Flag any position with earnings within 2 weeks automatically. Ask to confirm hold before expiration.
   - **Trigger phrase**: Any spread or CC within 30 days of earnings → "Earnings are [date]. Do you want to hold this through it?"

4. **Late-Expiration Greed**: Holds positions to max profit (100%) and gets reversed in final 3 days, turning 75% profit into 0% or loss.
   - **Agent should**: Suggest close at 75% daily for positions with <5 DTE remaining.


---

## AGENT INTEGRATION POINTS

### Escalation Thresholds (Always Ask Before Acting)
- [x] ANY trade that violates a hard rule (Rule 1-7)
- [x] Unusual volatility (IV rank > 80%, or 1-day move > 7%)
- [x] Close to earnings (7 days or less) with existing positions

### Trade Suggestion Format
When recommending a new trade, agent provides:
```
TRADE SUGGESTION: [Date]
Ticker/Instrument: SPY 555/550 Put Spread
Action: SELL (credit spread)
Entry Price: $1.50 credit
Stop-Loss: Buy-to-close at $3.00 (2x stop)
Profit Target: Close at $0.37 (75% of $1.50)
Max Risk: $500 ($5-wide spread)
DTE: 42 days
Edge Score: [Z's tool result]
Earnings Risk: None in next 45 days
Rationale: IV rank at 65%; theta decay optimal in 40-45 DTE window. Your target 3-5%/mo — this is $150 profit on $500 risk = 30% return toward monthly goal.
Warnings: Earnings in 47 days (safe). Monitor if VIX drops below 15 (retreat to safer deltas).
GO/NO-GO: [Agent recommendation + Z's confirmation needed]
```

---

## RULES DECISION TREE

### "Should I adjust this spread?"
```
Is loss ≥ 2x credit received?
├─ YES → CLOSE IMMEDIATELY (Rule 1)
└─ NO → Continue

Are there ≤ 3 days to expiration?
├─ YES → Widen stop from 2x to 3x
│   └─ Is new stop profitable to hit? YES → Keep; NO → Close now
└─ NO → Continue

Is earnings within 14 days?
├─ YES → Is short strike ≥13% OTM AND ≥15 DTE after earnings?
│   ├─ YES → Can hold, but monitor
│   └─ NO → Close or roll out (Rule 2)
└─ NO → Continue

Is there ≥15 DTE remaining?
├─ YES → Consider roll down-and-out if close to 2x
└─ NO → Decide based on remaining premium vs theta decay

Is remaining premium < $100?
├─ YES → CLOSE (Rule 3)
└─ NO → Hold for theta decay or close at 75% profit
```

### "Should I sell a covered call on this stock?"
```
Is stock a high-conviction growth holding (HOOD/TSLA/PLTR/SOFI/similar)?
├─ YES → NO regular CCs
│   └─ Use diagonal spread instead (sell call against LEAP, cover 25-50% only)
└─ NO → Continue

Is earnings within 30 days of CC expiration?
├─ YES → DON'T SELL or roll out past earnings (Rule 5)
└─ NO → Continue

Would you be genuinely happy selling shares at this strike?
├─ NO → Don't sell
└─ YES → Continue

Is strike ≥ cost basis (or within recovery plan)?
├─ YES → Proceed with 30-45 DTE, sell at/above cost basis
└─ NO → Only sell if cost basis is far behind (−20%+) with active rolling plan

Is minimum $200 premium collected?
├─ YES → Proceed
└─ NO → Skip, not worth the effort/commissions
```

---

## SUCCESS METRICS & REVIEW

- **Target Monthly Return**: 3–5% on account
  - Achieved via 60-70% credit spreads (main driver) + 15-20% CCs + 10-15% long positions
- **Acceptable Win Rate**: 55–65%
  - With 2x stop-loss rule, win rate can be lower than naive spreads; focus on risk/reward, not W/L count

---

## NOTES FOR AGENT

**Communication Style**:
- Z wants **blunt, honest analysis** — no sugarcoating
- Understands options mechanics well; provide technical detail when relevant
- Appreciates **concrete examples with real numbers** over abstract advice
- If Z is considering something risky, say "This costs you $X historically" rather than "Be careful"

**Conflict Resolution**:
- If Z wants to override Rule 1 (2x stop): Show historical loss, remind of PLTR example, ask why this time is different

---

**Last Updated**: May 17, 2026
**Next Review**: May 24, 2026 (weekly)
