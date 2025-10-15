# Agent Results Caching

## Overview

The agent now automatically saves and restores your most recent trade analysis, so you don't have to re-run the agent every time you visit the page.

---

## How It Works

### When You Run the Agent

1. Agent analyzes your watchlist and finds trade opportunities
2. Results are saved to the database (`agent_runs` and `trade_candidates` tables)
3. Results are displayed in the UI

### When You Return to the Page

1. Page loads and automatically checks for cached results
2. If found, displays your most recent analysis immediately
3. Badge shows "📂 Cached" to indicate these are saved results
4. Your watchlist symbols are also restored

### When You Run Again

1. Click "Run Agent" to perform a fresh analysis
2. New results replace the old cache
3. Badge changes from "📂 Cached" to no badge (fresh results)

---

## User Experience Flow

### First Visit (No Cache)
```
┌─────────────────────────────────────┐
│  🤖 AI Trade Agent                  │
├─────────────────────────────────────┤
│  Select IPS: [Choose...]            │
│  Symbols: [Add symbols...]          │
│  [Run Agent]                        │
│                                     │
│  No agent results yet               │
│  Select an IPS, add symbols,        │
│  and run the agent                  │
└─────────────────────────────────────┘
```

### Loading Cache
```
┌─────────────────────────────────────┐
│  🤖 AI Trade Agent                  │
├─────────────────────────────────────┤
│  Select IPS: [My Conservative IPS]  │
│  Symbols: AAPL MSFT NVDA...         │
│  [Run Agent]                        │
│                                     │
│  ⚙️ Loading previous results...     │
└─────────────────────────────────────┘
```

### Cached Results Loaded
```
┌─────────────────────────────────────┐
│  🤖 AI Trade Agent                  │
├─────────────────────────────────────┤
│  Select IPS: [My Conservative IPS]  │
│  Symbols: AAPL MSFT NVDA TSLA...    │
│  [Run Agent (22)]                   │
│                                     │
│  Found 40 potential trades 📂 Cached│
│  15 unique stocks • 22 in watchlist │
│                                     │
│  ⭐ AAPL • PUT CS • $180/$175 → 92% │
│  ⭐ MSFT • PUT CS • $350/$345 → 90% │
│  🏆 NVDA • PUT CS • $450/$445 → 85% │
│  ... (showing top 10)               │
│  [Show All 40 Trades]               │
└─────────────────────────────────────┘
```

### Fresh Results After Re-running
```
┌─────────────────────────────────────┐
│  Found 42 potential trades          │ (no 📂 badge)
│  16 unique stocks • 22 in watchlist │
│                                     │
│  ⭐ AAPL • PUT CS • $185/$180 → 93% │
│  ... (fresh analysis)               │
└─────────────────────────────────────┘
```

---

## Technical Implementation

### New API Endpoint

**File**: [src/app/api/agent/latest/route.ts](src/app/api/agent/latest/route.ts)

**Endpoint**: `GET /api/agent/latest`

**Purpose**: Fetch the most recent completed agent run for the authenticated user

**Response**:
```json
{
  "ok": true,
  "hasCache": true,
  "run": {
    "runId": "abc-123",
    "startedAt": "2025-10-15T10:00:00Z",
    "finishedAt": "2025-10-15T10:05:00Z",
    "mode": "paper",
    "watchlist": ["AAPL", "MSFT", "NVDA", ...]
  },
  "candidates": [
    {
      "id": "...",
      "symbol": "AAPL",
      "strategy": "PUT_CREDIT_SPREAD",
      "ips_score": 92,
      "entry_mid": 2.50,
      ...
    },
    ...
  ],
  "candidatesCount": 40
}
```

### Database Query

The API fetches:
1. Most recent **completed** `agent_run` for the user
2. All `trade_candidates` associated with that run
3. Merges with `outcome.selected` JSON for full details

**Key SQL**:
```sql
-- Get most recent completed run
SELECT * FROM agent_runs
WHERE user_id = $1
  AND finished_at IS NOT NULL
ORDER BY finished_at DESC
LIMIT 1;

-- Get all candidates for that run
SELECT * FROM trade_candidates
WHERE run_id = $2
  AND user_id = $1
ORDER BY created_at DESC;
```

### UI Changes

**File**: [src/components/trades/AgentSection.tsx](src/components/trades/AgentSection.tsx)

**New State**:
- `loadingCache` - Shows spinner while fetching cache
- `cacheLoaded` - Tracks if current results are from cache

**New Function**: `loadCachedResults()`
- Runs on component mount (useEffect)
- Calls `/api/agent/latest` API
- Populates results if cache exists
- Restores watchlist symbols

**UI Indicators**:
- Loading spinner: "⚙️ Loading previous results..."
- Cache badge: "📂 Cached" (only shown for cached results)
- Empty state message when no cache exists

---

## Data Persistence

### What Gets Cached

✅ **Saved**:
- Trade candidates (symbol, strategy, strikes, DTE, etc.)
- IPS scores and tier classifications
- Entry prices, max profit/loss, breakeven
- AI rationales and trade details
- Contract legs and greeks
- Watchlist symbols used in analysis
- Run metadata (when analysis was performed)

