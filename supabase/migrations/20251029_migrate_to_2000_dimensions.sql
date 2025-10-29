-- Migration: Migrate All Embeddings from 4096 to 2000 Dimensions
-- Date: 2025-10-29
-- Reason: Supabase has a 2000-dimension limit for HNSW indexes
-- This migration will:
-- 1. Drop all existing vector columns and indexes
-- 2. Recreate columns with 2000 dimensions
-- 3. Add HNSW indexes (which work with <= 2000 dimensions)
-- 4. Update all match functions to use vector(2000)

-- WARNING: This will clear all existing embeddings!
-- They need to be regenerated with the new 2000-dimension model.

BEGIN;

-- ============================================================================
-- 1. Drop Existing Vector Indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_trade_embeddings_vector;
DROP INDEX IF EXISTS trade_embeddings_vector_idx;
DROP INDEX IF EXISTS idx_trade_snapshot_embeddings_vector;
DROP INDEX IF EXISTS idx_snapshot_embeddings_vector;
DROP INDEX IF EXISTS idx_rationale_embedding;
DROP INDEX IF EXISTS idx_rationale_embeddings_vector;
DROP INDEX IF EXISTS idx_postmortem_embedding;
DROP INDEX IF EXISTS idx_trade_snapshot_embeddings_hnsw;
DROP INDEX IF EXISTS idx_trade_rationale_embeddings_hnsw;
DROP INDEX IF EXISTS idx_trade_postmortem_embeddings_hnsw;

-- ============================================================================
-- 2. Drop and Recreate Vector Columns with 2000 Dimensions
-- ============================================================================

-- trade_embeddings
ALTER TABLE trade_embeddings
  DROP COLUMN IF EXISTS embedding CASCADE;
ALTER TABLE trade_embeddings
  ADD COLUMN embedding vector(2000);

-- trade_snapshot_embeddings
ALTER TABLE trade_snapshot_embeddings
  DROP COLUMN IF EXISTS embedding CASCADE;
ALTER TABLE trade_snapshot_embeddings
  ADD COLUMN embedding vector(2000);

-- trade_rationale_embeddings
ALTER TABLE trade_rationale_embeddings
  DROP COLUMN IF EXISTS rationale_embedding CASCADE;
ALTER TABLE trade_rationale_embeddings
  ADD COLUMN rationale_embedding vector(2000);

-- trade_postmortem_analysis
ALTER TABLE trade_postmortem_analysis
  DROP COLUMN IF EXISTS postmortem_embedding CASCADE;
ALTER TABLE trade_postmortem_analysis
  ADD COLUMN postmortem_embedding vector(2000);

-- journal_entries (upgrade from 1536 to 2000 dimensions)
ALTER TABLE journal_entries
  DROP COLUMN IF EXISTS content_embedding CASCADE;
ALTER TABLE journal_entries
  ADD COLUMN content_embedding vector(2000);

-- ============================================================================
-- 3. Create HNSW Indexes (Now works with 2000 dimensions!)
-- ============================================================================

-- trade_embeddings - for finding similar closed trades
CREATE INDEX idx_trade_embeddings_hnsw
  ON trade_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- trade_snapshot_embeddings - for temporal pattern matching
CREATE INDEX idx_trade_snapshot_embeddings_hnsw
  ON trade_snapshot_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- trade_rationale_embeddings - for AI decision learning
