import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'present' : 'missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'present' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addColumns() {
  console.log('Adding exit_strategies and watch_criteria columns to ips_configurations...');

  // Note: Supabase doesn't support DDL via the client, so we'll use the SQL editor
  // This script provides the SQL commands to run manually

  const sql = `
-- Add exit_strategies column
ALTER TABLE public.ips_configurations
ADD COLUMN IF NOT EXISTS exit_strategies JSONB DEFAULT NULL;

-- Add watch_criteria column
ALTER TABLE public.ips_configurations
ADD COLUMN IF NOT EXISTS watch_criteria JSONB DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.ips_configurations.exit_strategies IS 'Exit strategy rules for trades (profit targets, loss limits, etc.)';
COMMENT ON COLUMN public.ips_configurations.watch_criteria IS 'Watch criteria rules for monitoring positions';
`;

  console.log('\n=== SQL to execute in Supabase SQL Editor ===\n');
  console.log(sql);
  console.log('\n=== End of SQL ===\n');

  console.log('Please run the above SQL in your Supabase SQL Editor.');
  console.log('URL: https://supabase.com/dashboard/project/azkckgzauwdgcahpqhxh/sql');
}

addColumns().catch(console.error);
