# Agent Diversification Configuration Guide

## Problem Summary

The agent was previously returning only **3-4 unique stocks** despite having a **22-stock watchlist**. This was caused by:

1. **Small candidate pools**: Only 20 final recommendations
2. **No diversity filtering**: Multiple contracts per stock without prioritizing unique stocks
3. **Hardcoded limits**: No easy way to adjust recommendation counts

## Changes Made

### 1. Increased Candidate Pool Sizes

**File**: [src/lib/agent/options-agent-v3.ts](src/lib/agent/options-agent-v3.ts)

- **Line 851**: Increased from 50 → **100** candidates after initial filtering
- **Line 2086**: Increased from 30 → **80** candidates before diversity filtering
- **Line 2097**: Increased from 20 → **40** final recommendations

### 2. Added Diversity Filtering

**File**: [src/lib/agent/options-agent-v3.ts](src/lib/agent/options-agent-v3.ts#L2091)

Now applies `applyDiversificationFilters()` with these constraints:

```typescript
{
  maxPerSector: 5,    // Up to 5 trades per sector
  maxPerSymbol: 3,    // Up to 3 contracts per stock
  maxPerStrategy: 50, // No restriction on strategy type
}
```

This ensures the agent recommends **more unique stocks** rather than 4-5 contracts on just 3-4 stocks.

### 3. Created Centralized Configuration

**File**: [src/lib/agent/config.ts](src/lib/agent/config.ts)

All limits are now configurable in one place:

```typescript
export const AGENT_CONFIG = {
  filtering: {
    topCandidatesAfterInitialFilter: 100,
    topCandidatesBeforeDiversity: 80,
    finalRecommendations: 40,
  },
  diversity: {
    maxPerSector: 5,
    maxPerSymbol: 3,
    maxPerStrategy: 50,
  },
  // ... other settings
};
```

## Expected Results

With these changes, you should now see:

- **40 total trade recommendations** (up from 20)
- **13-20 unique stocks** covered (up from 3-4)
- **Up to 3 contracts per stock** (balanced between depth and diversity)
- **Better coverage** of your 22-stock watchlist

The agent will now log: `Covering X unique stocks from 22-stock watchlist`

## How to Customize Further

### Want MORE unique stocks with FEWER contracts per stock?

Edit [src/lib/agent/config.ts](src/lib/agent/config.ts):

```typescript
diversity: {
  maxPerSymbol: 2,  // Change from 3 → 2 (max 2 contracts per stock)
}
```

This would give you ~20 unique stocks with 40 recommendations.

### Want FEWER total recommendations?

```typescript
filtering: {
  finalRecommendations: 30,  // Change from 40 → 30
}
```

### Want to restrict recommendations per sector?

```typescript
diversity: {
  maxPerSector: 3,  // Change from 5 → 3 (max 3 trades per sector)
}
```

This is useful if your watchlist is sector-concentrated (e.g., many tech stocks).

### Want to increase the pool even more?

```typescript
filtering: {
  topCandidatesAfterInitialFilter: 150,  // Change from 100 → 150
  topCandidatesBeforeDiversity: 120,     // Change from 80 → 120
}
```

This gives the diversity filter more options to choose from.

## Quality Safeguards

The agent still maintains quality through:

1. **IPS scoring**: All recommendations must meet your IPS factor thresholds
2. **Tier classification**: Candidates are ranked as Elite (≥90), Quality (≥75), or Speculative (≥60)
3. **High-weight factors**: Pre-filtered on critical factors (weight ≥ 5)
4. **Low-weight factors**: Must not fail more than 2 low-weight factors

**The agent will NOT recommend stocks that don't meet quality criteria** - it will simply return fewer recommendations if the stocks don't qualify.

## Monitoring

When the agent runs, watch for these log messages:

```
[FilterHighWeight] Returning top 100 candidates for diversity filtering
[TieredSelection] Applying diversity filtering to 80 candidates
[TieredSelection] After diversity filtering: X candidates remain
[TieredSelection] Selected top 40 candidates by IPS score
[TieredSelection] Covering X unique stocks from 22-stock watchlist
```

If you see "Covering 5 unique stocks" - it means only 5 stocks from your watchlist met the quality criteria, not that the diversification isn't working.

## Recommended Starting Point

For a **22-stock watchlist**, these settings should work well:

```typescript
{
  filtering: {
    topCandidatesAfterInitialFilter: 100,
    topCandidatesBeforeDiversity: 80,
    finalRecommendations: 40,
  },
  diversity: {
    maxPerSector: 5,
    maxPerSymbol: 3,
    maxPerStrategy: 50,
  }
}
```

This balances:
- **Depth**: Up to 3 contracts per promising stock
- **Breadth**: Cover ~15-18 stocks from your watchlist
- **Quality**: Only recommends stocks that pass IPS criteria

---

## Testing

To test the changes, run the agent with your 22-stock watchlist and check:

1. How many unique stocks are recommended?
2. How many contracts per stock?
3. Are the IPS scores still high quality?

Then adjust the config values based on your preferences.
