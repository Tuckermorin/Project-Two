-- Add exit strategies and watch criteria to ips_configurations table
-- Migration: 20251001_add_exit_watch_criteria

-- Add exit_strategies column to store profit and loss exit rules
ALTER TABLE public.ips_configurations
ADD COLUMN IF NOT EXISTS exit_strategies JSONB DEFAULT '{
  "profit": {
    "enabled": true,
    "type": "percentage",
    "value": 50,
    "description": "Exit at 50% of max profit"
  },
  "loss": {
    "enabled": true,
    "type": "percentage",
    "value": 200,
    "description": "Exit at 200% of credit received"
  },
  "time": {
    "enabled": false,
    "daysBeforeExpiration": 0,
    "description": "Exit N days before expiration"
  }
}'::JSONB;

-- Add watch_criteria column to store monitoring rules
ALTER TABLE public.ips_configurations
ADD COLUMN IF NOT EXISTS watch_criteria JSONB DEFAULT '{
  "enabled": false,
  "rules": []
}'::JSONB;

-- Add comments for documentation
COMMENT ON COLUMN public.ips_configurations.exit_strategies IS
'Exit strategy configuration including profit target, stop loss, and time-based exits. Structure: {profit: {enabled, type, value}, loss: {enabled, type, value}, time: {enabled, daysBeforeExpiration}}';

COMMENT ON COLUMN public.ips_configurations.watch_criteria IS
'Watch criteria for monitoring trades. Structure: {enabled: boolean, rules: [{type: "price"|"percentage"|"factor", factorId?: string, operator: "gt"|"lt"|"gte"|"lte", value: number, description: string}]}';
