-- Add Greek values and sector information to trades table
-- These fields are useful for analyzing option trade characteristics

ALTER TABLE public.trades
ADD COLUMN IF NOT EXISTS delta_short_leg numeric,
ADD COLUMN IF NOT EXISTS theta numeric,
ADD COLUMN IF NOT EXISTS vega numeric,
ADD COLUMN IF NOT EXISTS iv_at_entry numeric,
ADD COLUMN IF NOT EXISTS sector text;

-- Add comment for documentation
COMMENT ON COLUMN public.trades.delta_short_leg IS 'Delta value of the short leg at trade entry';
COMMENT ON COLUMN public.trades.theta IS 'Theta (time decay) at trade entry';
COMMENT ON COLUMN public.trades.vega IS 'Vega (volatility sensitivity) at trade entry';
COMMENT ON COLUMN public.trades.iv_at_entry IS 'Implied volatility percentage at trade entry';
COMMENT ON COLUMN public.trades.sector IS 'Market sector of the underlying security';
