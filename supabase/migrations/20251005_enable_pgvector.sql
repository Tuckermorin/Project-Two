-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create trade embeddings table
CREATE TABLE IF NOT EXISTS trade_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
  embedding VECTOR(1536),  -- OpenAI ada-002 dimension
  metadata JSONB,  -- {symbol, strategy, ips_factors, outcome, regime}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS trade_embeddings_vector_idx 
  ON trade_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create user_id index
CREATE INDEX IF NOT EXISTS trade_embeddings_user_id_idx 
  ON trade_embeddings(user_id);

-- RLS policies
ALTER TABLE trade_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own embeddings"
  ON trade_embeddings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own embeddings"
  ON trade_embeddings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_trades(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  trade_id UUID,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.trade_id,
    1 - (te.embedding <=> query_embedding) AS similarity,
    te.metadata
  FROM trade_embeddings te
  WHERE 
    te.user_id = auth.uid()
    AND 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
