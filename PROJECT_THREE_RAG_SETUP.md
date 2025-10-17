# Project-Three RAG Integration Guide

This document provides the complete database schema and SQL queries needed to migrate historical trade data from Project-Two (tenxiv) to Project-Three for RAG (Retrieval Augmented Generation) embeddings.

## Database Overview

**Current Status:**
- ✅ **30 closed trades** with realized P&L data
- ✅ **15 active trades** currently being monitored
- ✅ Comprehensive trade snapshots capturing temporal patterns
- ✅ Vector embeddings infrastructure (pgvector enabled)

---

## Table Schemas

### 1. `trades` - Main Trade Records

**Purpose:** Stores all trade records (prospective, active, closed, expired, cancelled)

**Key Columns for RAG:**

```sql
-- Trade Identification
id                            UUID PRIMARY KEY
user_id                       UUID NOT NULL
symbol                        TEXT NOT NULL
strategy_type                 TEXT NOT NULL

-- Trade Lifecycle
status                        TEXT NOT NULL  -- 'prospective', 'active', 'closed', 'expired', 'cancelled'
entry_date                    DATE
expiration_date               DATE
exit_date                     DATE
closed_at                     TIMESTAMPTZ

-- Position Details
short_strike                  NUMERIC
long_strike                   NUMERIC
spread_width                  NUMERIC
number_of_contracts           INTEGER
quantity                      INTEGER

-- Financial Metrics
credit_received               NUMERIC
max_gain                      NUMERIC
max_loss                      NUMERIC
realized_pl                   NUMERIC        -- Actual profit/loss
realized_pl_percent           NUMERIC        -- ROI percentage

-- IPS (Investment Policy Statement) Scores
ips_id                        UUID
ips_score                     NUMERIC
ips_name                      TEXT
ips_factor_scores             JSONB          -- Detailed factor breakdown

-- Greeks at Entry
delta_short_leg               NUMERIC
theta                         NUMERIC
vega                          NUMERIC
iv_at_entry                   NUMERIC

-- Behavioral Metrics (for closed trades)
peak_unrealized_pnl           NUMERIC
peak_unrealized_pnl_percent   NUMERIC
lowest_unrealized_pnl         NUMERIC
max_delta_reached             NUMERIC
min_delta_reached             NUMERIC
days_at_profit                INTEGER
days_above_50pct_profit       INTEGER

-- Metadata
sector                        TEXT
tier                          TEXT           -- 'elite', 'quality', 'speculative'
evaluation_notes              TEXT
```

**Status Values:**
- `prospective` - Trade idea not yet entered
- `active` - Currently open position
- `closed` - Position closed with realized P&L
- `expired` - Position expired (typically max profit)
- `cancelled` - Trade cancelled before entry

---

### 2. `trade_snapshots` - Temporal State Captures

**Purpose:** Captures the state of trades at various points throughout their lifecycle for pattern analysis

**Key Columns:**

```sql
-- Snapshot Identification
id                            UUID PRIMARY KEY
trade_id                      UUID NOT NULL
snapshot_time                 TIMESTAMPTZ NOT NULL
snapshot_trigger              VARCHAR(50)    -- 'scheduled', 'significant_move', 'greek_threshold', 'manual'

-- Market State at Snapshot
current_stock_price           NUMERIC
current_spread_price          NUMERIC

-- Greeks at Snapshot
delta_short_leg               NUMERIC
delta_long_leg                NUMERIC
delta_spread                  NUMERIC        -- Net delta
theta                         NUMERIC
vega                          NUMERIC
gamma                         NUMERIC

-- P&L at Snapshot
unrealized_pnl                NUMERIC
unrealized_pnl_percent        NUMERIC
days_to_expiration            INTEGER
days_in_trade                 INTEGER

-- IV & Volatility at Snapshot
iv_short_strike               NUMERIC
iv_long_strike                NUMERIC
iv_rank                       NUMERIC
iv_percentile                 NUMERIC
hv_20                         NUMERIC

-- Risk Metrics
probability_of_profit         NUMERIC
probability_itm               NUMERIC        -- Probability short leg ends ITM
break_even_price              NUMERIC

-- Market Context
spy_price                     NUMERIC
vix_level                     NUMERIC
sector_performance            NUMERIC
```

---

### 3. `trade_embeddings` - RAG Vector Store

**Purpose:** Stores vector embeddings of completed trades for similarity matching

**Schema:**

