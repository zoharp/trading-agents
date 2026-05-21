# Trading Profile for Agent Systems
**Trader: Z | Updated: May 17, 2026**

---

## IDENTITY
- **Name**: Z
- **Experience Level**: 2+ years trading options & equities; primarily premium-selling strategies

---

## CAPITAL & POSITION SIZING
- **Account Balance**: ~$120,000, but uisn gmargin accoun tin IB. so my positions are at 160,000$

---

## TRADING STYLE & TIME HORIZON
- **Primary Strategy**: 
  1. **Credit Spreads**  — Index spreads (SPY/SPX/QQQ) + high-liquidity single stocks. 30-45 DTE, delta 0.15-0.20, $5-wide wings.
  2. **Covered Calls**  — Monetize existing holdings; secondary to spread income.
  3. **Cash-Secured Puts** — Entry strategy on stocks wanting to buy.
  4. **Leaps** - sually for short term, and sometimes hedge them with covered call

---

## HARD RULES (Non-Negotiable — Agent Must Enforce)

### Rule 1: Strict Stock Selection Criteria Before trading
a stock must meet four core criteria to ensure it is safe to hold long-term:
1. **Technical Edge**: The stock must have a strong, upward-trending chart for at least the past 1.5 years.
2. **Valuation**: It should have a positive Price-to-Earnings (P/E) ratio, ideally under 100.
3. **Premium Yield**: The stock's options must pay well. Specifically, a 30-delta put option expiring in 30 days should yield at least 2.5% in premium.
4. **Reliability**: The company cannot have a history of missing two consecutive earnings reports.

### Rule 1: 2x Stop on ALL Credit Spreads
- **Trigger**: Set GTC buy-to-close at **2x the credit received** the moment trade opens
  - Example: Sold SPY spread for $1.50 credit → Set buy-to-close stop at $3.00
- **Inside 3 DTE**: Widen stop from 2x to **3x** (theta decay accelerates; 2x stop melt losses)
  - Example: Spread worth $0.50 with 2 DTE → Widen stop from $3.00 to $4.50

### Rule 2: Earnings Protocol (Strict)
Never hold credit spread OR covered call through earnings unless ALL three are true:
1. Short strike is ≥13% OTM from earnings opening estimate
2. ≥15 calendar days remain AFTER earnings for recovery
3. Stock is ≥10% away from short strike heading into earnings night

**If uncertain**: Close position 2 days before earnings.

**Why**: TSLA/HOOD can gap 10-15% on earnings; stops don't protect gaps.

### Rule 3: Position Management at Profit
Close position when EITHER condition is met (whichever first):
- **75% of max profit captured**, OR
- **Remaining position value ≤ $100**

**Why**: Last 20-25% of premium takes longest to decay; exposes to reversal risk for minimal gain. Positions under $100 aren't worth the broker fee + time.

### Rule 4: Covered Calls on Growth Holdings
Covered calls on growth holdings (such as PLTR, HOOD, SOFI, TSLA) is risky, so make sure to do it:
1. short term - 7-14 days
2. Be ready to roll. 
3. do it in the right timing - not when the stockis clsoe to support, 
4. Do it on 30%-50% of the underlying assets
5. Aviod selling below purchase price. If you do - b ready to roll
6. Look for increasing implied volatility
7. Avid selling CC through earnings

These are held for big moves — CCs cap exactly those moves while keeping full downside. The $200-300 premium is NOT worth giving up a $5,000-10,000 recovery.

### Rule 5: Cash-Secured Puts Only on Genuine Entry Points
1. Never sell CSP on a stock you don't genuinely want to own at the strike price.
2. Delat < 0.3 unless you really want to get assigned
3. 

---

## GUIDELINES (Flexible — Agent Should Suggest, Not Enforce)

### Entry Preferences for Credit Spreads
- **Delta**: 0.15–0.20 (15-20 delta is optimal — 75-80% edge probability)
- **Width**: $5-wide spreads preferred (enough room for slippage, not too wide)
- **DTE**: 30-45 days to expiration (sweet spot for theta decay + still room to adjust)

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

---

## BEHAVIORAL PROFILE

### Strengths
- Disciplined on mechanical 2x stops when focused
- Patient with entry timing; doesn't FOMO into bad setups
- Honest about mistakes (HOOD, TSLA recovery thesis, earnings lessons)

---

## AGENT INTEGRATION POINTS

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