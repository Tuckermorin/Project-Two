-- Add allow_ai_overrides field to ips_configurations
-- This allows users to control whether AI-driven monitoring can override their IPS watch criteria

-- Add the column to watch_criteria JSONB field (as a flag)
-- Since watch_criteria is already a JSONB column, we don't need to alter the schema
-- The field will be added via application logic as: watch_criteria.allow_ai_overrides

-- Add a comment to document this feature
COMMENT ON COLUMN ips_configurations.watch_criteria IS
'Watch criteria configuration. Structure: { enabled: boolean, allow_ai_overrides: boolean, rules: WatchRule[] }.
When allow_ai_overrides is false, only user-defined watch rules trigger WATCH status.
When true (default for backward compatibility), AI monitoring can also trigger WATCH status based on P/L approaching targets (30%+).';

-- No actual schema changes needed since we're using JSONB flexibility
-- This migration serves as documentation of the feature
