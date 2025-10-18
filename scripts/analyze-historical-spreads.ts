#!/usr/bin/env tsx

/**
 * Historical Spread Analysis Script
 *
 * Analyzes collected historical options data to identify optimal spreads
 * and their outcomes. This data powers the RAG system for trade recommendations.
 *
 * Usage:
 *   npm run analyze-historical -- --symbols MU,AMD --start-date 2022-01-01 --end-date 2023-12-31
 *   npm run analyze-historical -- --watchlist --years 2
 */

import 'dotenv/config';
import { getHistoricalSpreadAnalyzer } from '../src/lib/services/historical-spread-analyzer';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';
import { parseArgs } from 'node:util';

const supabase = getSupabaseServer();

async function getWatchlistSymbols(): Promise<string[]> {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('symbol')
    .order('symbol');

  if (error) {
    console.error('Failed to fetch watchlist:', error);
    return [];
  }

  return data.map(item => item.symbol);
}

async function main() {
  console.log('📊 Historical Spread Analysis\n');

  const { values } = parseArgs({
    options: {
      symbols: { type: 'string' },
      watchlist: { type: 'boolean', default: false },
      'start-date': { type: 'string' },
      'end-date': { type: 'string' },
      years: { type: 'string', default: '2' },
      'sample-interval': { type: 'string', default: '5' },
    },
  });

  // Determine symbols
  let symbols: string[] = [];
  if (values.watchlist) {
    console.log('Fetching symbols from watchlist...');
    symbols = await getWatchlistSymbols();
  } else if (values.symbols) {
    symbols = values.symbols.split(',').map(s => s.trim().toUpperCase());
  } else {
    console.error('Error: Must specify either --symbols or --watchlist');
    process.exit(1);
  }

  // Determine date range
  let startDate: string;
  let endDate: string;

  if (values['start-date'] && values['end-date']) {
    startDate = values['start-date'];
    endDate = values['end-date'];
  } else {
    const years = parseInt(values.years || '2');
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - years);
    startDate = start.toISOString().split('T')[0];
    endDate = end.toISOString().split('T')[0];
  }

  const sampleInterval = parseInt(values['sample-interval'] || '5');

  console.log('Configuration:');
  console.log(`  Symbols: ${symbols.join(', ')}`);
  console.log(`  Date Range: ${startDate} to ${endDate}`);
  console.log(`  Sample Interval: Every ${sampleInterval} days\n`);

  const analyzer = getHistoricalSpreadAnalyzer();

  const totalStats = {
    analyzed: 0,
    stored: 0,
  };

  const startTime = Date.now();

  for (const symbol of symbols) {
    try {
      const stats = await analyzer.analyzeSymbolHistory(
        symbol,
        startDate,
        endDate,
        sampleInterval
      );

      totalStats.analyzed += stats.analyzed;
      totalStats.stored += stats.stored;

      // Delay between symbols
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to analyze ${symbol}:`, error);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Analysis Complete!');
  console.log(`   Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`   Spreads Analyzed: ${totalStats.analyzed.toLocaleString()}`);
  console.log(`   Records Stored: ${totalStats.stored.toLocaleString()}`);

  // Show some statistics
  console.log('\n📈 Summary Statistics:\n');

  const { data: winningTrades } = await supabase
    .from('historical_spread_analysis')
    .select('actual_pl_percent')
    .gte('actual_pl_percent', 0)
    .not('actual_pl_percent', 'is', null);

  const { data: losingTrades } = await supabase
    .from('historical_spread_analysis')
    .select('actual_pl_percent')
    .lt('actual_pl_percent', 0);

  if (winningTrades && losingTrades) {
    const totalTrades = winningTrades.length + losingTrades.length;
    const winRate = (winningTrades.length / totalTrades) * 100;
    const avgWin = winningTrades.reduce((sum, t) => sum + t.actual_pl_percent, 0) / winningTrades.length;
    const avgLoss = losingTrades.reduce((sum, t) => sum + t.actual_pl_percent, 0) / losingTrades.length;

    console.log(`  Total Trades with Outcomes: ${totalTrades.toLocaleString()}`);
    console.log(`  Win Rate: ${winRate.toFixed(1)}%`);
    console.log(`  Average Win: +${avgWin.toFixed(1)}%`);
    console.log(`  Average Loss: ${avgLoss.toFixed(1)}%`);
    console.log(`  Expectancy: ${((winRate/100 * avgWin) + ((1-winRate/100) * avgLoss)).toFixed(1)}%`);
  }

  // Show best performing spreads by delta range
  console.log('\n🎯 Performance by Delta Range:\n');

  const deltaRanges = [
    { label: '0.08-0.12', min: 0.08, max: 0.12 },
    { label: '0.12-0.15', min: 0.12, max: 0.15 },
    { label: '0.15-0.18', min: 0.15, max: 0.18 },
    { label: '0.18-0.20', min: 0.18, max: 0.20 },
  ];

  for (const range of deltaRanges) {
    const { data } = await supabase
      .from('historical_spread_analysis')
      .select('actual_pl_percent')
      .gte('delta', range.min)
      .lt('delta', range.max)
      .not('actual_pl_percent', 'is', null);

    if (data && data.length > 0) {
      const wins = data.filter(t => t.actual_pl_percent >= 0).length;
      const winRate = (wins / data.length) * 100;
      const avgReturn = data.reduce((sum, t) => sum + t.actual_pl_percent, 0) / data.length;

      console.log(`  Delta ${range.label}: ${data.length} trades, ${winRate.toFixed(1)}% win rate, avg return ${avgReturn.toFixed(1)}%`);
    }
  }

  console.log('\n✨ Historical analysis data is now available for RAG!');
}

main().catch(error => {
  console.error('❌ Analysis failed:', error);
  process.exit(1);
});
