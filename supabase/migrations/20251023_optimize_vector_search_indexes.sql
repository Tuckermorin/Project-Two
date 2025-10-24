-- Optimize vector search performance for sequential scans (without ANN indexes)
-- This migration adds generated columns and composite indexes to improve
-- filter selectivity before vector similarity computations.

-- ============================================================================
-- trade_rationale_embeddings: Add generated columns for common filters
-- ============================================================================

-- Symbol (from trade_details JSONB)
ALTER TABLE trade_rationale_embeddings
  ADD COLUMN IF NOT EXISTS symbol text
  GENERATED ALWAYS AS (trade_details->>'symbol') STORED;

-- Strategy type (from trade_details JSONB)
ALTER TABLE trade_rationale_embeddings
  ADD COLUMN IF NOT EXISTS strategy_type text
  GENERATED ALWAYS AS (trade_details->>'strategy_type') STORED;

-- Actual outcome (from outcome JSONB)
ALTER TABLE trade_rationale_embeddings
  ADD COLUMN IF NOT EXISTS actual_outcome text
  GENERATED ALWAYS AS (outcome->>'actual_outcome') STORED;

COMMENT ON COLUMN trade_rationale_embeddings.symbol IS 'Generated from trade_details->>"symbol" for fast filtering';
COMMENT ON COLUMN trade_rationale_embeddings.strategy_type IS 'Generated from trade_details->>"strategy_type" for fast filtering';
COMMENT ON COLUMN trade_rationale_embeddings.actual_outcome IS 'Generated from outcome->>"actual_outcome" for fast filtering';

-- ============================================================================
-- trade_rationale_embeddings: Create composite indexes
-- ============================================================================

-- Core composite: user + time (most common pattern)
CREATE INDEX IF NOT EXISTS idx_tre_user_created
  ON trade_rationale_embeddings (user_id, created_at DESC);

-- User + symbol + time (for symbol-specific similarity searches)
CREATE INDEX IF NOT EXISTS idx_tre_user_symbol_created
  ON trade_rationale_embeddings (user_id, symbol, created_at DESC);

-- User + strategy + time (for strategy-specific similarity searches)
CREATE INDEX IF NOT EXISTS idx_tre_user_strategy_created
  ON trade_rationale_embeddings (user_id, strategy_type, created_at DESC);

-- User + outcome + time (for outcome-based learning)
CREATE INDEX IF NOT EXISTS idx_tre_user_outcome_created
  ON trade_rationale_embeddings (user_id, actual_outcome, created_at DESC);

-- Partial index: completed trades only (common filter)
CREATE INDEX IF NOT EXISTS idx_tre_user_created_completed
  ON trade_rationale_embeddings (user_id, created_at DESC)
  WHERE outcome IS NOT NULL;

-- ============================================================================
-- trade_rationale_embeddings: Drop redundant single-column indexes
-- ============================================================================

-- Keep FK index for joins
-- DROP IF EXISTS: single user_id, created_at if they exist as standalone
-- (Only drop if not needed for other query patterns)
DROP INDEX IF EXISTS idx_rationale_embeddings_user_id;
DROP INDEX IF EXISTS idx_rationale_embeddings_created_at;

-- Keep idx_rationale_embeddings_evaluation_id for FK joins
-- Keep idx_rationale_embeddings_trade_details (GIN) if needed for ad-hoc queries
-- Consider dropping later if generated columns cover 90% of use cases

-- ============================================================================
-- trade_postmortem_analysis: Add generated column
-- ============================================================================

-- Realized P&L percentage (from performance_summary JSONB)
ALTER TABLE trade_postmortem_analysis
  ADD COLUMN IF NOT EXISTS realized_pl_percent numeric
  GENERATED ALWAYS AS ((performance_summary->>'realized_pl_percent')::numeric) STORED;

COMMENT ON COLUMN trade_postmortem_analysis.realized_pl_percent IS 'Generated from performance_summary->>"realized_pl_percent" for fast filtering';

-- ============================================================================
-- trade_postmortem_analysis: Create composite indexes
-- ============================================================================

-- Core composite: user + analyzed time
CREATE INDEX IF NOT EXISTS idx_tpa_user_analyzed
  ON trade_postmortem_analysis (user_id, analyzed_at DESC);

