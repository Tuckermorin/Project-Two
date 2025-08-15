// test-ips-creation.ts
// Run this with: npx tsx test-ips-creation.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function testIPSCreation() {
  console.log('=== Testing IPS Creation ===\n');
  
  // Check environment variables
  console.log('1. Checking environment variables...');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing environment variables!');
    console.log('   NEXT_PUBLIC_SUPABASE_URL:', url ? '✓ Set' : '✗ Missing');
    console.log('   SUPABASE_SERVICE_ROLE_KEY:', key ? '✓ Set' : '✗ Missing');
    process.exit(1);
  }
  
  console.log('✅ Environment variables found\n');
  
  // Create Supabase client
  console.log('2. Creating Supabase client...');
  const supabase = createClient(url, key);
  console.log('✅ Client created\n');
  
  // Test 1: Direct IPS creation (minimal)
  console.log('3. Testing minimal IPS creation...');
  try {
    const { data, error } = await supabase
      .from('ips_configurations')
      .insert([{
        user_id: 'test-user-123',
        name: 'Test IPS - ' + new Date().toISOString(),
        description: 'Created by test script',
        is_active: true
      }])
      .select('id, name, created_at')
      .single();
    
    if (error) {
      console.error('❌ Failed to create IPS:', error.message);
      console.error('   Details:', error);
      process.exit(1);
    }
    
    console.log('✅ IPS created successfully!');
    console.log('   ID:', data.id);
    console.log('   Name:', data.name);
    console.log('   Created:', data.created_at);
    
    // Test 2: Add factors to the IPS
    console.log('\n4. Testing factor addition...');
    const { error: factorError } = await supabase
      .from('ips_factors')
      .insert([
        {
          ips_id: data.id,
          factor_id: 'rsi',
          weight: 5,
          target_value: 30
        },
        {
          ips_id: data.id,
          factor_id: 'iv_rank',
          weight: 8,
          target_value: 50
        }
      ]);
    
    if (factorError) {
      console.error('❌ Failed to add factors:', factorError.message);
    } else {
      console.log('✅ Factors added successfully!');
    }
    
    // Test 3: Query the view
    console.log('\n5. Testing view query (ips_configurations)...');
    const { data: viewData, error: viewError } = await supabase
      .from('ips_configurations')
      .select(`
        *,
        ips_factors (*)
      `)
      .eq('id', data.id);
    
    if (viewError) {
      console.error('❌ Failed to query view:', viewError.message);
    } else {
      console.log('✅ View query successful!');
      console.log('   Rows returned:', viewData.length);
    }
    
    // Clean up
    console.log('\n6. Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('ips_configurations')
      .delete()
      .eq('id', data.id);
    
    if (deleteError) {
      console.error('⚠️  Could not clean up test IPS:', deleteError.message);
    } else {
      console.log('✅ Test data cleaned up');
    }
    
    console.log('\n🎉 All database operations working correctly!');
    console.log('Your Supabase connection is properly configured.\n');
    
  } catch (e: any) {
    console.error('❌ Unexpected error:', e.message);
    process.exit(1);
  }
}

// Run the test
testIPSCreation().then(() => {
  console.log('Test complete. You can now test the API route.');
  process.exit(0);
});