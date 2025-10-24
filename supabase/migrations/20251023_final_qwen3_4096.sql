-- Migration: Final approach - Drop and recreate vector columns for 4096 dimensions
-- This is necessary because ALTER COLUMN on existing indexed vectors has limitations

-- ============================================================================
-- 1. Backup: Create temp tables with existing data (if any)
-- ============================================================================

-- Note: We're going to drop and recreate, so this backup step is precautionary
-- If you have important embeddings, export them first!

-- ============================================================================
-- 2. Drop existing vector columns and recreate with 4096 dimensions
-- ============================================================================

-- trade_snapshot_embeddings
ALTER TABLE trade_snapshot_embeddings DROP COLUMN IF EXISTS embedding CASCADE;
ALTER TABLE trade_snapshot_embeddings ADD COLUMN embedding vector(4096);

-- trade_rationale_embeddings
ALTER TABLE trade_rationale_embeddings DROP COLUMN IF EXISTS rationale_embedding CASCADE;
ALTER TABLE trade_rationale_embeddings ADD COLUMN rationale_embedding vector(4096);

-- trade_postmortem_analysis
ALTER TABLE trade_postmortem_analysis DROP COLUMN IF EXISTS postmortem_embedding CASCADE;
ALTER TABLE trade_postmortem_analysis ADD COLUMN postmortem_embedding vector(4096);

-- ============================================================================
-- 3. Create HNSW indexes for 4096-dimensional vectors
-- ============================================================================

-- trade_snapshot_embeddings
CREATE INDEX idx_trade_snapshot_embeddings_vector
ON trade_snapshot_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- trade_rationale_embeddings
CREATE INDEX idx_rationale_embedding
ON trade_rationale_embeddings
USING hnsw (rationale_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- trade_postmortem_analysis
CREATE INDEX idx_postmortem_embedding
ON trade_postmortem_analysis
USING hnsw (postmortem_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 4. Run ANALYZE
-- ============================================================================

ANALYZE trade_snapshot_embeddings;
ANALYZE trade_rationale_embeddings;
ANALYZE trade_postmortem_analysis;

-- ============================================================================
-- 5. Update match functions to use 4096 dimensions
-- ============================================================================

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
-- 6. Update comments
-- ============================================================================

COMMENT ON COLUMN trade_snapshot_embeddings.embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';
COMMENT ON COLUMN trade_rationale_embeddings.rationale_embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';
COMMENT ON COLUMN trade_postmortem_analysis.postmortem_embedding IS 'Vector embedding using Ollama qwen3-embedding (4096 dimensions)';

-- ============================================================================
-- 7. Helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION rebuild_embedding_indexes()
RETURNS void AS $$
BEGIN
  REINDEX INDEX idx_trade_snapshot_embeddings_vector;
  REINDEX INDEX idx_rationale_embedding;
  REINDEX INDEX idx_postmortem_embedding;

  ANALYZE trade_snapshot_embeddings;
  ANALYZE trade_rationale_embeddings;
  ANALYZE trade_postmortem_analysis;

  RAISE NOTICE 'Embedding indexes rebuilt and analyzed';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rebuild_embedding_indexes IS 'Rebuild HNSW indexes after bulk embedding inserts';

-- ============================================================================
-- 8. Verification
-- ============================================================================

DO $$
DECLARE
  snapshot_dim int;
  rationale_dim int;
  postmortem_dim int;
BEGIN
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

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Migration to qwen3-embedding Complete!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Snapshot embeddings: % dimensions', snapshot_dim;
  RAISE NOTICE 'Rationale embeddings: % dimensions', rationale_dim;
  RAISE NOTICE 'Postmortem embeddings: % dimensions', postmortem_dim;
  RAISE NOTICE '';
  RAISE NOTICE 'All embeddings now use Ollama qwen3-embedding';
  RAISE NOTICE 'Indexes: HNSW (m=16, ef_construction=64)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run the agent to generate new embeddings';
  RAISE NOTICE '2. After bulk inserts, run: SELECT rebuild_embedding_indexes();';
  RAISE NOTICE '===========================================';

  IF snapshot_dim != 4096 OR rationale_dim != 4096 OR postmortem_dim != 4096 THEN
    RAISE EXCEPTION 'Vector dimensions not 4096! Got: snapshot=%, rationale=%, postmortem=%',
      snapshot_dim, rationale_dim, postmortem_dim;
  END IF;
END $$;
