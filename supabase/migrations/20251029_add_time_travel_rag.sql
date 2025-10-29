-- Migration: Add Time-Travel RAG Support for Backtesting
-- Date: 2025-10-29
-- Purpose: Allow querying historical trades with date filters for realistic backtesting

-- Function: match_trades_before_date
-- Similar to match_trades but only returns trades closed before a specific date
CREATE OR REPLACE FUNCTION match_trades_before_date(
  query_embedding vector(1536),
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
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_trades_before_date IS 'Find similar trades that were closed before a specific date - used for time-travel backtesting';

-- Function: get_historical_performance_before_date
-- Get symbol performance metrics for trades closed before a specific date
CREATE OR REPLACE FUNCTION get_historical_performance_before_date(
  p_symbol text,
  p_before_date timestamp with time zone,
  p_user_id uuid
)
RETURNS TABLE (
  total_trades bigint,
  winning_trades bigint,
  losing_trades bigint,
  win_rate numeric,
  avg_roi numeric,
  avg_dte numeric,
  strategy_breakdown jsonb,
  recent_trades jsonb
)
LANGUAGE sql STABLE
AS $$
  WITH closed_trades AS (
    SELECT
      t.id,
      t.symbol,
      t.strategy_type,
      t.realized_pl_percent,
      t.realized_pnl,
      t.created_at,
      t.closed_at,
      EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 86400 AS days_held
    FROM trades t
    WHERE
      t.symbol = p_symbol
      AND t.user_id = p_user_id
      AND t.status = 'closed'
      AND t.closed_at < p_before_date
      AND t.realized_pl_percent IS NOT NULL
  ),
  stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE realized_pnl > 0) AS wins,
      COUNT(*) FILTER (WHERE realized_pnl <= 0) AS losses,
      AVG(realized_pl_percent) AS avg_roi,
      AVG(days_held) AS avg_dte
    FROM closed_trades
  ),
  strategy_stats AS (
    SELECT
      jsonb_object_agg(
        strategy_type,
        jsonb_build_object(
          'count', count,
          'win_rate', win_rate,
          'avg_roi', avg_roi
        )
      ) AS breakdown
    FROM (
      SELECT
        strategy_type,
        COUNT(*) AS count,
        (COUNT(*) FILTER (WHERE realized_pnl > 0)::numeric / COUNT(*)::numeric * 100) AS win_rate,
        AVG(realized_pl_percent) AS avg_roi
      FROM closed_trades
      GROUP BY strategy_type
    ) sub
  ),
  recent AS (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'strategy_type', strategy_type,
          'realized_pl_percent', realized_pl_percent,
          'realized_pnl', realized_pnl,
          'created_at', created_at,
          'closed_at', closed_at
        )
        ORDER BY closed_at DESC
      ) AS trades
    FROM (
      SELECT * FROM closed_trades ORDER BY closed_at DESC LIMIT 10
    ) sub
  )
  SELECT
    stats.total,
    stats.wins,
    stats.losses,
    CASE
      WHEN stats.total > 0 THEN (stats.wins::numeric / stats.total::numeric * 100)
      ELSE 0
    END AS win_rate,
    COALESCE(stats.avg_roi, 0) AS avg_roi,
    COALESCE(stats.avg_dte, 0) AS avg_dte,
    COALESCE(strategy_stats.breakdown, '{}'::jsonb) AS strategy_breakdown,
    COALESCE(recent.trades, '[]'::jsonb) AS recent_trades
  FROM stats, strategy_stats, recent;
$$;

COMMENT ON FUNCTION get_historical_performance_before_date IS 'Get historical performance metrics for a symbol as of a specific date';

-- Index on metadata exit_date for faster time-travel queries
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_exit_date
ON trade_embeddings ((metadata->>'exit_date'));

CREATE INDEX IF NOT EXISTS idx_trade_embeddings_symbol
ON trade_embeddings ((metadata->>'symbol'));

-- Add index on trades.closed_at for faster historical queries
CREATE INDEX IF NOT EXISTS idx_trades_closed_at
ON trades (user_id, symbol, closed_at)
WHERE status = 'closed';