✅ **Restored**:
- All trade recommendations
- Watchlist symbols
- Run ID for reference

❌ **Not Cached**:
- Real-time market data (prices update on re-run)
- User input state (like "number of contracts" in modals)

### Cache Duration

- **No expiration**: Cache persists indefinitely
- **Only latest run**: Only the most recent completed run is loaded
- **Per user**: Each user has their own cache (isolated by `user_id`)

### Cache Invalidation

The cache is "replaced" (not invalidated) when:
- User runs the agent again
- New results become the "latest" run
- Old results remain in database but aren't loaded as cache

---

## Benefits

### User Experience
- **Instant results**: No waiting when returning to the page
- **Context preservation**: Watchlist is restored
- **Reduced friction**: Don't lose work when navigating away
- **Clear indicators**: Badge shows when viewing cached vs. fresh data

### Performance
- **Reduced API calls**: No need to re-analyze on every page load
- **Faster page loads**: Database query is much faster than full agent run
- **Lower costs**: Fewer Alpha Vantage API calls

### Workflow
- **Review at leisure**: Analyze results over multiple sessions
- **Compare trades**: Look at prospective trades page, come back to review more
- **Iterative refinement**: Run agent, review, adjust IPS, run again

---

## Edge Cases Handled

### No Cache Available
- Shows friendly empty state
- Prompts user to run agent
- No errors or confusion

### Outdated Cache
- User can always click "Run Agent" for fresh analysis
- Badge clearly indicates when results are cached
- No automatic refresh (user controls when to re-analyze)

### Multiple Browser Tabs
- Each tab loads its own copy from cache
- Running agent in one tab doesn't auto-refresh others
- Next page load in any tab will show the latest results

### User Switches IPS
- Cache shows results from whatever IPS was used last
- User can change IPS and run agent again
- New results become the cache

---

## Configuration

### Adjust Initial Display Count

By default, shows 10 trades initially. To change:

**File**: [AgentSection.tsx](src/components/trades/AgentSection.tsx#L117)
```typescript
const [initialDisplayCount, setInitialDisplayCount] = useState(10);
```

### Disable Caching (if needed)

To disable auto-loading cache, comment out the useEffect:

```typescript
// useEffect(() => {
//   loadCachedResults();
// }, []);
```

### Manual Cache Refresh

Add a "Refresh Cache" button by calling:
```typescript
<Button onClick={loadCachedResults}>
  Refresh Cache
</Button>
```

---

## Future Enhancements (Optional)

If you want to extend the caching system:

### 1. Cache Timestamp Display
Show when the analysis was performed:
```typescript
<Badge variant="outline" className="text-xs">
  📂 Cached ({new Date(run.finishedAt).toLocaleDateString()})
</Badge>
```

### 2. Multiple Cached Runs
- Store recent 5 runs
- Dropdown to select which analysis to view
- Compare results over time

### 3. Cache Expiration
- Add TTL (e.g., 24 hours)
- Auto-refresh stale cache
- Warning indicator for old data

### 4. Offline Support
- Use IndexedDB or localStorage
- Works without database connection
- Sync when back online

### 5. Cache Management UI
- "Clear Cache" button
- View cache statistics
- Export/import cached results

---

## Testing the Cache

### Test Flow

1. **Initial Run**:
   - Select IPS
   - Add symbols (e.g., AAPL, MSFT, NVDA)
   - Click "Run Agent"
   - Wait for results (40 trades)
   - See results displayed (no cache badge)

2. **Navigate Away**:
   - Go to different page (e.g., Trades, Dashboard)
   - Return to Agent page

3. **Verify Cache Load**:
   - Should see "Loading previous results..." briefly
   - Results appear automatically
   - "📂 Cached" badge is visible
   - Symbols are restored in watchlist

4. **Run Fresh Analysis**:
   - Click "Run Agent" again
   - New results replace cache
   - Cache badge disappears (fresh data)

5. **Return Again**:
   - Navigate away and back
   - New results are now cached
   - Cache badge appears again

---

## Troubleshooting

### Cache Not Loading

**Check**:
- User is authenticated (`userId` in session)
- Agent run completed successfully (has `finished_at` timestamp)
- Database has records in `agent_runs` and `trade_candidates`

**Debug**:
```sql
-- Check if runs exist
SELECT run_id, finished_at, mode
FROM agent_runs
WHERE user_id = 'your-user-id'
ORDER BY finished_at DESC
LIMIT 5;

-- Check if candidates exist
SELECT COUNT(*), run_id
FROM trade_candidates
WHERE user_id = 'your-user-id'
GROUP BY run_id;
```

### Old Data Showing

**Cause**: Cache is working, showing most recent run

**Solution**: Click "Run Agent" to perform fresh analysis

### Watchlist Not Restored

**Check**: Ensure `watchlist` field in `agent_runs` table is populated

**Fix**: The agent run should save the symbols:
```typescript
await openRun({
  runId,
  mode: "paper",
  symbols: ["AAPL", "MSFT", ...] // Make sure this is saved
});
```

---

The caching system is now fully functional! Your agent results will persist across sessions, making it much more convenient to review and act on trade recommendations.
