-- Migration: Create trade snapshot embeddings table
-- Purpose: Store vector embeddings of trade snapshots for temporal pattern matching

CREATE TABLE IF NOT EXISTS public.trade_snapshot_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL,
  trade_id UUID NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT trade_snapshot_embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT trade_snapshot_embeddings_snapshot_id_key UNIQUE (snapshot_id),
  CONSTRAINT trade_snapshot_embeddings_snapshot_id_fkey FOREIGN KEY (snapshot_id)
    REFERENCES trade_snapshots(id) ON DELETE CASCADE,
  CONSTRAINT trade_snapshot_embeddings_trade_id_fkey FOREIGN KEY (trade_id)
    REFERENCES trades(id) ON DELETE CASCADE,
  CONSTRAINT trade_snapshot_embeddings_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snapshot_embeddings_snapshot_id
  ON public.trade_snapshot_embeddings USING btree (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_embeddings_trade_id
  ON public.trade_snapshot_embeddings USING btree (trade_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_embeddings_user_id
  ON public.trade_snapshot_embeddings USING btree (user_id);

-- Vector similarity search index (HNSW for fast approximate search)
CREATE INDEX IF NOT EXISTS idx_snapshot_embeddings_vector
  ON public.trade_snapshot_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE public.trade_snapshot_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own snapshot embeddings"
  ON public.trade_snapshot_embeddings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshot embeddings"
  ON public.trade_snapshot_embeddings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshot embeddings"
  ON public.trade_snapshot_embeddings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to match similar trade snapshots
CREATE OR REPLACE FUNCTION match_trade_snapshots(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  snapshot_id UUID,
  trade_id UUID,
  similarity float,
  metadata JSONB
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    trade_snapshot_embeddings.snapshot_id,
    trade_snapshot_embeddings.trade_id,
    1 - (trade_snapshot_embeddings.embedding <=> query_embedding) AS similarity,
    trade_snapshot_embeddings.metadata
  FROM trade_snapshot_embeddings
  WHERE 1 - (trade_snapshot_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY trade_snapshot_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to analyze pattern outcomes
-- Example: "When delta > 0.40, what percentage hit max loss?"
CREATE OR REPLACE FUNCTION analyze_snapshot_pattern(
  p_user_id UUID,
  p_delta_min NUMERIC DEFAULT NULL,
  p_delta_max NUMERIC DEFAULT NULL,
  p_pnl_min NUMERIC DEFAULT NULL,
  p_pnl_max NUMERIC DEFAULT NULL,
  p_iv_rank_min NUMERIC DEFAULT NULL,
  p_iv_rank_max NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  total_snapshots BIGINT,
  snapshots_with_outcomes BIGINT,
  wins BIGINT,
  losses BIGINT,
  win_rate NUMERIC,
  avg_final_pnl_percent NUMERIC,
  avg_days_in_trade NUMERIC,
  avg_days_to_expiration NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH filtered_snapshots AS (
    SELECT
      tse.metadata,
      (tse.metadata->>'outcome')::TEXT as outcome,
      (tse.metadata->>'final_pnl_percent')::NUMERIC as final_pnl,
      (tse.metadata->>'days_in_trade')::INT as days_in_trade,
      (tse.metadata->>'days_to_expiration')::INT as dte,
      (tse.metadata->>'delta_spread')::NUMERIC as delta,
      (tse.metadata->>'unrealized_pnl_percent')::NUMERIC as pnl_pct,
      (tse.metadata->>'iv_rank')::NUMERIC as iv_rank
    FROM trade_snapshot_embeddings tse
    WHERE tse.user_id = p_user_id
      AND (p_delta_min IS NULL OR (tse.metadata->>'delta_spread')::NUMERIC >= p_delta_min)
      AND (p_delta_max IS NULL OR (tse.metadata->>'delta_spread')::NUMERIC <= p_delta_max)
      AND (p_pnl_min IS NULL OR (tse.metadata->>'unrealized_pnl_percent')::NUMERIC >= p_pnl_min)
      AND (p_pnl_max IS NULL OR (tse.metadata->>'unrealized_pnl_percent')::NUMERIC <= p_pnl_max)
      AND (p_iv_rank_min IS NULL OR (tse.metadata->>'iv_rank')::NUMERIC >= p_iv_rank_min)
      AND (p_iv_rank_max IS NULL OR (tse.metadata->>'iv_rank')::NUMERIC <= p_iv_rank_max)
  )
  SELECT
    COUNT(*)::BIGINT as total_snapshots,
    COUNT(*) FILTER (WHERE outcome IS NOT NULL)::BIGINT as snapshots_with_outcomes,
    COUNT(*) FILTER (WHERE outcome = 'win')::BIGINT as wins,
    COUNT(*) FILTER (WHERE outcome = 'loss')::BIGINT as losses,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE outcome = 'win') /
      NULLIF(COUNT(*) FILTER (WHERE outcome IS NOT NULL), 0),
      2
    ) as win_rate,
    ROUND(AVG(final_pnl) FILTER (WHERE outcome IS NOT NULL), 2) as avg_final_pnl_percent,
    ROUND(AVG(days_in_trade::NUMERIC), 1) as avg_days_in_trade,
    ROUND(AVG(dte::NUMERIC), 1) as avg_days_to_expiration
  FROM filtered_snapshots;
END;
$$;

COMMENT ON TABLE public.trade_snapshot_embeddings IS 'Vector embeddings of trade snapshots for temporal pattern matching and learning';
COMMENT ON COLUMN public.trade_snapshot_embeddings.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN public.trade_snapshot_embeddings.metadata IS 'Snapshot metadata including delta, P&L, outcome (for closed trades), etc.';
COMMENT ON FUNCTION match_trade_snapshots IS 'Find similar snapshot patterns using vector similarity search';
COMMENT ON FUNCTION analyze_snapshot_pattern IS 'Analyze outcomes for snapshots matching specific criteria (e.g., delta > 0.40)';
