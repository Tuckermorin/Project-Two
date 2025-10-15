# Agent Progress Bar

## Overview

The agent now shows a detailed progress bar while analyzing your watchlist, so you can see exactly what it's doing and track its progress in real-time.

---

## Features

### Visual Progress Indicator
- **Progress percentage** (0-100%)
- **Progress bar** with smooth animation
- **Current step label** with emoji indicators
- **Step-by-step checklist** showing completed, current, and pending steps
- **Time estimate** showing remaining seconds

### 8 Agent Steps

1. 📋 **Loading IPS Configuration** (~3 seconds)
   - Fetches your IPS settings
   - Loads macro economic data

2. 📊 **Fetching Market Data** (~5 seconds)
   - Gets current stock prices
   - Retrieves company fundamentals

3. 🔍 **Pre-filtering Stocks** (~12 seconds)
   - Checks high-weight general factors
   - Fetches news and sentiment data
   - Filters out stocks that don't meet criteria

4. ⛓️ **Fetching Options Chains** (~40 seconds)
   - Pulls options data for all symbols
   - Slowest step due to API rate limits
   - Processes thousands of option contracts

5. 📈 **Scoring Candidates** (~30 seconds)
   - Evaluates contract combinations
   - Calculates IPS scores
   - Applies chain-dependent factors

6. ✨ **Applying IPS Filters** (~20 seconds)
   - Filters on low-weight factors
   - Applies diversity constraints
   - Selects top candidates

7. 🤖 **Generating AI Analysis** (~20 seconds)
   - Creates trade rationales
   - Analyzes market context
   - Enriches with Alpha Intelligence

8. ✅ **Finalizing Results** (~10 seconds)
   - Sorts by IPS score
   - Packages results
   - Saves to database

**Total Time**: ~2-3 minutes for 22 stocks

---

## User Experience

### Before (No Progress Bar)
```
[Run Agent] button clicked
↓
Button shows: "⚙️ Analyzing 22 symbols..."
↓
... wait 2-3 minutes ...
↓
(User wondering: "Is it frozen? Did it crash?")
↓
Results appear
```

### After (With Progress Bar)
```
[Run Agent] button clicked
↓
Button shows: "⚙️ Running Agent..."
↓
Progress card appears:
┌─────────────────────────────────────┐
│ Agent Progress             45%      │
│ ████████████░░░░░░░░░░░░░░          │
│                                     │
│ ⚙️ ⛓️ Fetching Options Chains...   │
│                                     │
│ ✓ 📋 Loading IPS Configuration     │
│ ✓ 📊 Fetching Market Data          │
│ ✓ 🔍 Pre-filtering Stocks          │
│ ⚙️ ⛓️ Fetching Options Chains      │
│ ○ 📈 Scoring Candidates             │
│ ○ ✨ Applying IPS Filters           │
│ ○ 🤖 Generating AI Analysis         │
│ ○ ✅ Finalizing Results             │
│                                     │
│ Estimated time: 75s remaining      │
└─────────────────────────────────────┘
↓
(User sees clear progress, stays engaged)
↓
100% → Results appear
```

---

## Visual Design

### Progress Card
- **Border**: Primary color with transparency
- **Background**: Subtle primary tint
- **Elevated**: Card component for visual separation

### Progress Bar
- **Smooth animation**: Transitions between steps
- **Color**: Primary theme color
- **Height**: 8px for visibility

### Step List
- **Completed steps**: ✓ Green checkmark, muted text
- **Current step**: ⚙️ Spinning loader, highlighted background, bold text
- **Pending steps**: ○ Gray circle, muted text
- **Compact**: Small text, minimal spacing

### Status Indicators
- ✓ **Green checkmark** for completed
- ⚙️ **Spinning loader** for current
- ○ **Empty circle** for pending

---

## Technical Implementation

### Files Created

1. **[AgentProgressBar.tsx](src/components/trades/AgentProgressBar.tsx)** - Progress bar component

### Files Modified

1. **[AgentSection.tsx](src/components/trades/AgentSection.tsx)**
   - Added progress state tracking
   - Added time-based step simulation
   - Integrated progress bar into UI

### Progress Simulation Logic

Since the agent runs synchronously without emitting real-time events, we simulate progress based on **elapsed time**:

```typescript
const STEPS = [
  { time: 0, step: 1, label: '📋 Loading IPS Configuration...' },
  { time: 3, step: 2, label: '📊 Fetching Market Data...' },
  { time: 8, step: 3, label: '🔍 Pre-filtering Stocks...' },
  { time: 20, step: 4, label: '⛓️ Fetching Options Chains...' },
  { time: 60, step: 5, label: '📈 Scoring Candidates...' },
  { time: 90, step: 6, label: '✨ Applying IPS Filters...' },
  { time: 110, step: 7, label: '🤖 Generating AI Analysis...' },
  { time: 130, step: 8, label: '✅ Finalizing Results...' },
];
```

Every second, we check elapsed time and update to the appropriate step.

### State Management

**New State Variables**:
```typescript
const [agentProgress, setAgentProgress] = useState({
  step: 0,
  label: ''
});
const [agentStartTime, setAgentStartTime] = useState<number | null>(null);
```

**Progress Tracking**:
- `agentStartTime`: Tracks when agent started (Date.now())
- `agentProgress`: Current step number and label
- `useEffect`: Updates progress every second based on elapsed time

---

## Timing Breakdown

### Why Each Step Takes Time

**Step 1: Loading IPS** (3s)
- Database query for IPS configuration
- Macro data API calls
- Configuration validation

**Step 2: Fetching Market Data** (5s)
- Alpha Vantage API calls for quotes
- Company overview data
- Fundamental metrics

