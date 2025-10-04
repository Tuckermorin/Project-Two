-- Drop the conflicting RLS policy that checks user_id directly
DROP POLICY IF EXISTS "Users can manage their rows" ON ips_factors;

-- The correct policies (from previous migration) check ownership via ips_configurations
-- Those policies are:
-- - "Users can view factors for their IPS"
-- - "Users can insert factors for their IPS"
-- - "Users can update factors for their IPS"
-- - "Users can delete factors for their IPS"

-- These policies work by checking if the user owns the parent IPS configuration