-- User + confidence (for high-quality analyses)
CREATE INDEX IF NOT EXISTS idx_tpa_user_confidence
  ON trade_postmortem_analysis (user_id, analysis_confidence DESC);

-- User + P&L percentage (for winners/losers filtering)
CREATE INDEX IF NOT EXISTS idx_tpa_user_plpct
  ON trade_postmortem_analysis (user_id, realized_pl_percent);

-- ============================================================================
-- trade_postmortem_analysis: Drop redundant single-column indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_postmortem_user_id;
DROP INDEX IF EXISTS idx_postmortem_analyzed_at;

-- Keep idx_postmortem_trade_id for FK joins

-- ============================================================================
-- trade_snapshot_embeddings: Create composite indexes
-- ============================================================================

-- Core composite: user + time
CREATE INDEX IF NOT EXISTS idx_tse_user_created
  ON trade_snapshot_embeddings (user_id, created_at DESC);

-- Keep trade_id index for joins
CREATE INDEX IF NOT EXISTS idx_tse_trade_id
  ON trade_snapshot_embeddings (trade_id);

-- ============================================================================
-- trade_snapshot_embeddings: Drop redundant single-column indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_snapshot_embeddings_user_id;

-- Keep idx_snapshot_embeddings_snapshot_id for FK joins
-- Keep idx_snapshot_embeddings_trade_id (or replaced by idx_tse_trade_id above)

-- ============================================================================
-- Analyze tables to update statistics
-- ============================================================================

ANALYZE trade_rationale_embeddings;
ANALYZE trade_postmortem_analysis;
ANALYZE trade_snapshot_embeddings;

-- ============================================================================
-- Verification and summary
-- ============================================================================

DO $$
DECLARE
  tre_indexes int;
  tpa_indexes int;
  tse_indexes int;
BEGIN
  -- Count indexes on each table
  SELECT COUNT(*) INTO tre_indexes
  FROM pg_indexes
  WHERE tablename = 'trade_rationale_embeddings'
    AND indexname LIKE 'idx_tre%';

  SELECT COUNT(*) INTO tpa_indexes
  FROM pg_indexes
  WHERE tablename = 'trade_postmortem_analysis'
    AND indexname LIKE 'idx_tpa%';

  SELECT COUNT(*) INTO tse_indexes
  FROM pg_indexes
  WHERE tablename = 'trade_snapshot_embeddings'
    AND indexname LIKE 'idx_tse%';

  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'Vector Search Optimization Complete!';
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'trade_rationale_embeddings:';
  RAISE NOTICE '  - Generated columns: symbol, strategy_type, actual_outcome';
  RAISE NOTICE '  - Composite indexes: % created', tre_indexes;
  RAISE NOTICE '';
  RAISE NOTICE 'trade_postmortem_analysis:';
  RAISE NOTICE '  - Generated column: realized_pl_percent';
  RAISE NOTICE '  - Composite indexes: % created', tpa_indexes;
  RAISE NOTICE '';
  RAISE NOTICE 'trade_snapshot_embeddings:';
  RAISE NOTICE '  - Composite indexes: % created', tse_indexes;
  RAISE NOTICE '';
  RAISE NOTICE 'Performance Strategy:';
  RAISE NOTICE '  ✓ Filter by user_id + created_at before similarity search';
  RAISE NOTICE '  ✓ Use generated columns for symbol/strategy/outcome filters';
  RAISE NOTICE '  ✓ Always use LIMIT 10-20 for similarity queries';
  RAISE NOTICE '  ✓ Project only needed columns to reduce I/O';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Test queries with EXPLAIN ANALYZE';
  RAISE NOTICE '  2. Monitor pg_stat_user_indexes for unused indexes';
  RAISE NOTICE '  3. Submit Supabase ticket for VECTOR_MAX_DIM ≥4096';
  RAISE NOTICE '=======================================================';
END $$;

-- Show created indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('trade_rationale_embeddings', 'trade_postmortem_analysis', 'trade_snapshot_embeddings')
  AND indexname LIKE 'idx_t%'
ORDER BY tablename, indexname;
