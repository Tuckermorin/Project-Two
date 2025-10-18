# Agent Optimality Audit

## Overview

The Agent Optimality Audit is a comprehensive validation tool that answers the critical question: **"Is the agent finding the BEST trades, or just acceptable ones?"**

Given the massive number of possible put credit spread combinations (different strikes, DTEs, spread widths), it's essential to validate that the agent's filtering and scoring logic is actually surfacing the optimal opportunities.

## The Problem

The agent currently has several limitations that might cause it to miss optimal trades:

### 1. Limited Expiration Testing
```typescript
// From options-agent-v3.ts:889-894
const expirations = validExpirations
  .map(expiry => ({ expiry, dte: calculateDTE(expiry) }))
  .sort((a, b) => a.dte - b.dte)
  .slice(0, 3)  // ⚠️ Only tests first 3 expirations!
  .map(e => e.expiry);
```

**Impact:** If the optimal trade is at the 4th or 5th expiration date, it won't be considered.

### 2. Limited Strike Testing
```typescript
// From options-agent-v3.ts:913
for (let i = 0; i < Math.min(100, expiryPuts.length - 1); i++) {
  // ⚠️ Only tests first 100 strikes per expiration
```

**Impact:** For high-priced stocks (like AMZN at $200+), there could be 200+ strikes. Far OTM strikes that might be optimal get skipped.

### 3. Limited Spread Width Testing
```typescript
// From options-agent-v3.ts:921-923
const longPut = expiryPuts[i + 1] || expiryPuts[i + 2] || expiryPuts[expiryPuts.length - 1];
// ⚠️ Only tests 1-strike and 2-strike spreads
```

**Impact:** 5-wide or 10-wide spreads might have better risk-adjusted returns but are never tested.

### 4. Sequential Processing
The agent processes symbols one at a time and applies early filtering, which means:
- A 95% IPS fit trade on Symbol A might get selected
- But a 98% IPS fit trade on Symbol B never gets evaluated because Symbol A already filled the quota

## The Solution: Exhaustive Audit

The audit script `scripts/audit-agent-optimality.ts` tests **ALL possible combinations**:

### What It Tests

1. **All Expirations** - Not just first 3, but every single expiration within DTE range
2. **All Strikes** - Every strike, not just first 100
3. **Multiple Spread Widths** - Tests 1, 2, 3, 5, and 10-strike spreads
4. **All Scores** - Calculates IPS, Yield, and Composite scores for every combination

### Example Scale

For a typical high-volume stock like **AMZN**:
- **Expirations:** ~50 (weekly + monthly options)
- **Strikes per expiration:** ~200
- **Spread widths:** 5 (1, 2, 3, 5, 10)
- **Total combinations:** ~50,000

The audit tests all 50,000 combinations and finds the true optimal trade.

## Usage

### Basic Audit
```bash
npx tsx scripts/audit-agent-optimality.ts --symbol=AMZN
```

### With Specific IPS Configuration
```bash
npx tsx scripts/audit-agent-optimality.ts --symbol=TSLA --ips-id=20edfe58-2e44-4234-96cd-503011577cf4
```

### Example Output

