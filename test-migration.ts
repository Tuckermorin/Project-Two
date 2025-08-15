// ============================================
// test-migration.ts
// Run this file to test if the migration worked
// Usage: npx tsx test-migration.ts
// ============================================

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg: string) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg: string) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warning: (msg: string) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  section: (msg: string) => console.log(`\n${colors.cyan}${'='.repeat(50)}\n${msg}\n${'='.repeat(50)}${colors.reset}`)
};

// Test data
const testIPSData = {
  name: `Test IPS - ${new Date().toISOString()}`,
  description: 'Automated test IPS for migration verification',
  factors: [
    { 
      factor_id: 'av-pe-ratio', 
      factor_name: 'P/E Ratio',
      weight: 7, 
      target_value: 25,
      target_operator: 'lte',
      preference_direction: 'lower',
      enabled: true
    },
    { 
      factor_id: 'opt-delta', 
      factor_name: 'Delta',
      weight: 9, 
      target_value: 0.30,
      target_operator: 'lte',
      preference_direction: 'lower',
      enabled: true
    }
  ]
};

let createdIPSId: string | null = null;
let createdTradeId: string | null = null;

async function runTests() {
  log.section('MIGRATION TEST SUITE');
  
  // Test 1: Check database connection
  log.section('Test 1: Database Connection');
  try {
    const { error } = await supabase.from('ips_configurations').select('count').single();
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows, which is fine
      throw error;
    }
    log.success('Database connection successful');
  } catch (error: any) {
    log.error(`Database connection failed: ${error.message}`);
    return;
  }

  // Test 2: Check all required tables exist
  log.section('Test 2: Table Structure');
  const requiredTables = [
    'ips_configurations',
    'ips_factors',
    'factor_definitions',
    'trades',
    'trade_evaluations'
  ];

  for (const table of requiredTables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      log.success(`Table '${table}' exists and is accessible`);
    } catch (error: any) {
      log.error(`Table '${table}' not found or not accessible: ${error.message}`);
      log.warning('Please run the SQL schema creation script first');
      return;
    }
  }

  // Test 3: Check old tables are gone (optional - just warnings)
  log.section('Test 3: Old Tables Removed');
  const oldTables = [
    'investment_performance_systems',
    'ips_with_factors',
    'trade_factors',
    'ips_score_calculations'
  ];

  for (const table of oldTables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (!error || error.code === 'PGRST116') {
        log.warning(`Old table '${table}' still exists - consider removing it`);
      } else {
        log.success(`Old table '${table}' has been removed`);
      }
    } catch {
      log.success(`Old table '${table}' has been removed`);
    }
  }

  // Test 4: Test IPS Creation via API
  log.section('Test 4: IPS Creation via API');
  try {
    const response = await fetch(`http://localhost:3000/api/ips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testIPSData)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API returned ${response.status}: ${error}`);
    }

    const result = await response.json();
    if (result.success && result.data) {
      createdIPSId = result.data.id;
      log.success(`IPS created successfully with ID: ${createdIPSId}`);
      log.info(`IPS has ${result.data.ips_factors?.length || 0} factors attached`);
    } else {
      throw new Error('API response missing success or data');
    }
  } catch (error: any) {
    log.error(`IPS creation failed: ${error.message}`);
    log.warning('Make sure your dev server is running (npm run dev)');
  }

  // Test 5: Test IPS Retrieval
  log.section('Test 5: IPS Retrieval');
  if (createdIPSId) {
    try {
      const { data, error } = await supabase
        .from('ips_configurations')
        .select(`
          *,
          ips_factors (*)
        `)
        .eq('id', createdIPSId)
        .single();

      if (error) throw error;

      log.success('IPS retrieved successfully');
      log.info(`IPS Name: ${data.name}`);
      log.info(`Total Factors: ${data.total_factors}`);
      log.info(`Total Weight: ${data.total_weight}`);
      log.info(`Factors in DB: ${data.ips_factors?.length || 0}`);
    } catch (error: any) {
      log.error(`IPS retrieval failed: ${error.message}`);
    }
  }

  // Test 6: Test Trade Creation
  log.section('Test 6: Trade Creation');
  if (createdIPSId) {
    try {
      const tradeData = {
        user_id: 'default-user',
        ips_id: createdIPSId,
        symbol: 'AAPL',
        strategy_type: 'put_credit',
        entry_date: new Date().toISOString().split('T')[0],
        expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        strike_price_short: 180,
        strike_price_long: 175,
        premium_collected: 1.25,
        contracts: 2
      };

      const response = await fetch(`http://localhost:3000/api/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API returned ${response.status}: ${error}`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        createdTradeId = result.data.id;
        log.success(`Trade created successfully with ID: ${createdTradeId}`);
      } else {
        throw new Error('API response missing success or data');
      }
    } catch (error: any) {
      log.error(`Trade creation failed: ${error.message}`);
    }
  }

  // Test 7: Test Trade Evaluation
  log.section('Test 7: Trade Evaluation');
  if (createdTradeId) {
    try {
      const evaluationData = {
        trade_id: createdTradeId,
        factor_values: {
          'av-pe-ratio': 22,
          'opt-delta': 0.25,
          'current_price': 185.50
        }
      };

      const response = await fetch(`http://localhost:3000/api/trades/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evaluationData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API returned ${response.status}: ${error}`);
      }

      const result = await response.json();
      if (result.success) {
        log.success('Trade evaluation completed successfully');
        log.info(`IPS Score: ${result.data?.score?.toFixed(2) || 'N/A'}`);
        log.info(`Factors Met: ${result.data?.factors_met || 0}/${result.data?.total_factors || 0}`);
      } else {
        throw new Error('Evaluation failed');
      }
    } catch (error: any) {
      log.error(`Trade evaluation failed: ${error.message}`);
    }
  }

  // Test 8: Check Factor Definitions
  log.section('Test 8: Factor Definitions');
  try {
    const { data, error } = await supabase
      .from('factor_definitions')
      .select('count')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const count = data?.count || 0;
    if (count > 0) {
      log.success(`Factor definitions table has ${count} factors`);
    } else {
      log.warning('Factor definitions table is empty - run the INSERT statements from the schema');
    }
  } catch (error: any) {
    log.error(`Could not check factor definitions: ${error.message}`);
  }

  // Cleanup
  log.section('Test Cleanup');
  try {
    if (createdTradeId) {
      await supabase.from('trades').delete().eq('id', createdTradeId);
      log.info('Test trade deleted');
    }
    if (createdIPSId) {
      await supabase.from('ips_configurations').delete().eq('id', createdIPSId);
      log.info('Test IPS deleted');
    }
  } catch (error: any) {
    log.warning(`Cleanup failed: ${error.message}`);
  }

  // Summary
  log.section('TEST SUMMARY');
  log.info('Migration testing complete!');
  log.info('If all tests passed, your migration was successful.');
  log.info('If any tests failed, check the error messages above.');
  
  // Final checklist
  console.log('\n📋 Final Checklist:');
  console.log('[ ] All 5 new tables exist');
  console.log('[ ] Old tables have been removed');
  console.log('[ ] IPS creation works');
  console.log('[ ] Trade creation works');
  console.log('[ ] Trade evaluation works');
  console.log('[ ] Factor definitions are populated');
  console.log('\nNext steps:');
  console.log('1. Test your UI components');
  console.log('2. Create a real IPS through your interface');
  console.log('3. Create and evaluate a real trade');
}

// Run the tests
console.log('Starting migration tests...');
console.log('Make sure your Next.js dev server is running (npm run dev)\n');

runTests().then(() => {
  console.log('\n✨ Testing complete!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Testing failed:', error);
  process.exit(1);
});