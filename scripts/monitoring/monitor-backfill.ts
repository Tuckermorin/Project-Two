#!/usr/bin/env tsx

/**
 * Monitor Backfill Progress
 * Shows real-time progress of historical data collection
 */

import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function showProgress() {
  console.clear();
  console.log('📊 Historical Data Backfill Progress\n');
  console.log('Last updated:', new Date().toLocaleTimeString());
  console.log('='.repeat(80));
  console.log('');

  // Get backfill tasks
  const { data: tasks } = await supabase
    .from('historical_data_backfill_progress')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);

  if (!tasks || tasks.length === 0) {
    console.log('No backfill tasks found yet...\n');
    return;
  }

  // Group by symbol
  const bySymbol = new Map<string, any[]>();
  tasks.forEach(task => {
    if (!bySymbol.has(task.symbol)) {
      bySymbol.set(task.symbol, []);
    }
    bySymbol.get(task.symbol)!.push(task);
  });

  // Summary stats
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const totalRecords = tasks.reduce((sum, t) => sum + (t.records_collected || 0), 0);

  console.log('📈 Overall Progress:');
  console.log(`   Symbols Processed: ${bySymbol.size}`);
  console.log(`   Tasks Completed: ${completed}`);
  console.log(`   Tasks In Progress: ${inProgress}`);
  console.log(`   Tasks Failed: ${failed}`);
  console.log(`   Total Records: ${totalRecords.toLocaleString()}`);
  console.log('');

  // Symbol breakdown
  console.log('📋 By Symbol:\n');

  const symbols = Array.from(bySymbol.keys()).sort();
  for (const symbol of symbols) {
    const symbolTasks = bySymbol.get(symbol)!;
    const optionsTask = symbolTasks.find(t => t.data_type === 'options');
    const dailyTask = symbolTasks.find(t => t.data_type === 'daily');

    const optionsStatus = optionsTask ? `${getStatusEmoji(optionsTask.status)} ${optionsTask.records_collected || 0} records` : '⏳ pending';
    const dailyStatus = dailyTask ? `${getStatusEmoji(dailyTask.status)} ${dailyTask.records_collected || 0} records` : '⏳ pending';

    console.log(`${symbol.padEnd(8)} Options: ${optionsStatus.padEnd(20)} | Daily: ${dailyStatus}`);
  }

  console.log('');

  // Get actual data counts
  const { data: optionsCounts } = await supabase.rpc('get_options_counts_by_symbol' as any);
  const { data: stockCounts } = await supabase.rpc('get_stock_counts_by_symbol' as any);

  // Show recent errors
  const errors = tasks.filter(t => t.error_message);
  if (errors.length > 0) {
    console.log('⚠️  Recent Errors:\n');
    errors.slice(0, 3).forEach(task => {
      console.log(`   ${task.symbol} (${task.data_type}): ${task.error_message}`);
    });
    console.log('');
  }

  console.log('Press Ctrl+C to stop monitoring');
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'completed': return '✅';
    case 'in_progress': return '🔄';
    case 'failed': return '❌';
    default: return '⏳';
  }
}

async function main() {
  // Show initial progress
  await showProgress();

  // Update every 5 seconds
  setInterval(async () => {
    await showProgress();
  }, 5000);
}

main().catch(console.error);
