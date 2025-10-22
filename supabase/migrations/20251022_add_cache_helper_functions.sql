-- Migration: Add Helper Functions for Intelligence Cache
-- Created: 2025-10-22
-- Description: Helper functions for cache statistics tracking

-- ============================================================================
-- Function: Increment Cache Statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_cache_stats(
  p_symbol TEXT,
  p_source_type TEXT,
  p_stats_date DATE,
  p_cache_hits INTEGER DEFAULT 0,
  p_cache_misses INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO intelligence_usage_stats (
    symbol,
    source_type,
    stats_date,
    access_count,
    cache_hits,
    cache_misses,
    last_accessed_at
  )
  VALUES (
    p_symbol,
    p_source_type,
    p_stats_date,
    p_cache_hits + p_cache_misses,
    p_cache_hits,
    p_cache_misses,
    NOW()
  )
  ON CONFLICT (symbol, source_type, stats_date)
  DO UPDATE SET
    access_count = intelligence_usage_stats.access_count + p_cache_hits + p_cache_misses,
    cache_hits = intelligence_usage_stats.cache_hits + p_cache_hits,
    cache_misses = intelligence_usage_stats.cache_misses + p_cache_misses,
    last_accessed_at = NOW(),
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION increment_cache_stats IS 'Increment cache statistics for a symbol/source/date';

-- ============================================================================
-- Function: Get Hot Symbols (Most Accessed)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hot_symbols(
  p_days INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  symbol TEXT,
  total_accesses BIGINT,
  cache_hit_rate NUMERIC,
  last_accessed TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.symbol,
    SUM(s.access_count) as total_accesses,
    ROUND(
      (SUM(s.cache_hits)::NUMERIC / NULLIF(SUM(s.cache_hits + s.cache_misses), 0)) * 100,
      2
    ) as cache_hit_rate,
    MAX(s.last_accessed_at) as last_accessed
  FROM intelligence_usage_stats s
  WHERE s.stats_date >= CURRENT_DATE - p_days
  GROUP BY s.symbol
  ORDER BY total_accesses DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_hot_symbols IS 'Get most frequently accessed symbols with cache hit rates';

-- ============================================================================
-- Function: Get Cache Health Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cache_health_summary()
RETURNS TABLE (
  total_cached_entries BIGINT,
  valid_entries BIGINT,
  expired_entries BIGINT,
  total_symbols BIGINT,
  avg_age_hours NUMERIC,
  cache_hit_rate_7d NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_cached_entries,
    COUNT(*) FILTER (WHERE expires_at > NOW())::BIGINT as valid_entries,
    COUNT(*) FILTER (WHERE expires_at <= NOW())::BIGINT as expired_entries,
    COUNT(DISTINCT symbol)::BIGINT as total_symbols,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - cached_at)) / 3600)::NUMERIC, 2) as avg_age_hours,
    (
      SELECT ROUND(
        (SUM(cache_hits)::NUMERIC / NULLIF(SUM(cache_hits + cache_misses), 0)) * 100,
        2
      )
      FROM intelligence_usage_stats
      WHERE stats_date >= CURRENT_DATE - 7
    ) as cache_hit_rate_7d
  FROM market_intelligence_cache;
END;
$$;

COMMENT ON FUNCTION get_cache_health_summary IS 'Get overall cache health metrics';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Index for hot symbols query
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_stats_date_access
  ON intelligence_usage_stats(stats_date DESC, access_count DESC);

-- Composite index for cache queries
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_symbol_expires
  ON market_intelligence_cache(symbol, expires_at DESC);
