#!/usr/bin/env tsx

/**
 * Historical Data Backfill Script
 *
 * Collects historical options and stock data from Alpha Vantage
 * for use in RAG and backtesting systems.
 *
 * Usage:
 *   npm run backfill-historical -- --symbols MU,AMD,TSLA --years 3
 *   npm run backfill-historical -- --symbols MU --start-date 2020-01-01 --end-date 2023-12-31
 *   npm run backfill-historical -- --watchlist --years 5
 */

import 'dotenv/config';
import { getHistoricalDataCollector } from '../src/lib/services/historical-data-collector';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';
import { parseArgs } from 'node:util';

const supabase = getSupabaseServer();

interface BackfillConfig {
  symbols: string[];
  startDate: Date;
  endDate: Date;
  dataTypes: Array<'options' | 'daily'>;
  dryRun: boolean;
}

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

async function parseConfig(): Promise<BackfillConfig> {
  const { values } = parseArgs({
    options: {
      symbols: { type: 'string' },
      watchlist: { type: 'boolean', default: false },
      'start-date': { type: 'string' },
      'end-date': { type: 'string' },
      years: { type: 'string', default: '3' },
      'data-types': { type: 'string', default: 'options,daily' },
      'dry-run': { type: 'boolean', default: false },
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
  let startDate: Date;
  let endDate: Date;

  if (values['start-date'] && values['end-date']) {
    startDate = new Date(values['start-date']);
    endDate = new Date(values['end-date']);
  } else {
    const years = parseInt(values.years || '3');
    endDate = new Date();
    startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);
  }

  // Data types
  const dataTypes = values['data-types']?.split(',').map(t => t.trim()) as Array<'options' | 'daily'>;

  return {
    symbols,
    startDate,
    endDate,
    dataTypes,
    dryRun: values['dry-run'] || false,
  };
}

async function showDataCoverage(symbols: string[]): Promise<void> {
  console.log('\n=== Current Data Coverage ===\n');

  const collector = getHistoricalDataCollector();

  for (const symbol of symbols) {
    console.log(`${symbol}:`);

    const dailyCoverage = await collector.getDataCoverage(symbol, 'daily');
    console.log(`  Daily: ${dailyCoverage.totalRecords} records`);
    if (dailyCoverage.earliestDate && dailyCoverage.latestDate) {
      console.log(`    Range: ${dailyCoverage.earliestDate} to ${dailyCoverage.latestDate}`);
    }

    const optionsCoverage = await collector.getDataCoverage(symbol, 'options');
    console.log(`  Options: ${optionsCoverage.totalRecords} records`);
    if (optionsCoverage.earliestDate && optionsCoverage.latestDate) {
      console.log(`    Range: ${optionsCoverage.earliestDate} to ${optionsCoverage.latestDate}`);
    }

    console.log('');
  }
}

async function estimateApiCalls(config: BackfillConfig): Promise<number> {
  const daysBetween = Math.ceil((config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24));
  const tradingDays = Math.floor(daysBetween * (5/7)); // Approximate trading days
  const sampledDays = Math.ceil(tradingDays / 5); // We sample every 5th day

  let callsPerSymbol = 0;

  if (config.dataTypes.includes('daily')) {
    callsPerSymbol += 1; // One call for full daily data
  }

  if (config.dataTypes.includes('options')) {
    callsPerSymbol += sampledDays; // One call per sampled day
  }

  return callsPerSymbol * config.symbols.length;
}

async function main() {
  console.log('🚀 Historical Data Backfill Script\n');

  const config = await parseConfig();

  console.log('Configuration:');
  console.log(`  Symbols: ${config.symbols.join(', ')}`);
  console.log(`  Date Range: ${config.startDate.toISOString().split('T')[0]} to ${config.endDate.toISOString().split('T')[0]}`);
  console.log(`  Data Types: ${config.dataTypes.join(', ')}`);
  console.log(`  Dry Run: ${config.dryRun}\n`);

  // Show current coverage
  await showDataCoverage(config.symbols);

  // Estimate API calls
  const estimatedCalls = await estimateApiCalls(config);
  const estimatedMinutes = Math.ceil(estimatedCalls / 600); // 600 calls/minute
  console.log(`\n📊 Estimated API Calls: ${estimatedCalls.toLocaleString()}`);
  console.log(`⏱️  Estimated Time: ~${estimatedMinutes} minutes`);

  if (config.dryRun) {
    console.log('\n✅ Dry run complete. Use without --dry-run to execute.');
    return;
  }

  // Confirm before proceeding
  console.log('\n⚠️  This will make approximately', estimatedCalls.toLocaleString(), 'API calls.');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('🏃 Starting backfill...\n');

  const collector = getHistoricalDataCollector();

  const startTime = Date.now();

  // Track progress
  const progress = {
    totalSymbols: config.symbols.length,
    completedSymbols: 0,
    totalRecords: 0,
  };

  await collector.backfillMultipleSymbols(
    config.symbols,
    config.startDate,
    config.endDate,
    config.dataTypes
  );

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('\n✅ Backfill Complete!');
  console.log(`Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);

  // Show updated coverage
  console.log('\n=== Updated Data Coverage ===');
  await showDataCoverage(config.symbols);
}

main().catch(error => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
