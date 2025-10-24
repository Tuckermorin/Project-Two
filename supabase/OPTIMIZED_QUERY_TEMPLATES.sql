-- ============================================================================
-- Optimized Query Templates for Vector Similarity Search (Sequential Scan)
-- ============================================================================
-- These queries are optimized for 4096-dimension vectors WITHOUT ANN indexes
-- Strategy: Filter aggressively first, then compute vector similarity
-- ============================================================================

-- ============================================================================
-- trade_rationale_embeddings: Pre-Trade Similarity Searches
-- ============================================================================

-- Pattern 1: Find similar trade setups (user + 180-day window)
-- Uses: idx_tre_user_created
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND created_at >= now() - interval '180 days'
ORDER BY score
LIMIT 10;

-- Pattern 2: Find similar setups for specific symbol
-- Uses: idx_tre_user_symbol_created
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND symbol = $3
  AND created_at >= now() - interval '180 days'
ORDER BY score
LIMIT 10;

-- Pattern 3: Find similar setups for specific strategy
-- Uses: idx_tre_user_strategy_created
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND strategy_type = $3
  AND created_at >= now() - interval '180 days'
ORDER BY score
LIMIT 10;

-- Pattern 4: Find similar setups with optional symbol/strategy filters
-- Uses: idx_tre_user_symbol_created or idx_tre_user_strategy_created
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND created_at >= now() - interval '180 days'
  AND ($3::text IS NULL OR symbol = $3)
  AND ($4::text IS NULL OR strategy_type = $4)
ORDER BY score
LIMIT 10;

-- Pattern 5: Find similar completed trades only
-- Uses: idx_tre_user_created_completed (partial index)
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND created_at >= now() - interval '180 days'
  AND outcome IS NOT NULL
ORDER BY score
LIMIT 10;

-- ============================================================================
-- trade_rationale_embeddings: Post-Trade Learning
-- ============================================================================

-- Pattern 6: Learn from winners/losers (90-day window)
-- Uses: idx_tre_user_outcome_created
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND created_at >= now() - interval '90 days'
  AND actual_outcome = $3  -- 'success' or 'failure'
ORDER BY score
LIMIT 10;

-- Pattern 7: Learn from winners only
-- Uses: idx_tre_user_outcome_created
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND created_at >= now() - interval '90 days'
  AND actual_outcome = 'success'
ORDER BY score
LIMIT 10;

-- Pattern 8: Find similar trades with combined filters (symbol + outcome)
-- Uses: idx_tre_user_symbol_created (PostgreSQL will bitmap combine with outcome filter)
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND symbol = $3
  AND actual_outcome = $4
  AND created_at >= now() - interval '180 days'
ORDER BY score
LIMIT 10;

-- ============================================================================
-- trade_postmortem_analysis: Outcome Similarity
-- ============================================================================

-- Pattern 9: Find similar outcomes (90-day window)
-- Uses: idx_tpa_user_analyzed
SELECT id, (postmortem_embedding <-> $1)::float4 AS score
FROM trade_postmortem_analysis
WHERE user_id = $2
  AND analyzed_at >= now() - interval '90 days'
ORDER BY score
LIMIT 10;

-- Pattern 10: Find similar winners (positive P&L)
-- Uses: idx_tpa_user_plpct
SELECT id, (postmortem_embedding <-> $1)::float4 AS score
FROM trade_postmortem_analysis
WHERE user_id = $2
  AND realized_pl_percent > 0
  AND analyzed_at >= now() - interval '90 days'
ORDER BY score
LIMIT 10;

-- Pattern 11: Find similar losers (negative P&L)
-- Uses: idx_tpa_user_plpct
SELECT id, (postmortem_embedding <-> $1)::float4 AS score
FROM trade_postmortem_analysis
WHERE user_id = $2
  AND realized_pl_percent < 0
  AND analyzed_at >= now() - interval '90 days'
ORDER BY score
LIMIT 10;

-- Pattern 12: High-confidence analyses
-- Uses: idx_tpa_user_confidence
SELECT id, (postmortem_embedding <-> $1)::float4 AS score
FROM trade_postmortem_analysis
WHERE user_id = $2
  AND analysis_confidence >= $3  -- e.g., 0.8