```sql
CREATE TABLE trade_embeddings (
  id UUID PRIMARY KEY,
  trade_id UUID REFERENCES trades(id),
  embedding VECTOR(1536),                    -- OpenAI text-embedding-3-small
  metadata JSONB,                            -- {symbol, strategy, ips_score, outcome, etc.}
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ
);

-- Metadata Structure:
{
  "symbol": "AAPL",
  "strategy": "put_credit_spread",
  "ips_score": 87.5,
  "ips_id": "uuid-here",
  "status": "closed",
  "realized_pnl": 45.50,
  "realized_pnl_percent": 32.5,
  "entry_date": "2024-01-15",
  "exit_date": "2024-02-15",
  "delta": 0.15,
  "iv_rank": 65,
  "dte": 30,
  "win": true
}
```

**Vector Similarity Search:**

```sql
-- Find similar trades using cosine similarity
SELECT
  trade_id,
  1 - (embedding <=> query_embedding) AS similarity,
  metadata
FROM trade_embeddings
WHERE 1 - (embedding <=> query_embedding) > 0.75
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

---

### 4. `trade_snapshot_embeddings` - Temporal Pattern Store

**Purpose:** Stores embeddings of snapshots to learn "what happens next" patterns

**Schema:**

```sql
CREATE TABLE trade_snapshot_embeddings (
  id UUID PRIMARY KEY,
  snapshot_id UUID REFERENCES trade_snapshots(id),
  trade_id UUID REFERENCES trades(id),
  embedding VECTOR(1536),
  metadata JSONB,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ
);

-- Metadata Structure (includes outcome for closed trades):
{
  "symbol": "AAPL",
  "strategy": "put_credit_spread",
  "snapshot_trigger": "scheduled",
  "days_in_trade": 10,
  "days_to_expiration": 20,
  "delta_spread": 0.18,
  "unrealized_pnl_percent": 15.5,
  "iv_rank": 58,
  "outcome": "win",                          -- Only for closed trades
  "final_pnl_percent": 45.2                  -- Only for closed trades
}
```

---

### 5. `trade_candidates` - Agent Generated Ideas

**Purpose:** Stores trade candidates generated by the AI agent during runs

**Schema:**

```sql
CREATE TABLE trade_candidates (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  contract_legs JSONB NOT NULL,             -- Detailed leg information
  entry_mid NUMERIC,
  est_pop NUMERIC,                          -- Estimated probability of profit
  breakeven NUMERIC,
  max_loss NUMERIC,
  max_profit NUMERIC,
  rationale TEXT,                           -- AI-generated rationale
  guardrail_flags JSONB,                    -- Risk flags
  tier TEXT,                                -- 'elite', 'quality', 'speculative'
  ips_factor_scores JSONB,
  user_id UUID NOT NULL
);
```

---

## SQL Queries for Data Extraction

### Query 1: Get All Closed Trades for RAG Embeddings

```sql
SELECT
  t.id,
  t.user_id,
  t.symbol,
  t.strategy_type,
  t.status,

  -- Position Details
  t.short_strike,
  t.long_strike,
  t.spread_width,
  t.number_of_contracts,
  t.credit_received,
  t.max_gain,
  t.max_loss,

  -- Outcomes
  t.realized_pl,
  t.realized_pl_percent,
  t.entry_date,
  t.exit_date,
  t.closed_at,

  -- IPS Scores
  t.ips_id,
  t.ips_score,
  t.ips_name,
  t.ips_factor_scores,

  -- Greeks
  t.delta_short_leg,
  t.theta,
  t.vega,
  t.iv_at_entry,

  -- Behavioral Metrics
  t.peak_unrealized_pnl,
  t.peak_unrealized_pnl_percent,
  t.lowest_unrealized_pnl,
  t.days_at_profit,
  t.days_above_50pct_profit,

  -- Metadata
  t.sector,
  t.tier,
  t.evaluation_notes,

  -- Calculate derived metrics
  EXTRACT(EPOCH FROM (t.closed_at - t.entry_date)) / 86400 AS days_held,
  CASE WHEN t.realized_pl > 0 THEN true ELSE false END AS is_win

FROM trades t
WHERE t.status = 'closed'
  AND t.realized_pl IS NOT NULL
  AND t.user_id = 'your-user-id-here'
