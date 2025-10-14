// Script to manually trigger daily trade monitoring (AI summaries & news)
// Usage: npx tsx scripts/trigger-daily-monitoring.ts

import dotenv from 'dotenv';
import { monitorAllActiveTrades } from '../src/lib/agent/active-trade-monitor';

dotenv.config();

async function triggerDailyMonitoring() {
  console.log('='.repeat(80));
  console.log('TRIGGERING DAILY TRADE MONITORING');
  console.log('='.repeat(80));
  console.log('');
  console.log('This will:');
  console.log('  1. Fetch news and analyst activity for each active trade');
  console.log('  2. Generate AI risk assessments');
  console.log('  3. Create daily summaries with market context');
  console.log('  4. Cache results for quick access');
  console.log('');
  console.log('Note: This uses Tavily API credits (~100 credits with caching)');
  console.log('');
  console.log('Starting monitoring...');
  console.log('');

  try {
    const userId = process.env.NEXT_PUBLIC_DEFAULT_USER_ID;

    if (!userId) {
      console.error('ERROR: NEXT_PUBLIC_DEFAULT_USER_ID not set in .env');
      process.exit(1);
    }

    const result = await monitorAllActiveTrades(userId, {
      forceRefresh: false, // Use cache when available to save credits
      daysBack: 7, // Look back 7 days for news
    });

    console.log('');
    console.log('='.repeat(80));
    console.log('MONITORING COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log(`Trades monitored: ${result.results.length}`);
    console.log(`Tavily credits used: ${result.total_credits_used}`);
    console.log('');

    // Show risk summary
    if (result.risk_summary) {
      console.log('RISK SUMMARY:');
      console.log(`  Critical: ${result.risk_summary.critical || 0}`);
      console.log(`  High: ${result.risk_summary.high || 0}`);
      console.log(`  Medium: ${result.risk_summary.medium || 0}`);
      console.log(`  Low: ${result.risk_summary.low || 0}`);
      console.log('');
    }

    // Show individual trade summaries
    console.log('TRADE SUMMARIES:');
    console.log('');

    for (const trade of result.results) {
      console.log(`📊 ${trade.symbol} - ${trade.status.toUpperCase()}`);
      console.log(`   Days held: ${trade.days_held}`);

      if (trade.ai_summary) {
        console.log(`   AI Summary: ${trade.ai_summary.substring(0, 150)}${trade.ai_summary.length > 150 ? '...' : ''}`);
      }

      if (trade.risk_assessment) {
        console.log(`   Risk: ${trade.risk_assessment.level} (${trade.risk_assessment.score}/100)`);
        if (trade.risk_assessment.key_risks && trade.risk_assessment.key_risks.length > 0) {
          console.log(`   Key Risks: ${trade.risk_assessment.key_risks.slice(0, 2).join(', ')}`);
        }
      }

      if (trade.current_context) {
        const ctx = trade.current_context;
        if (ctx.catalysts && ctx.catalysts.length > 0) {
          console.log(`   Catalysts: ${ctx.catalysts.length} found`);
        }
        if (ctx.analyst_activity && ctx.analyst_activity.length > 0) {
          console.log(`   Analyst Activity: ${ctx.analyst_activity.length} updates`);
        }
      }

      console.log('');
    }

    console.log('='.repeat(80));
    console.log('');
    console.log('✅ Daily monitoring complete!');
    console.log('');
    console.log('Run check-eod-snapshots.ts again to see the AI summaries.');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('ERROR during monitoring:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

triggerDailyMonitoring()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
