-- Migration: Add Reddit Sentiment Tracking
-- Purpose: Store Reddit social sentiment data for options trading analysis

-- Create reddit_sentiment table
CREATE TABLE IF NOT EXISTS reddit_sentiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sentiment_score NUMERIC NOT NULL CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  mention_count INTEGER NOT NULL DEFAULT 0,
  trending_rank INTEGER CHECK (trending_rank >= 1 AND trending_rank <= 100),
  mention_velocity NUMERIC, -- % change in mentions (24h)
  subreddit_breakdown JSONB NOT NULL DEFAULT '{}', -- {subreddit: count}
  top_posts JSONB NOT NULL DEFAULT '[]', -- Array of top 5 posts
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_reddit_sentiment_symbol_timestamp
  ON reddit_sentiment(symbol, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_sentiment_user_id
  ON reddit_sentiment(user_id);

CREATE INDEX IF NOT EXISTS idx_reddit_sentiment_trending
  ON reddit_sentiment(trending_rank, timestamp DESC)
  WHERE trending_rank IS NOT NULL;

-- RLS policies
ALTER TABLE reddit_sentiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Reddit sentiment"
  ON reddit_sentiment FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Reddit sentiment"
  ON reddit_sentiment FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE reddit_sentiment IS 'Reddit social sentiment analysis for stock symbols';
COMMENT ON COLUMN reddit_sentiment.sentiment_score IS 'Sentiment score from -1 (bearish) to +1 (bullish)';
COMMENT ON COLUMN reddit_sentiment.mention_count IS 'Number of Reddit mentions in timeframe';
COMMENT ON COLUMN reddit_sentiment.trending_rank IS 'Trending position (1-100), null if not trending';
COMMENT ON COLUMN reddit_sentiment.mention_velocity IS 'Percentage change in mentions over 24 hours';
COMMENT ON COLUMN reddit_sentiment.subreddit_breakdown IS 'JSON object with mention count per subreddit';
COMMENT ON COLUMN reddit_sentiment.top_posts IS 'Array of top 5 Reddit posts by score';
COMMENT ON COLUMN reddit_sentiment.confidence IS 'Confidence level based on sample size: low (<20), medium (20-50), high (50+)';
