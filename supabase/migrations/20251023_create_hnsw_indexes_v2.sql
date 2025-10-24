-- Create HNSW indexes for 4096-dimension vectors
-- This requires pgvector >= 0.7.0
-- According to Supabase support, version 0.8.0 should support 4096-dim HNSW indexes

-- First, verify pgvector version
DO $$
DECLARE
  pgvector_version text;
BEGIN
  SELECT extversion INTO pgvector_version
  FROM pg_extension
  WHERE extname = 'vector';

  RAISE NOTICE 'pgvector version: %', pgvector_version;

  IF pgvector_version IS NULL THEN
    RAISE EXCEPTION 'pgvector extension not found!';
  END IF;

  -- Extract major.minor version
  IF split_part(pgvector_version, '.', 1)::int >= 1 OR
     (split_part(pgvector_version, '.', 1)::int = 0 AND
      split_part(pgvector_version, '.', 2)::int >= 7) THEN
    RAISE NOTICE '✓ pgvector version supports HNSW indexes for high dimensions';
  ELSE
    RAISE WARNING '✗ pgvector version may not support 4096-dim HNSW indexes';
  END IF;
END $$;

-- Drop any existing vector indexes that might conflict
DROP INDEX IF EXISTS idx_trade_snapshot_embeddings_vector;
DROP INDEX IF EXISTS idx_trade_rationale_embeddings_vector;
DROP INDEX IF EXISTS idx_trade_postmortem_embeddings_vector;

RAISE NOTICE 'Creating HNSW index on trade_snapshot_embeddings...';

-- Create HNSW index for trade_snapshot_embeddings
-- m=16: connections per layer (good balance)
-- ef_construction=64: build quality (higher = better quality but slower build)
CREATE INDEX idx_trade_snapshot_embeddings_hnsw
ON trade_snapshot_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

RAISE NOTICE '✓ Created HNSW index on trade_snapshot_embeddings';
RAISE NOTICE 'Creating HNSW index on trade_rationale_embeddings...';

-- Create HNSW index for trade_rationale_embeddings
CREATE INDEX idx_trade_rationale_embeddings_hnsw
ON trade_rationale_embeddings
USING hnsw (rationale_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

RAISE NOTICE '✓ Created HNSW index on trade_rationale_embeddings';
RAISE NOTICE 'Creating HNSW index on trade_postmortem_analysis...';

-- Create HNSW index for trade_postmortem_analysis
CREATE INDEX idx_trade_postmortem_embeddings_hnsw
ON trade_postmortem_analysis
USING hnsw (postmortem_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

RAISE NOTICE '✓ Created HNSW index on trade_postmortem_analysis';

-- Analyze tables to update statistics
ANALYZE trade_snapshot_embeddings;
ANALYZE trade_rationale_embeddings;
ANALYZE trade_postmortem_analysis;

-- Verify indexes were created
DO $$
DECLARE
  idx_count int;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE indexname LIKE '%hnsw%'
    AND tablename IN ('trade_snapshot_embeddings', 'trade_rationale_embeddings', 'trade_postmortem_analysis');

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'HNSW Index Creation Complete!';
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Created % HNSW indexes for 4096-dim vectors', idx_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Index parameters:';
  RAISE NOTICE '  - Algorithm: HNSW';
  RAISE NOTICE '  - Distance metric: Cosine (vector_cosine_ops)';
  RAISE NOTICE '  - m = 16 (connections per layer)';
  RAISE NOTICE '  - ef_construction = 64 (build quality)';
  RAISE NOTICE '';
  RAISE NOTICE 'Query performance tips:';
  RAISE NOTICE '  1. Use ORDER BY embedding <=> $query for cosine distance';
  RAISE NOTICE '  2. Add LIMIT to queries for best performance';
  RAISE NOTICE '  3. Use WHERE clauses to reduce candidate set';
  RAISE NOTICE '  4. For better recall, adjust ef_search at runtime:';
  RAISE NOTICE '     SET hnsw.ef_search = 100; (default is 40)';
  RAISE NOTICE '=========================================';
END $$;

-- Show index details
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE '%hnsw%'
  AND tablename IN ('trade_snapshot_embeddings', 'trade_rationale_embeddings', 'trade_postmortem_analysis')
ORDER BY tablename, indexname;
