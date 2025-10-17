-- Add DTE (Days to Expiration) configuration to ips_configurations table
-- This converts DTE from a scoring factor to a hard filter/requirement

-- Add min_dte and max_dte columns as required fields (no defaults)
-- Existing records will get temporary defaults, but new IPSs must specify DTE explicitly
ALTER TABLE ips_configurations
ADD COLUMN min_dte INTEGER,
ADD COLUMN max_dte INTEGER;

-- Add check constraints to ensure valid DTE ranges
ALTER TABLE ips_configurations
ADD CONSTRAINT ips_configurations_min_dte_positive CHECK (min_dte >= 1),
ADD CONSTRAINT ips_configurations_max_dte_valid CHECK (max_dte >= min_dte);

-- Add comment to explain the columns
COMMENT ON COLUMN ips_configurations.min_dte IS 'Minimum days to expiration for options contracts (hard filter, required)';
COMMENT ON COLUMN ips_configurations.max_dte IS 'Maximum days to expiration for options contracts (hard filter, required)';

-- Update any existing records to have a reasonable default range
-- This is ONLY for existing IPSs - new ones must specify DTE explicitly
UPDATE ips_configurations
SET min_dte = 7, max_dte = 45
WHERE min_dte IS NULL OR max_dte IS NULL;

-- Now make the columns NOT NULL after backfilling existing data
ALTER TABLE ips_configurations
ALTER COLUMN min_dte SET NOT NULL,
ALTER COLUMN max_dte SET NOT NULL;
