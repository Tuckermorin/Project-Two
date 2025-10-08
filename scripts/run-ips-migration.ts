#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('Running IPS Factor Details migration...\n');

  // Step 1: Add columns to trades table
  console.log('1. Adding columns to trades table...');

  const { error: tradesError } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE trades
      ADD COLUMN IF NOT EXISTS ips_factor_scores JSONB,
      ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('elite', 'quality', 'speculative', NULL)),
      ADD COLUMN IF NOT EXISTS diversity_score NUMERIC;
    `
  });

  if (tradesError && !tradesError.message.includes('already exists')) {
    console.error('Error adding trades columns:', tradesError);
  } else {
    console.log('✓ Trades table updated\n');
  }

  // Step 2: Add columns to trade_candidates table
  console.log('2. Adding columns to trade_candidates table...');

  const { error: candidatesError } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE trade_candidates
      ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('elite', 'quality', 'speculative', NULL)),
      ADD COLUMN IF NOT EXISTS diversity_score NUMERIC,
      ADD COLUMN IF NOT EXISTS ips_factor_scores JSONB;
    `
  });

  if (candidatesError && !candidatesError.message.includes('already exists')) {
    console.error('Error adding candidate columns:', candidatesError);
  } else {
    console.log('✓ Trade candidates table updated\n');
  }

  // Step 3: Create indexes
  console.log('3. Creating indexes...');

  const { error: indexError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE INDEX IF NOT EXISTS idx_trades_ips_tier
      ON trades(ips_score DESC, tier, created_at DESC)
      WHERE status IN ('prospective', 'active', 'closed');

      CREATE INDEX IF NOT EXISTS idx_candidates_tier_score
      ON trade_candidates(tier, run_id, (rationale->>'composite_score') DESC);
    `
  });

  if (indexError) {
    console.error('Error creating indexes:', indexError);
  } else {
    console.log('✓ Indexes created\n');
  }

  console.log('Migration completed successfully!');
  console.log('\nYou can now add trades to prospective with diversity_score, tier, and ips_factor_scores.');
}

runMigration().catch(console.error);