ORDER BY score
LIMIT 10;

-- Pattern 13: High-confidence winners only
-- Uses: idx_tpa_user_confidence (bitmap combine with realized_pl_percent filter)
SELECT id, (postmortem_embedding <-> $1)::float4 AS score
FROM trade_postmortem_analysis
WHERE user_id = $2
  AND analysis_confidence >= $3
  AND realized_pl_percent > 0
ORDER BY score
LIMIT 10;

-- ============================================================================
-- trade_snapshot_embeddings: Market Condition Similarity
-- ============================================================================

-- Pattern 14: Find similar market conditions (30-day window)
-- Uses: idx_tse_user_created
SELECT tse.id,
       (tse.embedding <-> $1)::float4 AS score,
       ts.snapshot_time,
       ts.market_snapshot
FROM trade_snapshot_embeddings tse
JOIN trade_snapshots ts ON ts.id = tse.snapshot_id
WHERE tse.user_id = $2
  AND tse.created_at >= now() - interval '30 days'
ORDER BY score
LIMIT 10;

-- Pattern 15: Find similar conditions for specific trade
-- Uses: idx_tse_trade_id
SELECT tse.id,
       (tse.embedding <-> $1)::float4 AS score,
       ts.snapshot_time,
       ts.market_snapshot
FROM trade_snapshot_embeddings tse
JOIN trade_snapshots ts ON ts.id = tse.snapshot_id
WHERE tse.trade_id = $2
ORDER BY score
LIMIT 10;

-- ============================================================================
-- Advanced Patterns: Two-Phase Queries (Optional)
-- ============================================================================
-- For cases where time-window filters are very broad, you can use a two-phase
-- approach: filter by recency first (LIMIT to recent N), then sort by similarity

-- Two-phase example: Recent trades first, then similarity
WITH recent_trades AS (
  SELECT id, rationale_embedding
  FROM trade_rationale_embeddings
  WHERE user_id = $2
    AND created_at >= now() - interval '180 days'
    AND ($3::text IS NULL OR symbol = $3)
  ORDER BY created_at DESC
  LIMIT 200  -- Recency heuristic: consider only 200 most recent
)
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM recent_trades
ORDER BY score
LIMIT 10;

-- ============================================================================
-- Performance Testing Template
-- ============================================================================
-- Use EXPLAIN ANALYZE to profile query performance

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, (rationale_embedding <-> $1)::float4 AS score
FROM trade_rationale_embeddings
WHERE user_id = $2
  AND created_at >= now() - interval '180 days'
ORDER BY score
LIMIT 10;

-- What to look for in EXPLAIN output:
-- 1. "Index Scan" or "Bitmap Index Scan" on composite indexes (good!)
-- 2. "Rows Removed by Filter" should be HIGH (aggressive filtering working)
-- 3. "Execution Time" should be <500ms for <10k rows
-- 4. "Buffers: shared hit=" shows cache efficiency

-- ============================================================================
-- Index Usage Monitoring
-- ============================================================================
-- Check which indexes are actually being used

SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename IN ('trade_rationale_embeddings', 'trade_postmortem_analysis', 'trade_snapshot_embeddings')
ORDER BY tablename, idx_scan DESC;

-- Drop unused indexes (run after ~1 week of usage):
-- If idx_scan = 0 for a specific index, consider dropping it

-- ============================================================================
-- Table Size Monitoring
-- ============================================================================
-- Track table and index growth

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE tablename IN ('trade_rationale_embeddings', 'trade_postmortem_analysis', 'trade_snapshot_embeddings')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. Always filter by user_id first (multi-tenant isolation + selectivity)
-- 2. Always filter by created_at/analyzed_at (temporal relevance)
-- 3. Always use LIMIT 10-20 (avoid unbounded results)
-- 4. Use generated columns (symbol, strategy_type, actual_outcome) for filters
-- 5. Project only needed columns in SELECT to reduce I/O
-- 6. Run ANALYZE periodically after bulk inserts
-- 7. Monitor pg_stat_user_indexes to identify unused indexes
-- 8. Use vector_cosine_ops (<=> operator) for cosine similarity
-- 9. Store normalized vectors if using cosine similarity
-- 10. Test both single-phase and two-phase queries with EXPLAIN ANALYZE
