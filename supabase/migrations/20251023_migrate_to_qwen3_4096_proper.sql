-- Migration: Switch to Ollama qwen3-embedding (4096 dimensions)
-- Following Supabase best practices for high-dimensional vectors

-- ============================================================================
-- 1. Drop existing indexes
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
-- 3. Clear existing 1536-dim embeddings (incompatible with 4096-dim model)
-- ============================================================================

-- These embeddings were created with OpenAI text-embedding-3-small (1536 dims)
-- They need to be regenerated with qwen3-embedding (4096 dims)

TRUNCATE trade_snapshot_embeddings CASCADE;
UPDATE trade_rationale_embeddings SET rationale_embedding = NULL WHERE rationale_embedding IS NOT NULL;
UPDATE trade_postmortem_analysis SET postmortem_embedding = NULL WHERE postmortem_embedding IS NOT NULL;

-- ============================================================================
-- 4. Create HNSW indexes for 4096-dimensional vectors
-- Note: HNSW supports >2000 dims (IVFFlat limited to 2000)
-- Using m=16 for good recall/performance balance, ef_construction=64 for quality
-- ============================================================================

-- trade_snapshot_embeddings - for finding similar trade states
-- Using cosine distance (best for normalized embeddings)
CREATE INDEX idx_trade_snapshot_embeddings_vector
ON trade_snapshot_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- trade_rationale_embeddings - for finding similar AI decisions
CREATE INDEX idx_rationale_embedding
ON trade_rationale_embeddings
USING hnsw (rationale_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- trade_postmortem_analysis - for finding similar outcomes/lessons
CREATE INDEX idx_postmortem_embedding
ON trade_postmortem_analysis
USING hnsw (postmortem_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 5. Run ANALYZE to optimize indexes
-- ============================================================================

ANALYZE trade_snapshot_embeddings;
ANALYZE trade_rationale_embeddings;
ANALYZE trade_postmortem_analysis;

-- ============================================================================
-- 6. Update match functions to use 4096 dimensions
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
    AND tre.rationale_embedding IS NOT NULL
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
    AND pm.postmortem_embedding IS NOT NULL
    AND 1 - (pm.postmortem_embedding <=> query_embedding) > match_threshold
  ORDER BY pm.postmortem_embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Update comments to reflect new embedding model
-- ============================================================================

COMMENT ON COLUMN trade_snapshot_embeddings.embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';
COMMENT ON COLUMN trade_rationale_embeddings.rationale_embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';
COMMENT ON COLUMN trade_postmortem_analysis.postmortem_embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';

-- ============================================================================
-- 8. Create helper function to rebuild indexes after bulk inserts
-- ============================================================================

CREATE OR REPLACE FUNCTION rebuild_embedding_indexes()
RETURNS void AS $$
BEGIN
  -- Reindex for optimal performance after bulk data inserts
  REINDEX INDEX idx_trade_snapshot_embeddings_vector;
  REINDEX INDEX idx_rationale_embedding;
  REINDEX INDEX idx_postmortem_embedding;

  -- Run ANALYZE to update statistics
  ANALYZE trade_snapshot_embeddings;
  ANALYZE trade_rationale_embeddings;
  ANALYZE trade_postmortem_analysis;

  RAISE NOTICE 'Embedding indexes rebuilt and analyzed';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rebuild_embedding_indexes IS 'Rebuild HNSW indexes and run ANALYZE after bulk embedding inserts';

-- ============================================================================
-- 9. Verification
-- ============================================================================

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

  RAISE NOTICE '=== Migration Complete ===';
  RAISE NOTICE 'Snapshot embeddings: % dimensions', snapshot_dim;
  RAISE NOTICE 'Rationale embeddings: % dimensions', rationale_dim;
  RAISE NOTICE 'Postmortem embeddings: % dimensions', postmortem_dim;
  RAISE NOTICE '';
  RAISE NOTICE 'All embeddings will now use Ollama qwen3-embedding (4096 dimensions)';
  RAISE NOTICE 'Old 1536-dim embeddings have been cleared and need regeneration';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: After adding new embeddings in bulk, run:';
  RAISE NOTICE '  SELECT rebuild_embedding_indexes();';

  IF snapshot_dim != 4096 OR rationale_dim != 4096 OR postmortem_dim != 4096 THEN
    RAISE EXCEPTION 'Vector dimensions not updated correctly!';
  END IF;
END $$;
