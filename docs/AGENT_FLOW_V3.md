# Agent v3 - Final Flow Specification

## Key Assumptions
- **Max 10 tickers** per run (manageable API load)
- **21 IPS factors** covering all aspects (liquidity, Greeks, risk, diversification)
- **Alpha Vantage rate limit**: 500 calls/minute without cap on daily calls

---

## Flow Steps

### 1. Start
**Decision:** Were tickers pre-loaded or selected?
- **Yes** → Proceed to Pull IPS
- **No** → Error: "Notify user that tickers need to be selected"

---

### 2. Pull IPS
Load active IPS configuration with all 21 factors and their weights.

---

### 3. Determine Contract Dates Available
Check IPS for:
- DTE range (e.g., 7-14 days, 30-45 days)
- Expiration type (weekly/monthly)
- Available contracts within next 14 days

---

### 4. Pre-Filter: Chain-Independent Factors (NEW STEP)

**Purpose:** Reduce tickers before expensive options chain API calls

**Process:**
```
For each ticker:
  ├─ Pull general data (non-chain factors):
  │   ├─ Earnings date (from Alpha Vantage OVERVIEW)
  │   ├─ Sector/industry classification
  │   ├─ Market cap, average volume
  │   ├─ Fundamental ratios (P/E, debt/equity)
  │   └─ News sentiment (Tavily)
  │
  └─ Filter on factors with weights ≥5 that DON'T require options chains:
      ├─ "No earnings within 14 days" (weight 10)
      ├─ "Sector bullish sentiment" (weight 7)
      ├─ "Average volume >500k" (weight 6)
      └─ etc.
```

**Decision:** Are there any tickers left that pass all general factors?
- **Yes** → Proceed to pull options chains (Step 5)
- **No** → Reasoning Model (Step 4a)

---

### 4a. Reasoning Model (First Gate)
**Context:** No tickers passed general factor filters (weights ≥5)

**Decision:**
- Were factors just barely missing targets? (<10% of target)
- Do we take the closest trades and proceed?
- Suggest No Trade (only if prior data suggests)?
- **Proceed with looking for trades?**

**Outcome:**
- **Yes** → Pull options chains for "close enough" tickers
- **No** → Notify user: "Tickers need to be selected" (no viable candidates today)

---

### 5. Pull Stock-Specific Data (PSSA)

**For surviving tickers only:**

**General Info:**
- Inflation, jobs reports, Fed meetings, sector rotation (Alpha Vantage, FRED)

**Stock-Specific:**
- Company overview, earnings calls, sector sentiment (Alpha Vantage, Tavily)

**Options Chains:**
- Starting ATM, pull 20 options chains on decreasing strike prices
- Focus on DTE range from IPS (e.g., 30-45 days)
- If we only have delta and IV weighted above 5, then we just pull 40 data points (delta/IV for 20 strikes)

**API Rate Management:**
- If alpha-vantage calls exceed 500 then wait 60 seconds and continue evolving
- **Critical:** It is crucial to evaluate ALL data before proceeding

---

### 6. Filter on High-Weight Factors (weights ≥5)

**Apply remaining chain-dependent factors:**
- IV Rank >50 (weight 8)
- Delta range 0.30-0.40 (weight 7)
- Bid-ask spread <$0.10 (weight 6)
- Open Interest >100 (weight 5)

**Decision:** Are there any trades left that qualify?
- **Yes** → Proceed to low-weight factors (Step 8)
- **No** → Reasoning Model (Step 7)

---

### 7. Reasoning Model (Second Gate)

**Context:** Trades filtered out by high-weight factors

**RAG Enhancement:**
```
Retrieve similar historical scenarios where:
- Same symbols/strategies
- Similar factor miss patterns
- Similar market regime
```

**Decision:**
- Were factors just barely missing targets? (<10% of target)
- Do we take the closest trades and proceed?
- Suggest No Trade (only if prior data suggests based on RAG retrieval)
- **Proceed with looking for trades?**

**Outcome:**
- **Yes** → Proceed to low-weight factors (Step 8)
- **No** → "Suggest Cash/Wait - Alert user: No qualifying trades meet IPS criteria today"

---

