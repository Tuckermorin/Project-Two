#!/usr/bin/env tsx

/**
 * Quick Stats - Show what historical data we have
 */

import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function main() {
  console.log('📊 Historical Data Statistics\n');

  // Count by symbol
  const { data: symbols } = await supabase
    .from('watchlist_items')
    .select('symbol')
    .order('symbol');

  if (!symbols) {
    console.log('No watchlist symbols found');
    return;
  }

  console.log('Symbol'.padEnd(10) + 'Stock Days'.padEnd(15) + 'Options Contracts'.padEnd(20) + 'Snapshot Dates');
  console.log('-'.repeat(70));

  let totalStock = 0;
  let totalOptions = 0;

  for (const { symbol } of symbols) {
    // Count stock data
    const { count: stockCount } = await supabase
      .from('historical_stock_data')
      .select('*', { count: 'exact', head: true })
      .eq('symbol', symbol);

    // Count options data
    const { count: optionsCount } = await supabase
      .from('historical_options_data')
      .select('*', { count: 'exact', head: true })
      .eq('symbol', symbol);

    // Count unique snapshot dates
    const { data: dates } = await supabase
      .from('historical_options_data')
      .select('snapshot_date')
      .eq('symbol', symbol);

    const uniqueDates = dates ? new Set(dates.map(d => d.snapshot_date)).size : 0;

    totalStock += stockCount || 0;
    totalOptions += optionsCount || 0;

    console.log(
      symbol.padEnd(10) +
      (stockCount || 0).toLocaleString().padEnd(15) +
      (optionsCount || 0).toLocaleString().padEnd(20) +
      uniqueDates.toLocaleString()
    );
  }

  console.log('-'.repeat(70));
  console.log(
    'TOTAL'.padEnd(10) +
    totalStock.toLocaleString().padEnd(15) +
    totalOptions.toLocaleString()
  );

  console.log('');

  // Check spread analysis
  const { count: spreadCount } = await supabase
    .from('historical_spread_analysis')
    .select('*', { count: 'exact', head: true });

  console.log(`Analyzed Spreads: ${spreadCount?.toLocaleString() || 0}`);

  if (spreadCount && spreadCount > 0) {
    const { data: withOutcomes } = await supabase
      .from('historical_spread_analysis')
      .select('actual_pl_percent')
      .not('actual_pl_percent', 'is', null);

    if (withOutcomes && withOutcomes.length > 0) {
      const wins = withOutcomes.filter(s => s.actual_pl_percent >= 0).length;
      const winRate = (wins / withOutcomes.length) * 100;
      const avgReturn = withOutcomes.reduce((sum, s) => sum + s.actual_pl_percent, 0) / withOutcomes.length;

      console.log(`   With Outcomes: ${withOutcomes.length.toLocaleString()}`);
      console.log(`   Win Rate: ${winRate.toFixed(1)}%`);
      console.log(`   Avg Return: ${avgReturn.toFixed(1)}%`);
    }
  }

  console.log('');
}

main();
