import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addColumns() {
  console.log('Adding exit_strategies and watch_criteria columns...');

  try {
    // Execute the SQL via RPC or direct query
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.ips_configurations
        ADD COLUMN IF NOT EXISTS exit_strategies JSONB DEFAULT NULL;

        ALTER TABLE public.ips_configurations
        ADD COLUMN IF NOT EXISTS watch_criteria JSONB DEFAULT NULL;
      `
    });

    if (error) {
      console.error('Error (trying alternative method):', error);

      // Alternative: Use the REST API directly with SQL
      console.log('\nTrying alternative method with SQL endpoint...');

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `
            ALTER TABLE public.ips_configurations
            ADD COLUMN IF NOT EXISTS exit_strategies JSONB DEFAULT NULL;

            ALTER TABLE public.ips_configurations
            ADD COLUMN IF NOT EXISTS watch_criteria JSONB DEFAULT NULL;
          `
        })
      });

      const result = await response.text();
      console.log('Response:', result);

      if (!response.ok) {
        throw new Error(`Failed: ${result}`);
      }
    } else {
      console.log('✅ Columns added successfully!');
      console.log('Result:', data);
    }
  } catch (err) {
    console.error('Error:', err);
    console.log('\n⚠️  Please run this SQL manually in Supabase SQL Editor:');
    console.log('URL: https://supabase.com/dashboard/project/azkckgzauwdgcahpqhxh/sql');
    console.log('\nSQL:');
    console.log(`
ALTER TABLE public.ips_configurations
ADD COLUMN IF NOT EXISTS exit_strategies JSONB DEFAULT NULL;

ALTER TABLE public.ips_configurations
ADD COLUMN IF NOT EXISTS watch_criteria JSONB DEFAULT NULL;
    `);
  }
}

addColumns();
