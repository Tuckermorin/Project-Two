-- Migration: Add trade monitoring cache table
-- Purpose: Cache active trade monitoring results to reduce Tavily credit usage

CREATE TABLE IF NOT EXISTS public.trade_monitor_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL,
  monitor_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL DEFAULT auth.uid(),

  CONSTRAINT trade_monitor_cache_pkey PRIMARY KEY (id),
  CONSTRAINT trade_monitor_cache_trade_id_fkey FOREIGN KEY (trade_id)
    REFERENCES trades(id) ON DELETE CASCADE,
  CONSTRAINT trade_monitor_cache_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Index for quick lookups by trade_id
CREATE INDEX IF NOT EXISTS idx_trade_monitor_cache_trade_id
  ON public.trade_monitor_cache USING btree (trade_id);

-- Index for finding recent monitoring data
CREATE INDEX IF NOT EXISTS idx_trade_monitor_cache_created_at
  ON public.trade_monitor_cache USING btree (created_at DESC);

-- Index for user-scoped queries
CREATE INDEX IF NOT EXISTS trade_monitor_cache_user_id_idx
  ON public.trade_monitor_cache USING btree (user_id);

-- Add RLS policies
ALTER TABLE public.trade_monitor_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own monitoring data
CREATE POLICY "Users can view own trade monitoring data"
  ON public.trade_monitor_cache
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own monitoring data
CREATE POLICY "Users can insert own trade monitoring data"
  ON public.trade_monitor_cache
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own monitoring data
CREATE POLICY "Users can delete own trade monitoring data"
  ON public.trade_monitor_cache
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-cleanup: Delete monitoring data older than 7 days
-- This keeps the cache fresh and prevents unlimited growth
CREATE OR REPLACE FUNCTION cleanup_old_monitor_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM public.trade_monitor_cache
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Note: In production, schedule this function with pg_cron or external scheduler
-- Example cron job (if using pg_cron extension):
-- SELECT cron.schedule('cleanup-monitor-cache', '0 2 * * *', 'SELECT cleanup_old_monitor_cache()');
