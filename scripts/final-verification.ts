import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function finalVerification() {
  console.log('=== FINAL VERIFICATION OF HISTORICAL DATA ===\n');

  // Get a larger sample to check date distribution
  const { data: largeSample } = await supabase
    .from('historical_options_data')
    .select('snapshot_date')
    .eq('symbol', 'AMD')
    .limit(50000);  // Get 50k records

  if (largeSample) {
    const uniqueDates = [...new Set(largeSample.map(r => r.snapshot_date))].sort();
    console.log(`Total AMD records sampled: ${largeSample.length.toLocaleString()}`);
    console.log(`Unique snapshot dates: ${uniqueDates.length}`);
    console.log(`\nFirst 20 dates:`, uniqueDates.slice(0, 20));
    console.log(`\nLast 20 dates:`, uniqueDates.slice(-20));
  }

  // Get overall stats
  const { count: totalCount } = await supabase
    .from('historical_options_data')
    .select('*', { count: 'exact', head: true });

  console.log(`\n\nTotal records across all symbols: ${totalCount?.toLocaleString()}`);

  // Sample from different symbols
  console.log('\n\nSample records from various symbols:');

  for (const symbol of ['AMD', 'NVDA', 'TSLA', 'AMZN']) {
    const { data: sample } = await supabase
      .from('historical_options_data')
      .select('symbol, snapshot_date')
      .eq('symbol', symbol)
      .limit(5000);

    if (sample) {
      const dates = [...new Set(sample.map(r => r.snapshot_date))];
      console.log(`  ${symbol}: ${dates.length} unique dates (from ${sample.length} records sampled)`);
    }
  }

  console.log('\n✅ Data verification complete!');
}

finalVerification().catch(console.error);
