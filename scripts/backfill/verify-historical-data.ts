#!/usr/bin/env tsx

import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function main() {
  console.log('🔍 Verifying Historical Data\n');

  // Check options data
  const { data: optionsData, error: optionsError } = await supabase
    .from('historical_options_data')
    .select('*')
    .eq('symbol', 'MU')
    .eq('snapshot_date', '2024-10-01')
    .eq('option_type', 'put')
    .not('delta', 'is', null)
    .order('delta', { ascending: false })
    .limit(5);

  if (optionsError) {
    console.error('Options query error:', optionsError);
  } else {
    console.log('✅ Sample Options Data (MU puts from 2024-10-01):\n');
    optionsData?.forEach(opt => {
      console.log(`  Strike: $${opt.strike} | Delta: ${opt.delta?.toFixed(3)} | IV: ${(opt.implied_volatility * 100)?.toFixed(1)}% | DTE: ${opt.dte}`);
    });
  }

  // Check stock data
  const { count: stockCount } = await supabase
    .from('historical_stock_data')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', 'MU');

  console.log(`\n✅ Stock Data Records: ${stockCount} days for MU`);

  // Check options count
  const { count: optionsCount } = await supabase
    .from('historical_options_data')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', 'MU');

  console.log(`✅ Options Data Records: ${optionsCount} contracts for MU`);

  // Get unique snapshot dates
  const { data: dates } = await supabase
    .from('historical_options_data')
    .select('snapshot_date')
    .eq('symbol', 'MU')
    .order('snapshot_date', { ascending: false });

  const uniqueDates = [...new Set(dates?.map(d => d.snapshot_date))];
  console.log(`✅ Unique Options Snapshots: ${uniqueDates.length} dates`);
  console.log(`   Latest: ${uniqueDates[0]}, Earliest: ${uniqueDates[uniqueDates.length - 1]}`);

  console.log('\n✨ Historical data is ready for analysis!');
}

main();
