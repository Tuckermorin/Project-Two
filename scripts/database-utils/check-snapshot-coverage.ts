#!/usr/bin/env tsx

import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function main() {
  console.log('📊 Detailed Snapshot Coverage Per Symbol\n');

  const { data: symbols } = await supabase
    .from('watchlist_items')
    .select('symbol')
    .order('symbol');

  if (!symbols) return;

  for (const { symbol } of symbols) {
    const { data: dates } = await supabase
      .from('historical_options_data')
      .select('snapshot_date')
      .eq('symbol', symbol)
      .order('snapshot_date', { ascending: true });

    if (dates && dates.length > 0) {
      const uniqueDates = [...new Set(dates.map(d => d.snapshot_date))].sort();
      const { count } = await supabase
        .from('historical_options_data')
        .select('*', { count: 'exact', head: true })
        .eq('symbol', symbol);

      console.log(`${symbol}:`);
      console.log(`  Total contracts: ${count?.toLocaleString() || 0}`);
      console.log(`  Unique snapshot dates: ${uniqueDates.length}`);
      console.log(`  Date range: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`);
      console.log(`  Sample dates: ${uniqueDates.slice(0, 5).join(', ')}...`);
      console.log('');
    }
  }
}

main();
