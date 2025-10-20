import 'dotenv/config';
import { getSupabaseServer } from './src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function main() {
  console.log('📊 Detailed Snapshot Coverage\n');
  
  const symbols = ['AMD', 'AMZN', 'MU', 'NVDA', 'TSLA', 'APP', 'BA'];
  
  for (const symbol of symbols) {
    const { data: dates } = await supabase
      .from('historical_options_data')
      .select('snapshot_date')
      .eq('symbol', symbol)
      .order('snapshot_date', { ascending: true });
    
    if (dates && dates.length > 0) {
      const uniqueDates = [...new Set(dates.map(d => d.snapshot_date))];
      console.log(`${symbol}:`);
      console.log(`  Total contracts: ${dates.length.toLocaleString()}`);
      console.log(`  Unique snapshot dates: ${uniqueDates.length}`);
      console.log(`  Date range: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`);
      console.log('');
    }
  }
}

main();
