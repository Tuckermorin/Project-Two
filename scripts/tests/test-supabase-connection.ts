// Load environment variables from .env file
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

console.log('=== Supabase Connection Test ===');

// 1. Check environment variables
console.log('1. Checking environment variables...');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.log('❌ SUPABASE_URL is not set in environment variables');
  process.exit(1);
}

if (!supabaseKey) {
  console.log('❌ SUPABASE_SERVICE_ROLE_KEY is not set in environment variables');
  process.exit(1);
}

console.log('✅ Environment variables are set');
console.log(`   SUPABASE_URL: ${supabaseUrl.slice(0, 30)}...`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey.slice(0, 30)}...`);

// 2. Create Supabase client
console.log('\n2. Creating Supabase client...');
const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase client created successfully');

// 3. Test connection by listing tables
async function runTests() {
  console.log('\n3. Testing database connection...');
  try {
    // Try a simple query to verify connection using one of your actual tables
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ Database connection failed:', error.message);
      process.exit(1);
    }

    console.log('✅ Database connection successful!');
    console.log(`   Successfully queried the 'trades' table`);
    console.log(`   Found ${data.length} records (limited to 1)`);
    
    if (data.length > 0) {
      console.log('   Sample record structure:', Object.keys(data[0]).join(', '));
    }

    // 4. Test authentication
    console.log('\n4. Testing authentication...');
    const { data: authData, error: authError } = await supabase.auth.getSession();
    
    if (authError) {
      console.log('⚠️  Auth test warning (this is expected without login):', authError.message);
    } else {
      console.log('✅ Auth service is accessible');
      console.log(`   Session status: ${authData.session ? 'Active' : 'No active session'}`);
    }

    console.log('\n🎉 All tests passed! Supabase is properly connected.');
    
  } catch (error) {
    console.log('❌ Unexpected error during testing:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();
