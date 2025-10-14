// Script to verify EOD snapshots were captured correctly
// Usage: npx tsx scripts/check-eod-snapshots.ts

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkEODSnapshots() {
  console.log('='.repeat(80));
  console.log('CHECKING END-OF-DAY SNAPSHOTS');
  console.log('='.repeat(80));
  console.log('');

  // Get today's date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString();

  console.log(`Checking snapshots for: ${today.toDateString()}`);
  console.log('');

  // Get all snapshots from today
  const { data: snapshots, error: snapshotsError } = await supabase
    .from('trade_snapshots')
    .select(`
      id,
      trade_id,
      snapshot_time,
      snapshot_trigger,
      current_stock_price,
      current_spread_price,
      unrealized_pnl,
      unrealized_pnl_percent,
      days_to_expiration,
      days_in_trade,
      delta_spread,
      iv_rank,
      iv_percentile,
      probability_of_profit,
      trades!inner(
        symbol,
        strategy_type,
        status,
        entry_date,
        expiration_date
      )
    `)
    .gte('snapshot_time', todayStr)
    .lt('snapshot_time', tomorrowStr)
    .order('snapshot_time', { ascending: false });

  if (snapshotsError) {
    console.error('Error fetching snapshots:', snapshotsError);
    return;
  }

  if (!snapshots || snapshots.length === 0) {
    console.log('❌ NO SNAPSHOTS FOUND FOR TODAY');
    console.log('');
    console.log('This could mean:');
    console.log('  1. No active trades in the system');
    console.log('  2. EOD snapshot job has not run yet');
    console.log('  3. Snapshot capture failed (check logs)');
    console.log('');

    // Check if there are any active trades
    const { data: activeTrades, error: tradesError } = await supabase
      .from('trades')
      .select('id, symbol, status')
      .eq('status', 'active');

    if (!tradesError && activeTrades) {
      console.log(`Active trades in system: ${activeTrades.length}`);
      if (activeTrades.length > 0) {
        console.log('Active trades:');
        activeTrades.forEach((trade, i) => {
          console.log(`  ${i + 1}. ${trade.symbol} (${trade.id})`);
        });
      }
    }

    return;
  }

  console.log(`✅ FOUND ${snapshots.length} SNAPSHOTS TODAY`);
  console.log('');
  console.log('='.repeat(80));
  console.log('');

  // Group by trigger type
  const byTrigger = snapshots.reduce((acc: any, snap) => {
    const trigger = snap.snapshot_trigger || 'unknown';
    if (!acc[trigger]) acc[trigger] = [];
    acc[trigger].push(snap);
    return acc;
  }, {});

  console.log('SNAPSHOTS BY TRIGGER TYPE:');
  Object.keys(byTrigger).forEach(trigger => {
    console.log(`  ${trigger}: ${byTrigger[trigger].length}`);
  });
  console.log('');
  console.log('='.repeat(80));
  console.log('');

  // Show details for each snapshot
  console.log('SNAPSHOT DETAILS:');
  console.log('');

  for (const snapshot of snapshots) {
    const trade = snapshot.trades as any;
    const time = new Date(snapshot.snapshot_time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/New_York'
    });

    console.log(`📊 ${trade.symbol} - ${snapshot.snapshot_trigger.toUpperCase()}`);
    console.log(`   Time: ${time} EST`);
    console.log(`   Stock Price: $${snapshot.current_stock_price?.toFixed(2) || 'N/A'}`);
    console.log(`   Spread Price: $${snapshot.current_spread_price?.toFixed(2) || 'N/A'}`);
    console.log(`   P&L: $${snapshot.unrealized_pnl?.toFixed(2) || 'N/A'} (${snapshot.unrealized_pnl_percent?.toFixed(1) || 'N/A'}%)`);
    console.log(`   Delta: ${snapshot.delta_spread?.toFixed(3) || 'N/A'}`);
    console.log(`   IV Rank: ${snapshot.iv_rank?.toFixed(1) || 'N/A'}`);
    console.log(`   PoP: ${snapshot.probability_of_profit?.toFixed(1) || 'N/A'}%`);
    console.log(`   DTE: ${snapshot.days_to_expiration || 'N/A'} days`);
    console.log(`   Days in Trade: ${snapshot.days_in_trade || 'N/A'} days`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('');

  // Check for snapshots with AI/news data
  console.log('CHECKING FOR AI SUMMARIES & NEWS DATA:');
  console.log('');

  // Get trade monitor cache data (contains news/AI summaries)
  const tradeIds = [...new Set(snapshots.map(s => s.trade_id))];

  const { data: monitorCache, error: cacheError } = await supabase
    .from('trade_monitor_cache')
    .select(`
      trade_id,
      monitor_data,
      created_at,
      trades!inner(symbol)
    `)
    .in('trade_id', tradeIds)
    .gte('created_at', todayStr)
    .lt('created_at', tomorrowStr)
    .order('created_at', { ascending: false });

  if (cacheError) {
    console.error('Error fetching monitor cache:', cacheError);
  } else if (!monitorCache || monitorCache.length === 0) {
    console.log('❌ NO AI SUMMARIES FOUND FOR TODAY');
    console.log('');
    console.log('The daily trade monitoring job may not have run yet.');
    console.log('This job typically runs at 9:00 AM EST on weekdays.');
  } else {
    console.log(`✅ FOUND ${monitorCache.length} AI SUMMARIES/NEWS DATA`);
    console.log('');

    for (const cache of monitorCache) {
      const trade = cache.trades as any;
      const monitorData = cache.monitor_data as any;
      const time = new Date(cache.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York'
      });

      console.log(`📰 ${trade.symbol} - AI Summary`);
      console.log(`   Time: ${time} EST`);

      if (monitorData.ai_summary) {
        console.log(`   Summary: ${monitorData.ai_summary.substring(0, 200)}${monitorData.ai_summary.length > 200 ? '...' : ''}`);
      }

      if (monitorData.current_context) {
        const context = monitorData.current_context;
        if (context.catalysts && context.catalysts.length > 0) {
          console.log(`   Catalysts: ${context.catalysts.length} found`);
        }
        if (context.analyst_activity && context.analyst_activity.length > 0) {
          console.log(`   Analyst Activity: ${context.analyst_activity.length} updates`);
        }
        if (context.news_sentiment) {
          console.log(`   News Sentiment: ${context.news_sentiment.overall || 'N/A'}`);
        }
      }

      if (monitorData.risk_assessment) {
        console.log(`   Risk Level: ${monitorData.risk_assessment.level || 'N/A'}`);
        if (monitorData.risk_assessment.score) {
          console.log(`   Risk Score: ${monitorData.risk_assessment.score}/100`);
        }
      }

      console.log('');
    }
  }

  console.log('='.repeat(80));
  console.log('');
  console.log('✅ EOD SNAPSHOT CHECK COMPLETE');
  console.log('');
}

checkEODSnapshots()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
