import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function testInsert() {
  console.log('Testing direct insert to historical_options_data...\n');

  // Insert a test record with a SPECIFIC snapshot date
  const testDate = '2023-05-15';
  const testRecord = {
    symbol: 'TEST',
    contract_id: 'TEST230601C00100000',
    snapshot_date: testDate,
    expiration_date: '2023-06-01',
    strike: 100,
    option_type: 'call',
    bid: 1.50,
    ask: 1.55,
    delta: 0.45
  };

  console.log('Inserting record with snapshot_date:', testDate);
  console.log('Record:', testRecord);

  const { data, error } = await supabase
    .from('historical_options_data')
    .insert(testRecord)
    .select();

  if (error) {
    console.error('\nInsert error:', error);
  } else {
    console.log('\nInserted successfully!');
    console.log('Returned data:', data);
  }

  // Now query it back
  const { data: queryData } = await supabase
    .from('historical_options_data')
    .select('symbol, contract_id, snapshot_date, expiration_date')
    .eq('symbol', 'TEST')
    .single();

  console.log('\nQueried back:', queryData);

  // Cleanup
  await supabase
    .from('historical_options_data')
    .delete()
    .eq('symbol', 'TEST');

  console.log('\nTest record cleaned up.');
}

testInsert().catch(console.error);
