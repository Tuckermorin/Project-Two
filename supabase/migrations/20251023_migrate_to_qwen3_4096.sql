-- Migration: Switch from OpenAI embeddings (1536) to Ollama qwen3-embedding (4096)
-- This updates all vector columns and recreates indexes

-- IMPORTANT: This will drop existing embeddings and recreate tables
-- Run this when ready to fully switch to qwen3-embedding

-- ============================================================================
-- 1. Drop existing HNSW indexes (they depend on vector columns)
-- ============================================================================

DROP INDEX IF EXISTS idx_trade_snapshot_embeddings_vector;
DROP INDEX IF EXISTS idx_rationale_embedding;
DROP INDEX IF EXISTS idx_postmortem_embedding;

-- ============================================================================
-- 2. Alter vector columns to 4096 dimensions
-- ============================================================================

-- trade_snapshot_embeddings
ALTER TABLE trade_snapshot_embeddings
  ALTER COLUMN embedding TYPE vector(4096);

-- trade_rationale_embeddings
ALTER TABLE trade_rationale_embeddings
  ALTER COLUMN rationale_embedding TYPE vector(4096);

-- trade_postmortem_analysis
ALTER TABLE trade_postmortem_analysis
  ALTER COLUMN postmortem_embedding TYPE vector(4096);

-- ============================================================================
-- 3. Recreate IVFFlat indexes for vector similarity search (4096 dimensions)
-- Note: HNSW has a 2000-dimension limit, so we use IVFFlat for 4096-dim vectors
-- ============================================================================

-- trade_snapshot_embeddings - for finding similar trade states
CREATE INDEX idx_trade_snapshot_embeddings_vector
ON trade_snapshot_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- trade_rationale_embeddings - for finding similar AI decisions
CREATE INDEX idx_rationale_embedding
ON trade_rationale_embeddings
USING ivfflat (rationale_embedding vector_cosine_ops)
WITH (lists = 100);

-- trade_postmortem_analysis - for finding similar outcomes/lessons
CREATE INDEX idx_postmortem_embedding
ON trade_postmortem_analysis
USING ivfflat (postmortem_embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- 4. Update match functions to use 4096 dimensions
-- ============================================================================

-- Update match_trade_rationales function
CREATE OR REPLACE FUNCTION match_trade_rationales(
  query_embedding vector(4096),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  trade_evaluation_id uuid,
  rationale_text text,
  trade_details jsonb,
  outcome jsonb,
  similarity float,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tre.id,
    tre.trade_evaluation_id,
    tre.rationale_text,
    tre.trade_details,
    tre.outcome,
    1 - (tre.rationale_embedding <=> query_embedding) AS similarity,
    tre.created_at
  FROM trade_rationale_embeddings tre
  WHERE
    (filter_user_id IS NULL OR tre.user_id = filter_user_id)
    AND 1 - (tre.rationale_embedding <=> query_embedding) > match_threshold
  ORDER BY tre.rationale_embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Update match_similar_postmortems function
CREATE OR REPLACE FUNCTION match_similar_postmortems(
  query_embedding vector(4096),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  trade_id uuid,
  performance_summary jsonb,
  postmortem_analysis jsonb,
  similarity float,
  analyzed_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id,
    pm.trade_id,
    pm.performance_summary,
    pm.postmortem_analysis,
    1 - (pm.postmortem_embedding <=> query_embedding) AS similarity,
    pm.analyzed_at
  FROM trade_postmortem_analysis pm
  WHERE
    (filter_user_id IS NULL OR pm.user_id = filter_user_id)
    AND 1 - (pm.postmortem_embedding <=> query_embedding) > match_threshold
  ORDER BY pm.postmortem_embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Update comments to reflect new embedding model
-- ============================================================================

COMMENT ON COLUMN trade_snapshot_embeddings.embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';
COMMENT ON COLUMN trade_rationale_embeddings.rationale_embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';
COMMENT ON COLUMN trade_postmortem_analysis.postmortem_embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';

-- ============================================================================
-- 6. Clear existing embeddings (they're from OpenAI 1536-dim model)
-- ============================================================================

-- Option A: Delete all existing embeddings (they're incompatible with new dimension)
-- Uncomment if you want to start fresh

-- TRUNCATE trade_snapshot_embeddings CASCADE;
-- UPDATE trade_rationale_embeddings SET rationale_embedding = NULL;
-- UPDATE trade_postmortem_analysis SET postmortem_embedding = NULL;

-- ============================================================================
-- 7. Verification queries
-- ============================================================================

-- Verify vector dimensions
DO $$
DECLARE
  snapshot_dim int;
  rationale_dim int;
  postmortem_dim int;
BEGIN
  -- Check dimensions
  SELECT atttypmod - 4 INTO snapshot_dim
  FROM pg_attribute
  WHERE attrelid = 'trade_snapshot_embeddings'::regclass
  AND attname = 'embedding';

  SELECT atttypmod - 4 INTO rationale_dim
  FROM pg_attribute
  WHERE attrelid = 'trade_rationale_embeddings'::regclass
  AND attname = 'rationale_embedding';

  SELECT atttypmod - 4 INTO postmortem_dim
  FROM pg_attribute
  WHERE attrelid = 'trade_postmortem_analysis'::regclass
  AND attname = 'postmortem_embedding';

  RAISE NOTICE 'Snapshot embeddings: % dimensions', snapshot_dim;
  RAISE NOTICE 'Rationale embeddings: % dimensions', rationale_dim;
  RAISE NOTICE 'Postmortem embeddings: % dimensions', postmortem_dim;

  IF snapshot_dim != 4096 OR rationale_dim != 4096 OR postmortem_dim != 4096 THEN
    RAISE EXCEPTION 'Vector dimensions not updated correctly!';
  END IF;

  RAISE NOTICE 'All vector columns successfully migrated to 4096 dimensions (qwen3-embedding)';
END $$;
