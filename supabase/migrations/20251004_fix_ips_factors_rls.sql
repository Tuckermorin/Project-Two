-- Fix RLS policies for ips_factors table
-- The ips_factors table doesn't have a user_id column, so we need to check ownership via the ips_configurations foreign key

-- Drop incorrect RLS policies that reference non-existent user_id column
DROP POLICY IF EXISTS "Users can only see their own IPS factors" ON ips_factors;
DROP POLICY IF EXISTS "Users can only insert their own IPS factors" ON ips_factors;
DROP POLICY IF EXISTS "Users can only update their own IPS factors" ON ips_factors;
DROP POLICY IF EXISTS "Users can only delete their own IPS factors" ON ips_factors;

-- Create correct RLS policies using JOIN with ips_configurations
CREATE POLICY "Users can view factors for their IPS"
  ON ips_factors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ips_configurations
      WHERE ips_configurations.id = ips_factors.ips_id
      AND ips_configurations.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert factors for their IPS"
  ON ips_factors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ips_configurations
      WHERE ips_configurations.id = ips_factors.ips_id
      AND ips_configurations.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can update factors for their IPS"
  ON ips_factors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ips_configurations
      WHERE ips_configurations.id = ips_factors.ips_id
      AND ips_configurations.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete factors for their IPS"
  ON ips_factors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ips_configurations
      WHERE ips_configurations.id = ips_factors.ips_id
      AND ips_configurations.user_id::text = auth.uid()::text
    )
  );