### 8. Filter on Low-Weight Factors (weights <5)

**Apply remaining factors:**
- Theta >$5/day (weight 4)
- Gamma <0.02 (weight 3)
- Vega <$15 (weight 3)
- News sentiment positive (weight 2)

**Decision:** Are there any trades left that qualify?
- **Yes** → RAG + Sort (Step 10)
- **No** → Reasoning Model (Step 9)

---

### 9. Reasoning Model (Third Gate)

**Context:** All factors applied, some/all trades filtered out

**RAG Enhancement:**
```
Retrieve historical outcomes when:
- Factors were 10% outside target weights
- Suggest No Trade (all factors >30% outside of target weights)
- Prior similar scenarios
```

**Decision:**
- Were factors just barely missing targets? (<10% of target)
- Do we take the closest trades and proceed?
- Suggest No Trade (only if prior data suggests)
- **Proceed with suggesting trades?**

**Outcome:**
- **Yes** → RAG + Sort (Step 10)
- **No** → "Suggest Cash/Wait - Alert user: No qualifying trades meet IPS criteria today"

---

### 10. RAG Correlation + Sort

**Review Database to find trades that have high correlation to successful trades**

**RAG Query:**
```typescript
For each candidate trade:
  ├─ Embed trade characteristics:
  │   ├─ Symbol, strategy, IPS factors met/total
  │   ├─ IV Rank, DTE, delta, theta
  │   ├─ Market regime (VIX, sector rotation)
  │
  ├─ Retrieve top 10 similar historical trades
  │
  └─ Calculate composite score:
      = (Yield × 0.4)
      + (IPS % × 0.3)
      + (Historical Win Rate × 0.3)
```

**NOTE:** If no trades data available, still proceed with process using pure IPS score + yield

---

### 11. Sort Highest to Lowest Yield, Keep Top 5

Sort by **composite score** (not just yield)

---

### 12. Diversification Check (Final Gate)

**If ticker already has ≥10% of portfolio weight, take note for final display**

**Filters:**
- Max 2 trades per symbol (avoid concentration)
- Max 3 trades per expiration week (avoid clustering)
- Ensure strategy mix aligns with IPS (e.g., if IPS allows 3 strategies, don't send all PCS)

---

### 13. Notify User by Displaying All Available Trades

**Show IPS % captured for each trade**

**Display format:**
```
Trade 1: AMD Put Credit Spread
├─ IPS Score: 85% (18/21 factors met)
├─ Composite Score: 78 (Yield: 12%, Win Rate: 65%)
├─ Entry: Sell $140P / Buy $135P @ $1.20 credit
├─ Max Loss: $380 | Max Gain: $120 | Breakeven: $138.80
├─ DTE: 35 | IV Rank: 62 | Delta: -0.35
├─ Historical: 8 similar trades, 62% win rate, avg ROI: 9%
└─ ⚠️ Note: AMD already 12% of portfolio
```

---

### 14. End

---

## RAG Integration Points

### Reasoning Model Node 1 (Step 4a)
**Query:** "Historical outcomes when earnings/sector factors barely missed targets"

### Reasoning Model Node 2 (Step 7)
**Query:** "Similar trades with IV Rank/Delta/Liquidity near targets - what happened?"

### Reasoning Model Node 3 (Step 9)
**Query:** "When we proceeded with trades 10% outside all targets - outcomes?"

### Final Scoring (Step 10)
**Query:** "Find all historical trades similar to these candidates - win rates?"

---

## Implementation Priority

1. ✅ **Enable pgvector** (DONE)
2. **Build basic agent flow** without RAG first
3. **Add embedding pipeline** for closed trades
4. **Integrate RAG at reasoning nodes**
5. **Test with paper trading**

---

## Next Steps

**Option A:** Build the agent flow first, RAG later
- Pro: See the agent work end-to-end quickly
- Con: Reasoning decisions won't have historical context initially

**Option B:** Set up RAG infrastructure now, then build agent
- Pro: Reasoning nodes have context from day 1
- Con: Can't test agent until RAG is working

**Recommendation:** **Option A** - Build agent flow first, add RAG to reasoning nodes incrementally.

You'll have enough data from your existing trades table to seed RAG once the agent is working.
