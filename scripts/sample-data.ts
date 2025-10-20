import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function sampleData() {
  // Get AMD records with different snapshot dates
  const { data } = await supabase
    .from('historical_options_data')
    .select('symbol, snapshot_date, contract_id, strike, option_type')
    .eq('symbol', 'AMD')
    .order('snapshot_date')
    .limit(20);

  console.log('First 20 AMD records:');
  console.table(data);

  // Get distinct dates for AMD
  const { data: distinctDates } = await supabase
    .rpc('get_distinct_snapshot_dates_for_symbol', { target_symbol: 'AMD' })
    .catch(() => null);

  if (!distinctDates) {
    // Fallback: Get all dates and count manually
    const { data: allRecords } = await supabase
      .from('historical_options_data')
      .select('snapshot_date')
      .eq('symbol', 'AMD');

    if (allRecords) {
      const uniqueDates = [...new Set(allRecords.map(r => r.snapshot_date))];
      console.log(`\nUnique snapshot dates for AMD: ${uniqueDates.length}`);
      console.log('Dates:', uniqueDates.sort().slice(0, 10), '...');
    }
  }
}

sampleData().catch(console.error);