**Step 3: Pre-filtering** (12s)
- Tavily news search per symbol
- Reddit sentiment API (if configured)
- Insider transaction data
- Factor evaluation

**Step 4: Options Chains** (40s)
- **Slowest step** due to rate limits
- Alpha Vantage free tier: 25 calls/minute
- 22 stocks = 22 API calls
- Wait time between calls to avoid rate limits

**Step 5: Scoring** (30s)
- Evaluates thousands of contract combinations
- Calculates IPS scores for each
- Applies high-weight factor filters
- Sorts candidates

**Step 6: Filtering** (20s)
- Low-weight factor evaluation
- Diversity filtering
- Tier classification
- Final selection

**Step 7: AI Analysis** (20s)
- OpenAI API calls for rationales
- RAG embedding searches
- Context enrichment
- Detailed analysis generation

**Step 8: Finalizing** (10s)
- Sorts final results
- Prepares response payload
- Saves to database
- Returns to UI

---

## Benefits

### User Experience
- **Reduces anxiety**: Users know the agent is working
- **Sets expectations**: Time estimate shows how long to wait
- **Shows progress**: Visual feedback keeps users engaged
- **Indicates problems**: If stuck on one step, something may be wrong

### Debugging
- **Identify bottlenecks**: See which step takes longest
- **Catch errors**: If progress stops, know where it failed
- **Performance monitoring**: Track if agent is slower than usual

### Transparency
- **Builds trust**: Users see what the agent is doing
- **Educational**: Users learn about the analysis process
- **Accountability**: Clear indication that work is happening

---

## Customization

### Adjust Step Timings

If the agent runs faster/slower for you, adjust the timings in [AgentSection.tsx](src/components/trades/AgentSection.tsx#L133):

```typescript
const STEPS = [
  { time: 0, step: 1, label: '📋 Loading IPS Configuration...' },
  { time: 5, step: 2, label: '📊 Fetching Market Data...' },  // Changed from 3
  { time: 15, step: 3, label: '🔍 Pre-filtering Stocks...' },  // Changed from 8
  // ... etc
];
```

### Change Step Labels

Customize the emoji or text for each step:

```typescript
{ time: 0, step: 1, label: '🚀 Initializing...' },
{ time: 3, step: 2, label: '💹 Getting Prices...' },
```

### Disable Progress Bar

If you prefer the old simple loading state:

```typescript
// Comment out this section in AgentSection.tsx
{/* Progress Bar */}
{/* {loading && agentProgress.step > 0 && (
  <Card>
    <CardContent className="pt-6">
      <AgentProgressBar ... />
    </CardContent>
  </Card>
)} */}
```

### Add Sound/Notification

Notify when complete:

```typescript
// In runAgent's finally block:
finally {
  setLoading(false);
  setAgentStartTime(null);

  // Play completion sound
  if (cands.length > 0) {
    new Audio('/success.mp3').play();
    // or: new Notification('Agent Complete', { body: `Found ${cands.length} trades` });
  }
}
```

---

## Future Enhancements (Optional)

### Real-Time Progress (Advanced)

Instead of simulation, emit real progress from the agent:

**Backend** (agent code):
```typescript
// In options-agent-v3.ts
function emitProgress(step: number, label: string) {
  // Emit via WebSocket or SSE
  progressEmitter.emit('progress', { step, label });
}

// At each checkpoint:
emitProgress(1, 'Loading IPS');
const ipsConfig = await loadIPS();
emitProgress(2, 'Fetching Market Data');
```

**Frontend** (AgentSection):
```typescript
useEffect(() => {
  const eventSource = new EventSource('/api/agent/progress');
  eventSource.onmessage = (event) => {
    const progress = JSON.parse(event.data);
    setAgentProgress(progress);
  };
  return () => eventSource.close();
}, []);
```

### Per-Symbol Progress

Show which symbol is being analyzed:

```
⛓️ Fetching Options Chains... (15/22)
Currently processing: NVDA
```

### Detailed Substeps

Expand each step to show substeps:

```
⛓️ Fetching Options Chains...
  ✓ AAPL (1200 contracts)
  ✓ MSFT (1450 contracts)
  ⚙️ NVDA (processing...)
  ○ TSLA
  ○ ... (18 more)
```

### Pause/Cancel Button

Allow users to cancel long-running agents:

```typescript
<Button onClick={() => abortController.abort()}>
  Cancel Analysis
</Button>
```

---

## Troubleshooting

### Progress Stuck on One Step

**Symptom**: Progress bar shows same step for >1 minute

**Possible Causes**:
1. API rate limit hit (especially Step 4: Options Chains)
2. Network timeout
3. Agent crashed without error

**Solution**:
- Check browser console for errors
- Verify API keys are valid
- Check server logs for agent errors

### Progress Goes Backwards

**Symptom**: Step number decreases or resets

**Cause**: React state issue or multiple agent runs overlapping

**Solution**:
- Ensure `loading` state prevents multiple simultaneous runs
- Check that `agentStartTime` is reset properly

### Progress Too Fast/Slow

**Symptom**: Progress doesn't match actual agent speed

**Cause**: Time estimates are averages, actual speed varies

**Solution**: Adjust timing values in `STEPS` array to match your system's performance

### No Progress Bar Appears

**Symptom**: Button shows loading but no progress card

**Cause**: `agentProgress.step` is 0 or component not rendering

**Solution**:
- Check that `setAgentProgress` is called in `runAgent()`
- Verify `loading && agentProgress.step > 0` condition
- Check console for React errors

---

The progress bar is now fully functional! Users will have clear visibility into what the agent is doing and how long it will take, making the 2-3 minute analysis much more bearable.
