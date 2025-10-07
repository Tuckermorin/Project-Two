-- Migration: Add trade post-mortem analysis table
-- Purpose: Store deep analysis of closed trades with lessons learned for RAG

CREATE TABLE IF NOT EXISTS public.trade_postmortems (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL,
  post_mortem_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL DEFAULT auth.uid(),

  CONSTRAINT trade_postmortems_pkey PRIMARY KEY (id),
  CONSTRAINT trade_postmortems_trade_id_key UNIQUE (trade_id),
  CONSTRAINT trade_postmortems_trade_id_fkey FOREIGN KEY (trade_id)
    REFERENCES trades(id) ON DELETE CASCADE,
  CONSTRAINT trade_postmortems_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Index for quick lookups by trade_id
CREATE INDEX IF NOT EXISTS idx_trade_postmortems_trade_id
  ON public.trade_postmortems USING btree (trade_id);

-- Index for finding recent post-mortems
CREATE INDEX IF NOT EXISTS idx_trade_postmortems_created_at
  ON public.trade_postmortems USING btree (created_at DESC);

-- Index for user-scoped queries
CREATE INDEX IF NOT EXISTS trade_postmortems_user_id_idx
  ON public.trade_postmortems USING btree (user_id);

-- Index for querying by outcome (win/loss) via JSONB
CREATE INDEX IF NOT EXISTS idx_trade_postmortems_outcome
  ON public.trade_postmortems USING btree ((post_mortem_data->>'outcome'));

-- Index for querying by symbol via JSONB
CREATE INDEX IF NOT EXISTS idx_trade_postmortems_symbol
  ON public.trade_postmortems USING btree ((post_mortem_data->>'symbol'));

-- Add RLS policies
ALTER TABLE public.trade_postmortems ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own post-mortems
CREATE POLICY "Users can view own trade post-mortems"
  ON public.trade_postmortems
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own post-mortems
CREATE POLICY "Users can insert own trade post-mortems"
  ON public.trade_postmortems
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own post-mortems
CREATE POLICY "Users can update own trade post-mortems"
  ON public.trade_postmortems
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own post-mortems
CREATE POLICY "Users can delete own trade post-mortems"
  ON public.trade_postmortems
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to get post-mortem statistics
CREATE OR REPLACE FUNCTION get_postmortem_stats(p_user_id UUID)
RETURNS TABLE (
  total_postmortems INT,
  wins INT,
  losses INT,
  avg_days_held_wins NUMERIC,
  avg_days_held_losses NUMERIC,
  avg_roi_wins NUMERIC,
  avg_roi_losses NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT AS total_postmortems,
    COUNT(*) FILTER (WHERE (post_mortem_data->>'outcome') = 'win')::INT AS wins,
    COUNT(*) FILTER (WHERE (post_mortem_data->>'outcome') = 'loss')::INT AS losses,
    AVG((post_mortem_data->>'days_held')::NUMERIC) FILTER (WHERE (post_mortem_data->>'outcome') = 'win') AS avg_days_held_wins,
    AVG((post_mortem_data->>'days_held')::NUMERIC) FILTER (WHERE (post_mortem_data->>'outcome') = 'loss') AS avg_days_held_losses,
    AVG((post_mortem_data->>'realized_pnl_percent')::NUMERIC) FILTER (WHERE (post_mortem_data->>'outcome') = 'win') AS avg_roi_wins,
    AVG((post_mortem_data->>'realized_pnl_percent')::NUMERIC) FILTER (WHERE (post_mortem_data->>'outcome') = 'loss') AS avg_roi_losses
  FROM public.trade_postmortems
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
