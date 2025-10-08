-- Migration: Update Reddit Sentiment for Apewisdom API
-- Purpose: Remove OAuth-specific columns that Apewisdom doesn't provide

-- Make subreddit_breakdown and top_posts nullable (Apewisdom doesn't provide these)
ALTER TABLE reddit_sentiment
  ALTER COLUMN subreddit_breakdown DROP NOT NULL,
  ALTER COLUMN subreddit_breakdown SET DEFAULT NULL,
  ALTER COLUMN top_posts DROP NOT NULL,
  ALTER COLUMN top_posts SET DEFAULT NULL;

-- Update comments
COMMENT ON COLUMN reddit_sentiment.subreddit_breakdown IS 'JSON object with mention count per subreddit (legacy field, null for Apewisdom)';
COMMENT ON COLUMN reddit_sentiment.top_posts IS 'Array of top Reddit posts by score (legacy field, null for Apewisdom)';
COMMENT ON TABLE reddit_sentiment IS 'Reddit social sentiment analysis via Apewisdom aggregator';
