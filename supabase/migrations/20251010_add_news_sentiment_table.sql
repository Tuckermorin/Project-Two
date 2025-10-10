-- Migration: Add News Sentiment History Table
-- Created: 2025-10-10
-- Description: Stores historical news sentiment data from Alpha Vantage NEWS_SENTIMENT API

-- Create news_sentiment_history table
CREATE TABLE IF NOT EXISTS news_sentiment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Overall sentiment metrics
  sentiment_score NUMERIC,  -- -1 to +1
  sentiment_label TEXT,     -- Bearish, Somewhat-Bearish, Neutral, Somewhat-Bullish, Bullish

  -- Article counts by sentiment
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  total_article_count INTEGER DEFAULT 0,

  -- Relevance metrics
  avg_relevance_score NUMERIC,  -- Average relevance score for symbol

  -- Topic-based sentiment breakdown (JSONB for flexibility)
  topics JSONB,  -- { "earnings": 0.5, "technology": 0.3, "financial_markets": 0.2 }
  topic_sentiment JSONB,  -- { "earnings": 0.4, "technology": -0.1, "financial_markets": 0.2 }

  -- Raw data for analysis
  raw_articles JSONB,  -- Store subset of articles for reference

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_sentiment_symbol_date ON news_sentiment_history(symbol, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_timestamp ON news_sentiment_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_symbol ON news_sentiment_history(symbol);

-- Create unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_sentiment_unique
  ON news_sentiment_history(symbol, as_of_date);

-- Add RLS policies
ALTER TABLE news_sentiment_history ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read
CREATE POLICY "Allow authenticated read access to news_sentiment_history"
  ON news_sentiment_history
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role to insert/update
CREATE POLICY "Allow service role full access to news_sentiment_history"
  ON news_sentiment_history
  FOR ALL
  TO service_role
  USING (true);

-- Add helpful comments
COMMENT ON TABLE news_sentiment_history IS 'Historical news sentiment data from Alpha Vantage NEWS_SENTIMENT API';
COMMENT ON COLUMN news_sentiment_history.sentiment_score IS 'Overall sentiment score: -1 (bearish) to +1 (bullish)';
COMMENT ON COLUMN news_sentiment_history.topics IS 'Topic distribution as JSON: {"earnings": 0.5, "technology": 0.3}';
COMMENT ON COLUMN news_sentiment_history.topic_sentiment IS 'Sentiment by topic: {"earnings": 0.4, "technology": -0.1}';
