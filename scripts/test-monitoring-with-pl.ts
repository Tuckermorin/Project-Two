/**
 * Test script to verify P/L-based exit recommendations in active trade monitoring
 *
 * This tests that trades showing high P/L percentages now get proper exit recommendations
 */

import { monitorActiveTrade } from '@/lib/agent/active-trade-monitor';

async function testMonitoringWithPL() {
  console.log('Testing Active Trade Monitoring with P/L Integration\n');
  console.log('='.repeat(80));

  // Get trade ID from command line or use a default
  const tradeId = process.argv[2];

  if (!tradeId) {
    console.error('\nUsage: npx tsx scripts/test-monitoring-with-pl.ts <trade-id>');
    console.error('\nExample: npx tsx scripts/test-monitoring-with-pl.ts 50e94e29-ce13-410a-a6ac-0e0173df0727');
    process.exit(1);
  }

  try {
    console.log(`\nMonitoring trade: ${tradeId}\n`);

    const result = await monitorActiveTrade(tradeId, {
      daysBack: 1,
      useCache: false,
      forceRefresh: true,
    });

    console.log('\n📊 MONITORING RESULT');
    console.log('='.repeat(80));
    console.log(`Symbol: ${result.symbol}`);
    console.log(`Status: ${result.status}`);
    console.log(`Days Held: ${result.days_held}`);

    if (result.current_pl) {
      console.log('\n💰 PROFIT/LOSS ANALYSIS');
      console.log('-'.repeat(80));
      console.log(`Current P/L: ${result.current_pl.pl_percent.toFixed(2)}% ($${result.current_pl.pl_dollar.toFixed(2)})`);
      console.log(`Spread Close Price: $${result.current_pl.current_spread_price.toFixed(2)}`);
      console.log(`Should Exit: ${result.current_pl.should_exit ? '✅ YES' : '❌ NO'}`);
      if (result.current_pl.should_exit) {
        console.log(`Exit Type: ${result.current_pl.exit_type?.toUpperCase()}`);
        console.log(`Exit Reason: ${result.current_pl.exit_reason}`);
      }
    } else {
      console.log('\n⚠️ P/L data not available (missing trade parameters)');
    }

    console.log('\n🚨 RISK ALERTS');
    console.log('-'.repeat(80));
    console.log(`Risk Level: ${result.risk_alerts.level.toUpperCase()}`);
    console.log(`Total Alerts: ${result.risk_alerts.alerts.length}`);

    if (result.risk_alerts.alerts.length > 0) {
      console.log('\nAlerts:');
      result.risk_alerts.alerts.forEach((alert, i) => {
        console.log(`  ${i + 1}. [${alert.severity.toUpperCase()}] ${alert.type}`);
        console.log(`     ${alert.message}`);
      });
    }

    console.log('\n📋 RECOMMENDATIONS');
    console.log('-'.repeat(80));
    if (result.recommendations.length > 0) {
      result.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    } else {
      console.log('No specific recommendations');
    }

    console.log('\n🤖 AI SUMMARY');
    console.log('-'.repeat(80));
    console.log(result.ai_summary);

    console.log('\n💳 CREDITS USED');
    console.log('-'.repeat(80));
    console.log(`Total Credits: ${result.credits_used}`);
    console.log(`Cached Results: ${result.cached_results}`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test completed successfully!\n');

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testMonitoringWithPL();
