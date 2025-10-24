-- Add AI weight column to ips_configurations
-- This determines how much weight AI analysis has in the composite IPS score

ALTER TABLE ips_configurations
ADD COLUMN IF NOT EXISTS ai_weight numeric DEFAULT 20 CHECK (ai_weight >= 0 AND ai_weight <= 100);

COMMENT ON COLUMN ips_configurations.ai_weight IS 'Weight (0-100) given to AI analysis in composite IPS score calculation. Default is 20 (20%)';
