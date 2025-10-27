-- Performance optimization indexes
-- Created: 2025-10-27
-- Purpose: Add missing indexes to improve query performance for agent and dashboard operations

-- ============================================================================
-- 1. vol_regime_daily table - IV Rank batch queries
-- ============================================================================

-- Composite index for batch IV rank queries (symbol + date range)
-- Used in options-agent-v3.ts preFilterGeneral() batch query
CREATE INDEX IF NOT EXISTS vol_regime_daily_symbol_date_idx
  ON vol_regime_daily(symbol, as_of_date DESC)
  WHERE iv_atm_30d IS NOT NULL;

COMMENT ON INDEX vol_regime_daily_symbol_date_idx IS
  'Optimizes batch IV rank queries for multiple symbols with date range filters';

-- ============================================================================
-- 2. trades table - Performance indexes
-- ============================================================================

-- Composite index for closed trades by symbol (RAG fallback queries)
-- Used in rag-embeddings.ts analyzeHistoricalPerformance()
CREATE INDEX IF NOT EXISTS trades_symbol_status_closed_idx
  ON trades(symbol, status, closed_at DESC)
  WHERE status = 'closed' AND realized_pl_percent IS NOT NULL;

COMMENT ON INDEX trades_symbol_status_closed_idx IS
  'Optimizes symbol-based historical trade lookups for RAG analysis';

-- Index for active trades by status and user (dashboard queries)
CREATE INDEX IF NOT EXISTS trades_status_user_created_idx
  ON trades(status, user_id, created_at DESC);

COMMENT ON INDEX trades_status_user_created_idx IS
  'Optimizes dashboard queries for active/prospective trades by user';

-- Index for trade closure analysis
CREATE INDEX IF NOT EXISTS trades_closed_analysis_idx
  ON trades(user_id, status, closed_at DESC, realized_pl_percent)
  WHERE status = 'closed';

COMMENT ON INDEX trades_closed_analysis_idx IS
  'Optimizes closed trades analysis and reporting queries';

-- ============================================================================
-- 3. trade_rationale_embeddings table - Batch embedding lookups
-- ============================================================================

-- Index for checking existing embeddings by evaluation_id
-- Used in rationale API batch operations
CREATE INDEX IF NOT EXISTS trade_rationale_embeddings_evaluation_idx
  ON trade_rationale_embeddings(trade_evaluation_id);

COMMENT ON INDEX trade_rationale_embeddings_evaluation_idx IS
  'Optimizes batch embedding existence checks in rationale API';

-- ============================================================================
-- 4. reddit_sentiment table - Recent sentiment lookups
-- ============================================================================

-- Index for recent Reddit sentiment by symbol
CREATE INDEX IF NOT EXISTS reddit_sentiment_symbol_created_idx
  ON reddit_sentiment(symbol, created_at DESC);

COMMENT ON INDEX reddit_sentiment_symbol_created_idx IS
  'Optimizes recent Reddit sentiment lookups per symbol';

-- ============================================================================
-- 5. Analyze tables to update statistics
-- ============================================================================

-- Update table statistics for query planner
ANALYZE vol_regime_daily;
ANALYZE trades;
ANALYZE trade_rationale_embeddings;
ANALYZE reddit_sentiment;

-- ============================================================================
-- Performance monitoring query
-- ============================================================================

-- Use this query to monitor index usage:
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan as index_scans,
--   idx_tup_read as tuples_read,
--   idx_tup_fetch as tuples_fetched
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;
