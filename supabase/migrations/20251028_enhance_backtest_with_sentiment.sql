-- Migration: Enhance IPS Backtesting with Sentiment Analysis
-- Created: 2025-10-28
-- Description: Add sentiment data support to backtesting infrastructure

-- ============================================================================
-- Add sentiment tracking to backtest runs
-- ============================================================================

ALTER TABLE ips_backtest_runs
ADD COLUMN IF NOT EXISTS include_sentiment BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sentiment_fetched INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sentiment_sources JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ips_backtest_runs.include_sentiment IS 'Whether to fetch and analyze sentiment data for this backtest';
COMMENT ON COLUMN ips_backtest_runs.sentiment_fetched IS 'Number of sentiment data points successfully fetched';
COMMENT ON COLUMN ips_backtest_runs.sentiment_sources IS 'Array of news sources used (e.g., ["Bloomberg", "CNBC"])';

-- ============================================================================
-- Create historical_sentiment_cache table
-- Purpose: Cache AlphaVantage sentiment data to avoid repeated API calls
-- ============================================================================

CREATE TABLE IF NOT EXISTS historical_sentiment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Symbol and Date
  symbol TEXT NOT NULL,
  analysis_date DATE NOT NULL,

  -- Sentiment Metrics (from AlphaVantage News Sentiment API)
  overall_sentiment_score NUMERIC, -- -1 to 1 (bearish to bullish)
  overall_sentiment_label TEXT, -- 'Bearish', 'Somewhat-Bearish', 'Neutral', 'Somewhat-Bullish', 'Bullish'

  -- Article Counts
  article_count INTEGER NOT NULL DEFAULT 0,
  bullish_articles INTEGER DEFAULT 0,
  bearish_articles INTEGER DEFAULT 0,
  neutral_articles INTEGER DEFAULT 0,

  -- Detailed Sentiment Breakdown
  sentiment_distribution JSONB, -- {"bullish": 0.4, "bearish": 0.2, "neutral": 0.4}
  top_topics JSONB, -- Array of trending topics/themes
  news_sources JSONB, -- Array of source names

  -- Raw Article Summary (for RAG context)
  article_summaries JSONB, -- Array of {title, summary, sentiment, relevance_score, published_at}

  -- Metadata
  api_response_raw JSONB, -- Full AlphaVantage response for debugging
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one sentiment record per symbol per date
  UNIQUE(symbol, analysis_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sentiment_cache_symbol_date ON historical_sentiment_cache(symbol, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment_cache_symbol ON historical_sentiment_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_sentiment_cache_date ON historical_sentiment_cache(analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment_cache_sentiment_score ON historical_sentiment_cache(overall_sentiment_score);

COMMENT ON TABLE historical_sentiment_cache IS 'Cached AlphaVantage sentiment data to reduce API calls during backtesting';

-- ============================================================================
-- Add sentiment columns to backtest_trade_matches
-- ============================================================================

ALTER TABLE ips_backtest_trade_matches
ADD COLUMN IF NOT EXISTS sentiment_at_entry NUMERIC,
ADD COLUMN IF NOT EXISTS sentiment_label TEXT,
ADD COLUMN IF NOT EXISTS article_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sentiment_context JSONB; -- Top headlines/topics at entry

CREATE INDEX IF NOT EXISTS idx_backtest_trade_matches_sentiment ON ips_backtest_trade_matches(sentiment_at_entry);

COMMENT ON COLUMN ips_backtest_trade_matches.sentiment_at_entry IS 'Overall sentiment score at trade entry (-1 to 1)';
COMMENT ON COLUMN ips_backtest_trade_matches.sentiment_label IS 'Human-readable sentiment label';
COMMENT ON COLUMN ips_backtest_trade_matches.sentiment_context IS 'Top news headlines and topics at time of trade';

-- ============================================================================
-- Add sentiment analysis to backtest results
-- ============================================================================

ALTER TABLE ips_backtest_results
ADD COLUMN IF NOT EXISTS sentiment_correlation JSONB, -- Correlation between sentiment and outcomes
ADD COLUMN IF NOT EXISTS optimal_sentiment_range JSONB; -- Best sentiment range for entries

COMMENT ON COLUMN ips_backtest_results.sentiment_correlation IS 'Statistical correlation between sentiment scores and trade outcomes';
COMMENT ON COLUMN ips_backtest_results.optimal_sentiment_range IS 'Sentiment ranges that produced best results';

-- ============================================================================
-- Create function to calculate sentiment-outcome correlation
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sentiment_correlation(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
  bullish_win_rate NUMERIC;
  bearish_win_rate NUMERIC;
  neutral_win_rate NUMERIC;
  avg_roi_by_sentiment JSONB;
BEGIN
  -- Calculate win rates by sentiment category
  SELECT
    COALESCE(
      AVG(CASE WHEN sentiment_label ILIKE '%bullish%' AND realized_roi > 0 THEN 1 ELSE 0 END) * 100,
      0
    ) INTO bullish_win_rate
  FROM ips_backtest_trade_matches
  WHERE run_id = p_run_id AND sentiment_label IS NOT NULL;

  SELECT
    COALESCE(
      AVG(CASE WHEN sentiment_label ILIKE '%bearish%' AND realized_roi > 0 THEN 1 ELSE 0 END) * 100,
      0
    ) INTO bearish_win_rate
  FROM ips_backtest_trade_matches
  WHERE run_id = p_run_id AND sentiment_label IS NOT NULL;

  SELECT
    COALESCE(
      AVG(CASE WHEN sentiment_label = 'Neutral' AND realized_roi > 0 THEN 1 ELSE 0 END) * 100,
      0
    ) INTO neutral_win_rate
  FROM ips_backtest_trade_matches
  WHERE run_id = p_run_id AND sentiment_label IS NOT NULL;

  -- Calculate average ROI by sentiment bucket
  SELECT jsonb_object_agg(
    sentiment_bucket,
    avg_roi
  ) INTO avg_roi_by_sentiment
  FROM (
    SELECT
      CASE
        WHEN sentiment_at_entry > 0.3 THEN 'Very Bullish'
        WHEN sentiment_at_entry > 0.1 THEN 'Bullish'
        WHEN sentiment_at_entry >= -0.1 THEN 'Neutral'
        WHEN sentiment_at_entry >= -0.3 THEN 'Bearish'
        ELSE 'Very Bearish'
      END as sentiment_bucket,
      AVG(realized_roi) as avg_roi
    FROM ips_backtest_trade_matches
    WHERE run_id = p_run_id AND sentiment_at_entry IS NOT NULL AND realized_roi IS NOT NULL
    GROUP BY sentiment_bucket
  ) subquery;

  -- Build result JSON
  result := jsonb_build_object(
    'bullish_win_rate', bullish_win_rate,
    'bearish_win_rate', bearish_win_rate,
    'neutral_win_rate', neutral_win_rate,
    'avg_roi_by_sentiment', COALESCE(avg_roi_by_sentiment, '{}'::jsonb),
    'calculated_at', NOW()
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION calculate_sentiment_correlation IS 'Calculate correlation between sentiment scores and trade outcomes for a backtest run';

-- ============================================================================
-- Create function to find optimal sentiment ranges
-- ============================================================================

CREATE OR REPLACE FUNCTION find_optimal_sentiment_range(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
  best_range RECORD;
BEGIN
  -- Find sentiment range with highest win rate (minimum 10 trades)
  SELECT
    MIN(sentiment_at_entry) as min_sentiment,
    MAX(sentiment_at_entry) as max_sentiment,
    COUNT(*) as trade_count,
    AVG(CASE WHEN realized_roi > 0 THEN 1 ELSE 0 END) * 100 as win_rate,
    AVG(realized_roi) as avg_roi
  INTO best_range
  FROM (
    SELECT
      sentiment_at_entry,
      realized_roi,
      NTILE(5) OVER (ORDER BY sentiment_at_entry) as quintile
    FROM ips_backtest_trade_matches
    WHERE run_id = p_run_id
      AND sentiment_at_entry IS NOT NULL
      AND realized_roi IS NOT NULL
  ) bucketed
  GROUP BY quintile
  HAVING COUNT(*) >= 10
  ORDER BY AVG(CASE WHEN realized_roi > 0 THEN 1 ELSE 0 END) DESC
  LIMIT 1;

  IF best_range IS NOT NULL THEN
    result := jsonb_build_object(
      'min_sentiment', best_range.min_sentiment,
      'max_sentiment', best_range.max_sentiment,
      'trade_count', best_range.trade_count,
      'win_rate', best_range.win_rate,
      'avg_roi', best_range.avg_roi,
      'recommendation', CASE
        WHEN best_range.min_sentiment > 0.2 THEN 'Trade during strong bullish sentiment'
        WHEN best_range.max_sentiment < -0.2 THEN 'Trade during strong bearish sentiment'
        ELSE 'Trade during neutral sentiment'
      END
    );
  ELSE
    result := jsonb_build_object(
      'error', 'Insufficient data to determine optimal sentiment range'
    );
  END IF;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION find_optimal_sentiment_range IS 'Identify sentiment ranges that produced best backtest results';

-- ============================================================================
-- RLS Policies for new table
-- ============================================================================

ALTER TABLE historical_sentiment_cache ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for background jobs)
CREATE POLICY "Service role full access to sentiment cache"
  ON historical_sentiment_cache FOR ALL
  TO service_role
  USING (true);

-- Authenticated users can read sentiment data
CREATE POLICY "Users can read sentiment cache"
  ON historical_sentiment_cache FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Create indexes for performance
-- ============================================================================

-- Composite index for backtest queries
CREATE INDEX IF NOT EXISTS idx_historical_options_backtest_lookup
  ON historical_options_data(symbol, snapshot_date, expiration_date, delta)
  WHERE delta IS NOT NULL;

-- Index for sentiment-enhanced factor analysis
CREATE INDEX IF NOT EXISTS idx_backtest_matches_sentiment_outcome
  ON ips_backtest_trade_matches(run_id, sentiment_at_entry, realized_roi)
  WHERE sentiment_at_entry IS NOT NULL AND realized_roi IS NOT NULL;