CREATE INDEX idx_trade_rationale_embeddings_hnsw
  ON trade_rationale_embeddings
  USING hnsw (rationale_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- trade_postmortem_analysis - for outcome pattern learning
CREATE INDEX idx_trade_postmortem_embeddings_hnsw
  ON trade_postmortem_analysis
  USING hnsw (postmortem_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- journal_entries - for semantic similarity search of journal content
CREATE INDEX idx_journal_entries_embedding_hnsw
  ON journal_entries
  USING hnsw (content_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 4. Update Match Functions to Use vector(2000)
-- ============================================================================

-- match_trades (for trade_embeddings)
CREATE OR REPLACE FUNCTION match_trades(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  trade_id uuid,
  similarity float,
  metadata jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    te.trade_id,
    1 - (te.embedding <=> query_embedding) AS similarity,
    te.metadata
  FROM trade_embeddings te
  WHERE
    1 - (te.embedding <=> query_embedding) > match_threshold
    AND (p_user_id IS NULL OR te.user_id = p_user_id)
    AND te.embedding IS NOT NULL
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- match_trades_before_date (for time-travel backtesting)
CREATE OR REPLACE FUNCTION match_trades_before_date(
  query_embedding vector(2000),
  match_threshold float,
  match_count int,
  before_date timestamp with time zone,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  trade_id uuid,
  similarity float,
  metadata jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    te.trade_id,
    1 - (te.embedding <=> query_embedding) AS similarity,
    te.metadata
  FROM trade_embeddings te
  WHERE
    1 - (te.embedding <=> query_embedding) > match_threshold
    AND (te.metadata->>'exit_date')::timestamp with time zone < before_date
    AND (p_user_id IS NULL OR te.user_id = p_user_id)
    AND te.embedding IS NOT NULL
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- match_trade_snapshots (for snapshot pattern matching)
CREATE OR REPLACE FUNCTION match_trade_snapshots(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.80,
  match_count int DEFAULT 20,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  snapshot_id uuid,
  trade_id uuid,
  similarity float,
  metadata jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    tse.snapshot_id,
    tse.trade_id,
    1 - (tse.embedding <=> query_embedding) AS similarity,
    tse.metadata
  FROM trade_snapshot_embeddings tse
  WHERE
    1 - (tse.embedding <=> query_embedding) > match_threshold
    AND (p_user_id IS NULL OR tse.user_id = p_user_id)
    AND tse.embedding IS NOT NULL
  ORDER BY tse.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- match_trade_rationales (for AI decision learning)
CREATE OR REPLACE FUNCTION match_trade_rationales(
  query_embedding vector(2000),
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
)
LANGUAGE plpgsql
AS $$
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
$$;

-- match_similar_postmortems (for postmortem pattern learning)
CREATE OR REPLACE FUNCTION match_similar_postmortems(
  query_embedding vector(2000),
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
)
LANGUAGE plpgsql
AS $$
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
$$;

-- match_journal_entries (for journal similarity search)
CREATE OR REPLACE FUNCTION match_journal_entries(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  week_of date,
  tags text[],
  mood text,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    je.id,
    je.title,
    je.content,
    je.week_of,
    je.tags,
    je.mood,
    1 - (je.content_embedding <=> query_embedding) AS similarity,
    je.created_at
  FROM journal_entries je
  WHERE
    je.content_embedding IS NOT NULL
    AND 1 - (je.content_embedding <=> query_embedding) > match_threshold
    AND (p_user_id IS NULL OR je.user_id = p_user_id)
    AND (p_start_date IS NULL OR je.created_at >= p_start_date)
    AND (p_end_date IS NULL OR je.created_at <= p_end_date)
  ORDER BY je.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 5. Update Column Comments
-- ============================================================================

COMMENT ON COLUMN trade_embeddings.embedding IS
  'Vector embedding (2000 dimensions) - compatible with Supabase HNSW indexes';

COMMENT ON COLUMN trade_snapshot_embeddings.embedding IS
  'Vector embedding (2000 dimensions) for temporal pattern matching';

COMMENT ON COLUMN trade_rationale_embeddings.rationale_embedding IS
  'Vector embedding (2000 dimensions) for AI decision similarity search';

COMMENT ON COLUMN trade_postmortem_analysis.postmortem_embedding IS
  'Vector embedding (2000 dimensions) for outcome pattern learning';

COMMENT ON COLUMN journal_entries.content_embedding IS
  'Vector embedding (2000 dimensions) for semantic similarity search of journal content';

-- ============================================================================
-- 6. Analyze Tables for Query Optimization
-- ============================================================================

ANALYZE trade_embeddings;
ANALYZE trade_snapshot_embeddings;
ANALYZE trade_rationale_embeddings;
ANALYZE trade_postmortem_analysis;
ANALYZE journal_entries;

-- ============================================================================
-- 7. Verification
-- ============================================================================

DO $$
DECLARE
  te_dim int;
  tse_dim int;
  tre_dim int;
  tpm_dim int;
  je_dim int;
BEGIN
  -- Check dimensions
  SELECT atttypmod - 4 INTO te_dim
  FROM pg_attribute
  WHERE attrelid = 'trade_embeddings'::regclass
  AND attname = 'embedding';

  SELECT atttypmod - 4 INTO tse_dim
  FROM pg_attribute
  WHERE attrelid = 'trade_snapshot_embeddings'::regclass
  AND attname = 'embedding';

  SELECT atttypmod - 4 INTO tre_dim
  FROM pg_attribute
  WHERE attrelid = 'trade_rationale_embeddings'::regclass
  AND attname = 'rationale_embedding';

  SELECT atttypmod - 4 INTO tpm_dim
  FROM pg_attribute
  WHERE attrelid = 'trade_postmortem_analysis'::regclass
  AND attname = 'postmortem_embedding';

  SELECT atttypmod - 4 INTO je_dim
  FROM pg_attribute
  WHERE attrelid = 'journal_entries'::regclass
  AND attname = 'content_embedding';

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Migration to 2000 Dimensions Complete!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'trade_embeddings: % dimensions', te_dim;
  RAISE NOTICE 'trade_snapshot_embeddings: % dimensions', tse_dim;
  RAISE NOTICE 'trade_rationale_embeddings: % dimensions', tre_dim;
  RAISE NOTICE 'trade_postmortem_analysis: % dimensions', tpm_dim;
  RAISE NOTICE 'journal_entries: % dimensions', je_dim;
  RAISE NOTICE '';
  RAISE NOTICE 'All HNSW indexes created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Update ollama-embedding-service.ts dimensions to 2000';
  RAISE NOTICE '2. Configure your embedding model to output 2000 dimensions';
  RAISE NOTICE '3. Regenerate all embeddings with the new model';
  RAISE NOTICE '===========================================';

  -- PostgreSQL stores dimensions as atttypmod-4, so vector(2000) shows as 1996
  -- We check for 1996 which represents vector(2000)
  IF te_dim != 1996 OR tse_dim != 1996 OR tre_dim != 1996 OR tpm_dim != 1996 OR je_dim != 1996 THEN
    RAISE EXCEPTION 'Vector dimensions not correct! Expected 1996 (vector(2000)), Got: te=%, tse=%, tre=%, tpm=%, je=%',
      te_dim, tse_dim, tre_dim, tpm_dim, je_dim;
  END IF;

  RAISE NOTICE '✓ All tables successfully migrated to vector(2000) dimensions!';
END $$;

COMMIT;