ORDER BY t.closed_at DESC;
```

### Query 2: Get Trade Snapshots for Closed Trades (Pattern Learning)

```sql
SELECT
  ts.id AS snapshot_id,
  ts.trade_id,
  ts.snapshot_time,
  ts.snapshot_trigger,

  -- Market State
  ts.current_stock_price,
  ts.current_spread_price,

  -- Greeks
  ts.delta_short_leg,
  ts.delta_long_leg,
  ts.delta_spread,
  ts.theta,
  ts.vega,
  ts.gamma,

  -- P&L
  ts.unrealized_pnl,
  ts.unrealized_pnl_percent,
  ts.days_to_expiration,
  ts.days_in_trade,

  -- Volatility
  ts.iv_short_strike,
  ts.iv_rank,
  ts.iv_percentile,
  ts.hv_20,

  -- Risk
  ts.probability_of_profit,
  ts.probability_itm,

  -- Market Context
  ts.vix_level,
  ts.spy_price,
  ts.sector_performance,

  -- Trade Info (from join)
  t.symbol,
  t.strategy_type,
  t.status,
  t.realized_pl,
  t.realized_pl_percent,

  -- Calculate outcome
  CASE
    WHEN t.status = 'closed' AND t.realized_pl > 0 THEN 'win'
    WHEN t.status = 'closed' AND t.realized_pl <= 0 THEN 'loss'
    ELSE NULL
  END AS outcome

FROM trade_snapshots ts
INNER JOIN trades t ON ts.trade_id = t.id
WHERE t.status = 'closed'
  AND t.user_id = 'your-user-id-here'
ORDER BY ts.snapshot_time DESC;
```

### Query 3: Get Trade Statistics

```sql
SELECT
  COUNT(*) as total_closed_trades,
  COUNT(CASE WHEN realized_pl > 0 THEN 1 END) as winning_trades,
  COUNT(CASE WHEN realized_pl <= 0 THEN 1 END) as losing_trades,
  ROUND(
    100.0 * COUNT(CASE WHEN realized_pl > 0 THEN 1 END) / COUNT(*),
    2
  ) as win_rate_percent,
  ROUND(AVG(realized_pl), 2) as avg_pnl,
  ROUND(AVG(realized_pl_percent), 2) as avg_roi_percent,
  ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - entry_date)) / 86400), 1) as avg_days_held,
  MIN(realized_pl_percent) as worst_trade_percent,
  MAX(realized_pl_percent) as best_trade_percent
FROM trades
WHERE status = 'closed'
  AND realized_pl IS NOT NULL
  AND user_id = 'your-user-id-here';
```

### Query 4: Get Trade Data Grouped by Strategy

```sql
SELECT
  strategy_type,
  COUNT(*) as trade_count,
  COUNT(CASE WHEN realized_pl > 0 THEN 1 END) as wins,
  ROUND(
    100.0 * COUNT(CASE WHEN realized_pl > 0 THEN 1 END) / COUNT(*),
    2
  ) as win_rate,
  ROUND(AVG(realized_pl_percent), 2) as avg_roi,
  ROUND(AVG(ips_score), 1) as avg_ips_score
FROM trades
WHERE status = 'closed'
  AND user_id = 'your-user-id-here'
GROUP BY strategy_type
ORDER BY trade_count DESC;
```

### Query 5: Get Trades with Full Context (for embedding text generation)

```sql
SELECT
  t.id,
  t.symbol,
  t.strategy_type,
  t.status,

  -- Build comprehensive context string
  CONCAT(
    'Symbol: ', t.symbol, E'\n',
    'Strategy: ', t.strategy_type, E'\n',
    'IPS Score: ', COALESCE(t.ips_score::TEXT, 'N/A'), '%', E'\n',
    'Short Strike: $', COALESCE(t.short_strike::TEXT, 'N/A'), E'\n',
    'Long Strike: $', COALESCE(t.long_strike::TEXT, 'N/A'), E'\n',
    'Credit: $', COALESCE(t.credit_received::TEXT, 'N/A'), E'\n',
    'Max Loss: $', COALESCE(t.max_loss::TEXT, 'N/A'), E'\n',
    'Outcome: ', CASE WHEN t.realized_pl > 0 THEN 'WIN' ELSE 'LOSS' END,
    ' (P&L: $', COALESCE(t.realized_pl::TEXT, 'N/A'), ')', E'\n',
    'ROI: ', COALESCE(t.realized_pl_percent::TEXT, 'N/A'), '%', E'\n',
    'Days Held: ', COALESCE(
      EXTRACT(EPOCH FROM (t.closed_at - t.entry_date))::INT / 86400,
      0
    )::TEXT
  ) AS embedding_context,

  -- Raw data for metadata
  t.realized_pl,
  t.realized_pl_percent,
  t.ips_score,
  t.delta_short_leg,
  t.iv_at_entry

