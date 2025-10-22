-- Migration: Create Intelligence Cache Tables
-- Created: 2025-10-22
-- Description: Cache for market intelligence data from external database
--              Reduces cross-database queries and improves performance

-- ============================================================================
-- market_intelligence_cache: Cache for frequently accessed intelligence
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_intelligence_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  source_type TEXT NOT NULL, -- 'earnings_transcript', 'market_news', 'news', 'sentiment'

  -- Data payload
  data JSONB NOT NULL,

  -- Metadata
  external_id TEXT, -- ID in external database
  external_article_id TEXT, -- For news/sentiment records
  relevance_score NUMERIC, -- For ranked results

  -- Timestamps
  data_date TIMESTAMPTZ, -- When the data was originally published/recorded
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- TTL for cache expiration
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 1,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_symbol ON market_intelligence_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_source_type ON market_intelligence_cache(source_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_symbol_source ON market_intelligence_cache(symbol, source_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_expires_at ON market_intelligence_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_data_date ON market_intelligence_cache(data_date DESC);

-- GIN index for JSONB data searches
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_data_gin ON market_intelligence_cache USING gin(data);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_lookup
  ON market_intelligence_cache(symbol, source_type, expires_at);

-- ============================================================================
-- intelligence_sync_log: Track sync operations from external database
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL, -- 'full', 'incremental', 'symbol'
  source_type TEXT NOT NULL, -- 'earnings_transcript', 'market_news', etc.

  -- Sync details
  symbols_synced TEXT[], -- Array of symbols synced (null for full sync)
  records_fetched INTEGER DEFAULT 0,
  records_cached INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_expired INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intelligence_sync_log_started_at ON intelligence_sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_sync_log_status ON intelligence_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_intelligence_sync_log_source_type ON intelligence_sync_log(source_type);

-- ============================================================================
-- intelligence_usage_stats: Track which symbols/sources are accessed most
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  source_type TEXT NOT NULL,

  -- Usage metrics
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  first_accessed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Cache performance
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  avg_fetch_time_ms INTEGER,

  -- Updated daily
  stats_date DATE NOT NULL DEFAULT CURRENT_DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one row per symbol/source/date
  UNIQUE(symbol, source_type, stats_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_stats_symbol ON intelligence_usage_stats(symbol);
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_stats_source_type ON intelligence_usage_stats(source_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_stats_stats_date ON intelligence_usage_stats(stats_date DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_stats_access_count ON intelligence_usage_stats(access_count DESC);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_intelligence_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM market_intelligence_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- Function to update cache statistics
CREATE OR REPLACE FUNCTION update_intelligence_cache_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update access tracking
  NEW.last_accessed_at = NOW();
  NEW.access_count = NEW.access_count + 1;
  NEW.updated_at = NOW();

  -- Update daily stats
  INSERT INTO intelligence_usage_stats (
    symbol,
    source_type,
    access_count,
    last_accessed_at,
    cache_hits,
    stats_date
  )
  VALUES (
    NEW.symbol,
    NEW.source_type,
    1,
    NOW(),
    1,
    CURRENT_DATE
  )
  ON CONFLICT (symbol, source_type, stats_date)
  DO UPDATE SET
    access_count = intelligence_usage_stats.access_count + 1,
    last_accessed_at = NOW(),
    cache_hits = intelligence_usage_stats.cache_hits + 1,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Trigger to update stats on cache access
CREATE TRIGGER trigger_update_intelligence_cache_stats
  BEFORE UPDATE OF last_accessed_at ON market_intelligence_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_intelligence_cache_stats();

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE market_intelligence_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_usage_stats ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read cache
CREATE POLICY "Allow authenticated read access to intelligence cache"
  ON market_intelligence_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to intelligence cache"
  ON market_intelligence_cache
  FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Allow service role full access to intelligence sync log"
  ON intelligence_sync_log
  FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Allow service role full access to intelligence usage stats"
  ON intelligence_usage_stats
  FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- Helper Views
-- ============================================================================

-- View for most frequently accessed intelligence
CREATE OR REPLACE VIEW v_intelligence_hot_cache AS
SELECT
  symbol,
  source_type,
  SUM(access_count) as total_accesses,
  MAX(last_accessed_at) as most_recent_access,
  COUNT(DISTINCT stats_date) as days_tracked,
  AVG(cache_hits::NUMERIC / NULLIF(cache_hits + cache_misses, 0)) as cache_hit_rate
FROM intelligence_usage_stats
WHERE stats_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY symbol, source_type
ORDER BY total_accesses DESC
LIMIT 100;

-- View for cache health
CREATE OR REPLACE VIEW v_intelligence_cache_health AS
SELECT
  source_type,
  COUNT(*) as total_cached,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as valid_entries,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_entries,
  AVG(access_count) as avg_access_count,
  MAX(last_accessed_at) as most_recent_access,
  AVG(EXTRACT(EPOCH FROM (NOW() - cached_at)) / 3600) as avg_age_hours
FROM market_intelligence_cache
GROUP BY source_type
ORDER BY total_cached DESC;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE market_intelligence_cache IS 'Cache for market intelligence data from external database';
COMMENT ON TABLE intelligence_sync_log IS 'Log of sync operations from external database';
COMMENT ON TABLE intelligence_usage_stats IS 'Daily usage statistics for intelligence data';

COMMENT ON COLUMN market_intelligence_cache.source_type IS 'Type of intelligence: earnings_transcript, market_news, news, sentiment';
COMMENT ON COLUMN market_intelligence_cache.data IS 'JSONB payload with full intelligence data';
COMMENT ON COLUMN market_intelligence_cache.expires_at IS 'TTL expiration (7 days for news, 90 days for earnings)';

COMMENT ON FUNCTION cleanup_expired_intelligence_cache IS 'Removes expired cache entries and returns count deleted';
COMMENT ON VIEW v_intelligence_hot_cache IS 'Most frequently accessed intelligence in last 30 days';
COMMENT ON VIEW v_intelligence_cache_health IS 'Cache health metrics by source type';
