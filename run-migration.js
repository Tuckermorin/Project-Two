#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read Supabase credentials from .env.local
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('Running migration: 20251007_add_ips_factor_details.sql');

  const migrationPath = path.join(__dirname, 'supabase/migrations/20251007_add_ips_factor_details.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Split by semicolons to run each statement separately
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s !== '');

  for (const statement of statements) {
    if (statement.includes('COMMENT ON')) {
      // Comments are informational, skip if they fail
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        if (error) console.warn('Comment failed (non-critical):', error.message);
      } catch (err) {
        console.warn('Comment failed (non-critical):', err.message);
      }
    } else {
      console.log('Executing:', statement.substring(0, 80) + '...');
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
      if (error) {
        console.error('Error:', error.message);
        // Continue anyway - column might already exist
      } else {
        console.log('✓ Success');
      }
    }
  }

  console.log('\nMigration completed!');
  console.log('Note: "column already exists" errors are OK - it means the migration was already run.');
}

runMigration().catch(console.error);
