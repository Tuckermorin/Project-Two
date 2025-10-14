-- Migration: Add Daily Market Context Table
-- Created: 2025-10-13
-- Description: Stores daily AI-generated summaries of economic/political news for RAG context

-- Create daily_market_context table
CREATE TABLE IF NOT EXISTS daily_market_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- AI-generated summary
  summary TEXT NOT NULL,  -- Comprehensive summary of the day's economic/political news
  key_themes JSONB,  -- { "themes": ["Fed rate decision", "Inflation data", "Tech earnings"] }

  -- Market sentiment
  overall_market_sentiment TEXT,  -- "bullish", "bearish", "neutral", "mixed"
  sentiment_score NUMERIC,  -- -1 (very bearish) to +1 (very bullish)

  -- Economic indicators mentioned
  economic_indicators JSONB,  -- { "inflation": "2.7%", "unemployment": "3.8%", "gdp_growth": "2.5%" }

  -- Political/regulatory news
  political_events JSONB,  -- [{ "event": "...", "impact": "..." }]

  -- Sector-specific themes
  sector_themes JSONB,  -- { "technology": "AI boom", "financials": "Rate cuts", ... }

  -- Source articles metadata
  source_count INTEGER DEFAULT 0,  -- Number of articles analyzed
  source_urls JSONB,  -- Array of source URLs for reference
  source_domains JSONB,  -- ["reuters.com", "bloomberg.com", ...]

  -- Search queries used
  search_queries TEXT[],  -- Array of Tavily queries used

  -- Embedding for RAG retrieval
  embedding VECTOR(1536),  -- OpenAI ada-002 embeddings for semantic search

  -- Metadata
  generated_by TEXT DEFAULT 'tavily-gpt4',  -- Which system/model generated this
  generation_cost_cents NUMERIC,  -- Track API costs (Tavily + OpenAI)
  processing_time_seconds NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_market_context_date
  ON daily_market_context(as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_market_context_created
  ON daily_market_context(created_at DESC);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_daily_market_context_embedding
  ON daily_market_context
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Unique constraint - one summary per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_market_context_unique_date
  ON daily_market_context(as_of_date);

-- Add RLS policies
ALTER TABLE daily_market_context ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read
CREATE POLICY "Allow authenticated read access to daily_market_context"
  ON daily_market_context
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role full access
CREATE POLICY "Allow service role full access to daily_market_context"
  ON daily_market_context
  FOR ALL
  TO service_role
  USING (true);

-- Add helpful comments
COMMENT ON TABLE daily_market_context IS 'Daily AI-generated summaries of economic/political news for RAG-enhanced trade recommendations';
COMMENT ON COLUMN daily_market_context.summary IS 'Comprehensive AI summary of the days economic and political news';
COMMENT ON COLUMN daily_market_context.key_themes IS 'Major themes identified in the news (array of strings)';
COMMENT ON COLUMN daily_market_context.sentiment_score IS 'Overall market sentiment: -1 (bearish) to +1 (bullish)';
COMMENT ON COLUMN daily_market_context.embedding IS 'Vector embedding for RAG similarity search';
COMMENT ON COLUMN daily_market_context.economic_indicators IS 'Economic data points mentioned in the news';

-- Create a view for recent context (last 30 days)
CREATE OR REPLACE VIEW recent_market_context AS
SELECT
  id,
  as_of_date,
  summary,
  key_themes,
  overall_market_sentiment,
  sentiment_score,
  sector_themes,
  source_count,
  created_at
FROM daily_market_context
WHERE as_of_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY as_of_date DESC;

COMMENT ON VIEW recent_market_context IS 'Last 30 days of market context for quick access';
