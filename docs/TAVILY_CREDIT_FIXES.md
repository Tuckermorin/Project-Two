# Tavily Credit Usage Fixes

## Problem Summary
- Burning 600+ credits/day on Tavily searches
- Schema validation failures causing circuit breaker to trip
- Still charging credits even when searches fail
- Not gracefully falling back when Tavily is unavailable

## Fixes Implemented

### 1. ✅ Made Tavily Schema Validation Non-Blocking
**File**: `src/lib/clients/tavily.ts:168-190`
- Changed from throwing error to logging warning
- Added best-effort parsing even if validation fails
- Filter out results missing required fields
- Use fallbacks for optional fields (snippet, publishedAt, score)

**Result**: No more failed searches due to schema mismatches

### 2. ✅ Reduce Credit Usage
**Files**:
- `src/lib/services/unified-intelligence-service.ts`
- `src/lib/agent/active-trade-monitor.ts`

**Changes Completed**:
1. ✅ Changed `search_depth: 'advanced'` → `'basic'` (saves 1 credit per search)
2. ✅ Reduced `max_results` from 10-15 → 5 (faster, cheaper)
3. ✅ Wrapped all Tavily calls in try-catch to return empty arrays on failure
4. ⏭️ Circuit breaker already handles failures via tavily-resilience.ts

**Example**:
```typescript
// BEFORE (costs 2 credits)
const result = await tavilySearch(query, {
  search_depth: 'advanced',
  max_results: 15
});

// AFTER (costs 1 credit)
try {
  const result = await tavilySearch(query, {
    search_depth: 'basic',
    max_results: 5
  });
  return result.results.map(...);
} catch (error) {
  console.error('[UnifiedIntel] Tavily failed:', error);
  return [];  // Fail gracefully
}
```

### 3. 🔄 Skip Tavily When Circuit Breaker is OPEN (TODO)
**File**: `src/lib/services/unified-intelligence-service.ts`

Add before each Tavily call:
```typescript
import { isCircuitBreakerOpen } from '@/lib/clients/tavily';

// Check if Tavily is currently failing
if (isCircuitBreakerOpen()) {
  console.warn(`[UnifiedIntel] Skipping Tavily (circuit breaker OPEN)`);
  return [];
}
```

### 4. 🔄 Remove Unnecessary SEC Filing Queries (TODO)
**File**: `src/lib/agent/active-trade-monitor.ts:152-154`

SEC filings are expensive (2 credits each) and rarely useful for short-term trades.

**Change**:
```typescript
// REMOVE this line (saves 2 credits per trade monitored)
querySECFilings(typedTrade.symbol, 30).then((r) => {
  creditsUsed += 2;
  return r;
}),

// Replace with empty array
Promise.resolve([])  // SEC filings not critical for active monitoring
```

## Expected Credit Savings

### Current Usage (600+ credits/day)
- Active trade monitoring: 20 trades × 28 credits = 560 credits
  - 4 searches per trade (catalysts, analysts, risks, general news) × 2 credits = 8 credits
  - 1 SEC filing search × 2 credits = 2 credits
  - Repeated due to failures = 2-3x multiplier

### After Fixes (est. 50-100 credits/day)
- Active trade monitoring: 20 trades × 5 credits = 100 credits
  - 4 searches per trade × 1 credit (basic depth) = 4 credits
  - No SEC filing searches = 0 credits
  - No repeated failures = 1x multiplier
  - 50% skip due to successful Alpha Vantage fallback = 0.5x multiplier

**Estimated savings: 500+ credits/day (83% reduction)**

## Additional Recommendations

### 1. Monitor Credit Usage
Add daily credit usage logging:
```typescript
console.log(`[Tavily] Daily credits used: ${creditsToday}/1000`);
if (creditsToday > 100) {
  console.warn(`[Tavily] High credit usage detected!`);
}
```

### 2. Increase Cache TTL for News
News doesn't change that frequently:
```typescript
// Current
CacheTTL.SEARCH_NEWS = 360  // 6 hours

// Recommended
CacheTTL.SEARCH_NEWS = 1440  // 24 hours
```

### 3. Only Monitor "WATCH" Trades
The active trade monitor already filters to watch-worthy trades, but we could be more aggressive:
```typescript
// Only monitor if:
// - IPS score < 75, OR
// - Within 5% of short strike, OR
// - Approaching expiration (< 7 DTE)
// - Skip "GOOD" trades entirely
```

## Action Items

- [x] Apply try-catch to all Tavily calls in unified-intelligence-service.ts
- [x] Change search_depth from 'advanced' to 'basic' everywhere
- [x] Reduce max_results from 10-15 to 5
- [x] Circuit breaker already implemented in tavily-resilience.ts
- [ ] Remove SEC filing queries from active monitoring (optional - saves 2 credits per trade)
- [ ] Increase cache TTL for news searches (optional - could extend from 6h to 24h)
- [ ] Add daily credit usage monitoring (optional - for tracking)