FROM trades t
WHERE t.status = 'closed'
  AND t.user_id = 'your-user-id-here'
ORDER BY t.closed_at DESC;
```

---

## TypeScript Usage Examples

### Example 1: Fetch Trades for Embedding

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fetch all closed trades for RAG embedding
async function fetchClosedTradesForRAG(userId: string) {
  const { data: trades, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "closed")
    .not("realized_pl", "is", null)
    .order("closed_at", { ascending: false });

  if (error) {
    console.error("Error fetching trades:", error);
    return [];
  }

  return trades;
}

// Fetch snapshots for closed trades
async function fetchSnapshotsForClosedTrades(userId: string) {
  const { data: snapshots, error } = await supabase
    .from("trade_snapshots")
    .select(`
      *,
      trades!inner (
        id,
        symbol,
        strategy_type,
        status,
        realized_pl,
        realized_pl_percent
      )
    `)
    .eq("trades.user_id", userId)
    .eq("trades.status", "closed");

  if (error) {
    console.error("Error fetching snapshots:", error);
    return [];
  }

  return snapshots;
}
```

### Example 2: Build Embedding Context

```typescript
function buildTradeContext(trade: any): string {
  const lines: string[] = [
    `Symbol: ${trade.symbol}`,
    `Strategy: ${trade.strategy_type}`,
    `Status: ${trade.status}`,
  ];

  if (trade.ips_score != null) {
    lines.push(`IPS Score: ${trade.ips_score}%`);
  }

  if (trade.short_strike != null) {
    lines.push(`Short Strike: $${trade.short_strike}`);
  }

  if (trade.long_strike != null) {
    lines.push(`Long Strike: $${trade.long_strike}`);
  }

  if (trade.credit_received != null) {
    lines.push(`Credit: $${trade.credit_received}`);
  }

  if (trade.realized_pl != null) {
    const outcome = trade.realized_pl > 0 ? "WIN" : "LOSS";
    lines.push(`Outcome: ${outcome} (P&L: $${trade.realized_pl})`);
  }

  if (trade.realized_pl_percent != null) {
    lines.push(`ROI: ${trade.realized_pl_percent}%`);
  }

  if (trade.entry_date && trade.closed_at) {
    const days = Math.ceil(
      (new Date(trade.closed_at).getTime() - new Date(trade.entry_date).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    lines.push(`Held: ${days} days`);
  }

  return lines.join("\n");
}
```

---

## Migration Checklist for Project-Three

- [ ] Set up Supabase client with connection string
- [ ] Enable pgvector extension in Project-Three database
- [ ] Create `trades` table with full schema
- [ ] Create `trade_snapshots` table
- [ ] Create `trade_embeddings` table with vector index
- [ ] Create `trade_snapshot_embeddings` table
- [ ] Migrate closed trade data from Project-Two
- [ ] Generate embeddings for all closed trades
- [ ] Generate embeddings for snapshots (optional, for pattern learning)
- [ ] Test similarity search queries
- [ ] Set up auto-embedding trigger for new closed trades

---

## Environment Variables Needed

```bash
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Embedding Provider (choose one)
OPENAI_API_KEY=sk-...                    # Preferred: OpenAI text-embedding-3-small
# OR
OLLAMA_HOST=http://localhost:11434       # Alternative: Local Ollama embeddings
OLLAMA_MODEL=llama3                      # Ollama model for embeddings
```

---

## Key Insights

1. **30 Closed Trades Available**: You have real historical data ready to embed
2. **Comprehensive Snapshots**: Trade snapshots capture temporal patterns throughout trade lifecycle
3. **IPS Scores Tracked**: Every trade has IPS (Investment Policy Statement) compliance scores
4. **Behavioral Metrics**: Tracks peak P&L, delta changes, days at profit, etc.
5. **Vector Search Ready**: pgvector is already enabled with HNSW indexes for fast similarity search

---

## Existing RAG Code in Project-Two

The RAG embedding system is already implemented in Project-Two:
- **File**: `src/lib/agent/rag-embeddings.ts`
- **Functions**:
  - `seedTradeEmbeddings(userId)` - Batch embed all closed trades
  - `embedTradeOutcome(trade)` - Embed a single trade
  - `findSimilarTrades(candidate)` - Vector similarity search
  - `analyzeHistoricalPerformance(candidate)` - Calculate win rate from similar trades

You can copy this entire file to Project-Three and it will work with the same database schema.

---

## Questions?

If you need clarification on any table structure, column meaning, or query pattern, let me know!
