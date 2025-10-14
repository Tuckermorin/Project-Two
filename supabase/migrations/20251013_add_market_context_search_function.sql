-- Migration: Add Vector Search Function for Daily Market Context
-- Created: 2025-10-13
-- Description: Enables RAG similarity search for market context

-- Create function for vector similarity search
CREATE OR REPLACE FUNCTION match_market_context(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  as_of_date DATE,
  summary TEXT,
  key_themes JSONB,
  overall_market_sentiment TEXT,
  sentiment_score NUMERIC,
  sector_themes JSONB,
  source_count INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dmc.id,
    dmc.as_of_date,
    dmc.summary,
    dmc.key_themes,
    dmc.overall_market_sentiment,
    dmc.sentiment_score,
    dmc.sector_themes,
    dmc.source_count,
    1 - (dmc.embedding <=> query_embedding) AS similarity
  FROM daily_market_context dmc
  WHERE dmc.embedding IS NOT NULL
    AND 1 - (dmc.embedding <=> query_embedding) > match_threshold
  ORDER BY dmc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_market_context IS 'Find similar market context using vector similarity search for RAG';
