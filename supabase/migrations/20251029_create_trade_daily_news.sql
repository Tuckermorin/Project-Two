-- Migration: Create trade_daily_news table
-- Purpose: Store daily news summaries for active trades from Tavily API
-- Date: 2025-10-29

BEGIN;

-- ============================================================================
-- Main Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trade_daily_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic Info
  symbol TEXT NOT NULL,
  date DATE NOT NULL,

  -- News Data
  headlines JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  key_topics TEXT[] DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one news entry per trade per day
  UNIQUE(trade_id, date)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Performance indexes
CREATE INDEX idx_trade_daily_news_trade_id ON public.trade_daily_news(trade_id);
CREATE INDEX idx_trade_daily_news_user_id ON public.trade_daily_news(user_id);
CREATE INDEX idx_trade_daily_news_date ON public.trade_daily_news(date DESC);
CREATE INDEX idx_trade_daily_news_symbol ON public.trade_daily_news(symbol);
CREATE INDEX idx_trade_daily_news_sentiment ON public.trade_daily_news(sentiment);

-- GIN index for key_topics array
CREATE INDEX idx_trade_daily_news_topics ON public.trade_daily_news USING GIN(key_topics);

-- GIN index for headlines JSONB
CREATE INDEX idx_trade_daily_news_headlines ON public.trade_daily_news USING GIN(headlines);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_trade_daily_news_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_daily_news_updated
BEFORE UPDATE ON public.trade_daily_news
FOR EACH ROW
EXECUTE FUNCTION update_trade_daily_news_timestamp();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.trade_daily_news ENABLE ROW LEVEL SECURITY;

-- Users can only see their own news
CREATE POLICY trade_daily_news_select_policy
  ON public.trade_daily_news
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own news
CREATE POLICY trade_daily_news_insert_policy
  ON public.trade_daily_news
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own news
CREATE POLICY trade_daily_news_update_policy
  ON public.trade_daily_news
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own news
CREATE POLICY trade_daily_news_delete_policy
  ON public.trade_daily_news
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get news timeline for a trade
CREATE OR REPLACE FUNCTION get_trade_news_timeline(
  p_trade_id UUID,
  p_days_back INT DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  summary TEXT,
  sentiment TEXT,
  headline_count INT,
  key_topics TEXT[]
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    date,
    summary,
    sentiment,
    jsonb_array_length(headlines) as headline_count,
    key_topics
  FROM trade_daily_news
  WHERE trade_id = p_trade_id
    AND date >= CURRENT_DATE - p_days_back
  ORDER BY date DESC;
$$;

-- Get sentiment trend for a symbol
CREATE OR REPLACE FUNCTION get_symbol_sentiment_trend(
  p_symbol TEXT,
  p_days_back INT DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  bullish_count BIGINT,
  bearish_count BIGINT,
  neutral_count BIGINT,
  net_sentiment NUMERIC
)
LANGUAGE SQL STABLE
AS $$
  WITH sentiment_daily AS (
    SELECT
      date,
      SUM(CASE WHEN sentiment = 'bullish' THEN 1 ELSE 0 END) as bullish_count,
      SUM(CASE WHEN sentiment = 'bearish' THEN 1 ELSE 0 END) as bearish_count,
      SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_count
    FROM trade_daily_news
    WHERE symbol = p_symbol
      AND date >= CURRENT_DATE - p_days_back
    GROUP BY date
  )
  SELECT
    date,
    bullish_count,
    bearish_count,
    neutral_count,
    CASE
      WHEN (bullish_count + bearish_count) > 0
      THEN (bullish_count - bearish_count)::NUMERIC / (bullish_count + bearish_count)
      ELSE 0
    END as net_sentiment
  FROM sentiment_daily
  ORDER BY date DESC;
$$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.trade_daily_news IS
  'Daily news summaries for active trades fetched from Tavily API';

COMMENT ON COLUMN public.trade_daily_news.headlines IS
  'JSONB array of headline objects with title, url, published_date, relevance_score';

COMMENT ON COLUMN public.trade_daily_news.summary IS
  'AI-generated summary of daily news for the symbol';

COMMENT ON COLUMN public.trade_daily_news.sentiment IS
  'Overall sentiment: bullish, bearish, or neutral';

COMMENT ON COLUMN public.trade_daily_news.key_topics IS
  'Array of key topics: earnings, regulatory, M&A, legal, guidance, etc.';

COMMENT ON FUNCTION get_trade_news_timeline IS
  'Get chronological news timeline for a trade';

COMMENT ON FUNCTION get_symbol_sentiment_trend IS
  'Get sentiment trend analysis for a symbol over time';

COMMIT;