```
🔍 AUDIT: AMZN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Step 1: Fetching comprehensive options data...
   Current price: $198.25

⚙️  Step 2: Loading IPS configuration...
   IPS: Elite Income Strategy
   DTE Range: 1-45 days
   Factors: 17 enabled

🔨 Step 3: Generating all possible combinations...
   Testing 48 expirations
   2025-10-25 (7d): Testing 187 strikes × 5 widths
   2025-11-01 (14d): Testing 203 strikes × 5 widths
   ...
   Generated 52,340 total candidates

📈 Step 4: Scoring all candidates...
   Scored 52,340 candidates

🏆 Step 5: Ranking candidates...

📊 Step 6: Calculating statistics...

🤖 Step 7: Checking agent's selection...
   Agent selected: 180.00 / 175.00 put spread, 14 DTE

🎯 AUDIT RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Symbol: AMZN
Total combinations tested: 52,340
Expirations tested: 48
Spread widths tested: 1, 2, 3, 5, 10

📊 Score Distribution:
   Composite: 12.3 - 87.4 (avg: 52.1, median: 51.8)
   IPS:       40.0 - 98.5 (avg: 71.2, median: 70.0)
   Yield:     8.5 - 92.3 (avg: 45.6, median: 44.2)

🏆 Top 5 by Composite Score:
   1. $175/170 14d - Composite: 87.4, IPS: 94.2%, Yield: 76.8, Credit: $0.28, PoP: 92%
   2. $180/175 14d - Composite: 86.1, IPS: 92.1%, Yield: 76.4, Credit: $0.31, PoP: 89%
   3. $170/165 14d - Composite: 85.7, IPS: 95.8%, Yield: 70.2, Credit: $0.24, PoP: 94%
   4. $175/170 21d - Composite: 84.3, IPS: 91.5%, Yield: 73.1, Credit: $0.42, PoP: 90%
   5. $172/167 14d - Composite: 83.9, IPS: 93.2%, Yield: 69.8, Credit: $0.26, PoP: 93%

🎖️  Top 5 by IPS Score:
   1. $170/165 14d - IPS: 95.8%, Composite: 85.7, Yield: 70.2, Credit: $0.24
   2. $175/170 14d - IPS: 94.2%, Composite: 87.4, Yield: 76.8, Credit: $0.28
   3. $172/167 14d - IPS: 93.2%, Composite: 83.9, Yield: 69.8, Credit: $0.26
   4. $180/175 14d - IPS: 92.1%, Composite: 86.1, Yield: 76.4, Credit: $0.31
   5. $177/172 14d - IPS: 91.8%, Composite: 82.5, Yield: 68.3, Credit: $0.29

💰 Top 5 by Expected Value (per dollar at risk):
   1. $160/155 7d  - EV/$: 0.042, Composite: 78.2, Credit: $0.18, PoP: 96%
   2. $165/160 7d  - EV/$: 0.038, Composite: 76.9, Credit: $0.19, PoP: 95%
   3. $170/165 14d - EV/$: 0.035, Composite: 85.7, Credit: $0.24, PoP: 94%
   4. $162/157 7d  - EV/$: 0.033, Composite: 77.4, Credit: $0.17, PoP: 96%
   5. $175/170 14d - EV/$: 0.032, Composite: 87.4, Credit: $0.28, PoP: 92%

🤖 Agent's Selection:
   $180/175 14d
   Composite: 86.1, IPS: 92.1%, Credit: $0.31
   Rank in Composite: #2 of 52,340
   Rank in IPS: #4 of 52,340

   ✅ NEAR-OPTIMAL - Agent selected the 2nd best trade by composite score!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Interpreting Results

### ✅ Optimal Selection (Ranks #1-5)
If the agent's selection ranks in the top 5 for composite score, the agent is performing well. The small differences between top candidates are often negligible in practice.

### ⚠️ Sub-Optimal Selection (Ranks #6-20)
If the agent ranks 6-20, investigate why. Common reasons:
- **Filtering too aggressive** - Top candidate was filtered out early
- **Limited combinations** - Top candidate uses a spread width not tested (e.g., 7-wide)
- **Missing expiration** - Top candidate was at expiration #4 or #5

### ❌ Poor Selection (Ranks #21+)
If the agent ranks below 20, there's a problem with the selection logic:
- **Scoring weights** - Composite score weights may not match your goals
- **Factor thresholds** - IPS thresholds may be excluding good trades
- **Early termination** - Agent stopped searching too soon

## Common Findings & Fixes

### Finding #1: Better Trades at Later Expirations

**Symptom:** Top-ranked trades are at expiration #4 or #5, but agent only tested first 3.

**Fix:** Increase expiration limit in agent config:
```typescript
// options-agent-v3.ts:893
.slice(0, 5) // Increase from 3 to 5
```

### Finding #2: Wider Spreads Perform Better

**Symptom:** Top-ranked trades use 5-wide or 10-wide spreads, but agent only tests 1-wide and 2-wide.

**Fix:** Test multiple spread widths:
```typescript
// options-agent-v3.ts:921-923
for (const widthOffset of [1, 2, 3, 5]) {
  const longPut = expiryPuts[i + widthOffset];
  if (!longPut) continue;
  // ... create candidate
}
```

### Finding #3: Far OTM Trades Score Higher

**Symptom:** Top-ranked trades are beyond the 100-strike limit.

**Fix:** Increase strike limit for high-priced stocks:
```typescript
// options-agent-v3.ts:913
const strikeLimit = currentPrice > 150 ? 200 : 100;
for (let i = 0; i < Math.min(strikeLimit, expiryPuts.length - 1); i++) {
```

### Finding #4: IPS Weights Don't Match Goals

**Symptom:** Top IPS-scoring trades have low expected value.

**Fix:** Adjust composite score weights:
```typescript
// options-agent-v3.ts:1541
const compositeScore = (yieldScore * 0.5) + (ipsScore * 0.5); // Balance IPS and Yield more evenly
```

## Automation

You can run this audit as part of your workflow:

### After Each Agent Run
```bash
# Run agent
npm run agent:run

# Audit results for each symbol
for symbol in AMZN TSLA MU; do
  npx tsx scripts/audit-agent-optimality.ts --symbol=$symbol
done
```

### Batch Audit
Create a script to audit your entire watchlist and generate a report:

```typescript
// scripts/batch-audit.ts
const symbols = ["AMZN", "TSLA", "MU", "AMD", "NVDA"];
const results = [];

for (const symbol of symbols) {
  const result = await auditAgentOptimality({ symbol, ... });
  results.push(result);
}

// Generate HTML report
generateReport(results);
```

## Performance Considerations

Testing 50,000+ combinations takes time:

- **AMZN (~50k combinations):** ~5 minutes
- **TSLA (~30k combinations):** ~3 minutes
- **MU (~15k combinations):** ~90 seconds

**Optimization tips:**
1. Cache results - Store audit results in database for future comparison
2. Parallel processing - Score multiple candidates in parallel
3. Smart filtering - Apply basic filters (delta, credit) before scoring to reduce candidates
4. Sample testing - For quick checks, test a sample of 1000 random combinations

## Conclusion

The audit tool gives you confidence that your agent is finding the best trades, not just acceptable ones. Run it periodically to validate your filtering logic and catch any regressions when you update the agent's scoring system.

**Key Takeaway:** If the agent consistently ranks in the top 5-10 trades across multiple symbols, your filtering and scoring logic is solid. If not, use the audit results to identify exactly where trades are being missed and fix the root cause.
