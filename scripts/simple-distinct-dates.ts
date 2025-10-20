import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function checkDistinctDates() {
  console.log('Checking DISTINCT snapshot dates for AMD...\n');

  // Get sample records
  const { data: sampleRecords } = await supabase
    .from('historical_options_data')
    .select('snapshot_date')
    .eq('symbol', 'AMD')
    .order('snapshot_date', { ascending: true })
    .limit(200);  // Just get 200 records

  if (sampleRecords) {
    console.log('Sample of 200 AMD records:');
    const uniqueDates = [...new Set(sampleRecords.map(r => r.snapshot_date))].sort();
    console.log(`Unique dates in sample: ${uniqueDates.length}`);
    console.log('Dates:', uniqueDates);
  }

  // Also get a random sampling
  const { data: randomSample } = await supabase
    .from('historical_options_data')
    .select('snapshot_date, contract_id')
    .eq('symbol', 'AMD')
    .limit(10);

  console.log('\n10 random AMD records:');
  console.table(randomSample);
}

checkDistinctDates().catch(console.error);
