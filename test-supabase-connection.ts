// test-supabase-connection.ts
// Run this file with: npx tsx test-supabase-connection.ts
// or create it as an API route in Next.js

import { createClient } from '@supabase/supabase-js';

// Configuration check
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

console.log('=== Supabase Connection Test ===\n');

// Step 1: Check environment variables
console.log('1. Checking environment variables...');
if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL is not set in environment variables');
  process.exit(1);
}
if (!SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_ANON_KEY is not set in environment variables');
  process.exit(1);
}

console.log('✅ Environment variables are set');
console.log(`   URL: ${SUPABASE_URL}`);
console.log(`   Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...`);

// Step 2: Create Supabase client
console.log('\n2. Creating Supabase client...');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Supabase client created successfully');

// Test functions
async function testDatabaseConnection() {
  console.log('\n3. Testing database connection...');
  
  try {
    // Test a simple query to check connection
    const { data, error } = await supabase
      .from('trades')  // Assuming you have a trades table based on your schema
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }

    console.log('✅ Database connection successful');
    return true;
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return false;
  }
}

async function listTables() {
  console.log('\n4. Listing available tables...');
  
  try {
    // This queries the information schema to get all tables
    const { data, error } = await supabase
      .rpc('get_tables_list')
      .single();

    if (error) {
      // If the RPC doesn't exist, try a different approach
      console.log('   Note: Cannot list tables directly. Trying known tables...');
      
      // Test known tables from your schema
      const tables = [
        'trades',
        'trade_snapshots',
        'watchlist_stocks',
        'ips_criteria',
        'ips_configurations',
        'factor_definitions',
        'trade_factors',
        'api_syncs'
      ];

      for (const table of tables) {
        const { error: tableError } = await supabase
          .from(table)
          .select('*')
          .limit(0);  // Just check if table exists
        
        if (!tableError) {
          console.log(`   ✅ Table '${table}' exists`);
        } else {
          console.log(`   ❌ Table '${table}' not found or inaccessible`);
        }
      }
    } else {
      console.log('✅ Tables retrieved:', data);
    }
  } catch (err) {
    console.error('❌ Error listing tables:', err);
  }
}

async function testCRUDOperations() {
  console.log('\n5. Testing CRUD operations...');
  
  const testTableName = 'trades';
  const testData = {
    type: 'put-credit-spread',
    symbol: 'TEST',
    expiration_date: new Date('2025-02-28').toISOString(), // Note: snake_case for Supabase
    quantity: 1,
    short_strike: 100,
    long_strike: 95,
    credit_received: 50,
    status: 'potential',
    ips_score: 85,
    ips_name: 'Test IPS',
    ips_notes: 'Test trade for connection verification'
  };

  try {
    // CREATE - Insert test data
    console.log('   Testing INSERT...');
    const { data: insertedData, error: insertError } = await supabase
      .from(testTableName)
      .insert(testData)
      .select()
      .single();

    if (insertError) {
      console.error(`   ❌ INSERT failed: ${insertError.message}`);
      return;
    }
    console.log(`   ✅ INSERT successful - ID: ${insertedData.id}`);

    // READ - Query the inserted data
    console.log('   Testing SELECT...');
    const { data: selectedData, error: selectError } = await supabase
      .from(testTableName)
      .select('*')
      .eq('id', insertedData.id)
      .single();

    if (selectError) {
      console.error(`   ❌ SELECT failed: ${selectError.message}`);
    } else {
      console.log(`   ✅ SELECT successful - Retrieved record with ID: ${selectedData.id}`);
    }

    // UPDATE - Modify the test data
    console.log('   Testing UPDATE...');
    const { data: updatedData, error: updateError } = await supabase
      .from(testTableName)
      .update({ ipsScore: 90, notes: 'Updated test note' })
      .eq('id', insertedData.id)
      .select()
      .single();

    if (updateError) {
      console.error(`   ❌ UPDATE failed: ${updateError.message}`);
    } else {
      console.log(`   ✅ UPDATE successful - IPS Score updated to: ${updatedData.ipsScore}`);
    }

    // DELETE - Clean up test data
    console.log('   Testing DELETE...');
    const { error: deleteError } = await supabase
      .from(testTableName)
      .delete()
      .eq('id', insertedData.id);

    if (deleteError) {
      console.error(`   ❌ DELETE failed: ${deleteError.message}`);
    } else {
      console.log(`   ✅ DELETE successful - Test record cleaned up`);
    }

  } catch (err) {
    console.error('❌ CRUD operations failed:', err);
  }
}

async function testRealTimeConnection() {
  console.log('\n6. Testing real-time subscription...');
  
  try {
    const channel = supabase
      .channel('test-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades'
        },
        (payload) => {
          console.log('   Real-time event received:', payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription successful');
          // Unsubscribe after successful connection
          setTimeout(() => {
            supabase.removeChannel(channel);
          }, 1000);
        } else {
          console.log(`   Subscription status: ${status}`);
        }
      });

    // Wait a bit for subscription to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (err) {
    console.error('❌ Real-time subscription failed:', err);
  }
}

async function checkAuthConfiguration() {
  console.log('\n7. Checking authentication configuration...');
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.log('   ℹ️ No authenticated user (this is normal if not logged in)');
    } else if (user) {
      console.log('✅ Authenticated user found:', user.email);
    }
    
    // Check if auth is properly configured
    const { data: session } = await supabase.auth.getSession();
    if (session?.session) {
      console.log('✅ Active session found');
    } else {
      console.log('   ℹ️ No active session');
    }
    
  } catch (err) {
    console.error('❌ Auth check failed:', err);
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n' + '='.repeat(50));
  console.log('Starting Supabase Database Tests');
  console.log('='.repeat(50));

  const connectionSuccess = await testDatabaseConnection();
  
  if (connectionSuccess) {
    await listTables();
    await testCRUDOperations();
    await testRealTimeConnection();
    await checkAuthConfiguration();
  }

  console.log('\n' + '='.repeat(50));
  console.log('Test Suite Complete!');
  console.log('='.repeat(50));
  
  console.log('\n📋 Summary:');
  console.log('- Environment variables: ✅');
  console.log(`- Database connection: ${connectionSuccess ? '✅' : '❌'}`);
  console.log('\nIf all tests passed, your Supabase database is properly configured!');
  console.log('If some tests failed, check the error messages above for troubleshooting.');
}

// Execute tests
runAllTests().catch(console.error);