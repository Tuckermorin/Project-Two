/**
 * Quick test to verify Alpha Intelligence data flows to the UI
 * This simulates what happens when the agent runs and returns candidates
 */

import * as dotenv from 'dotenv';
dotenv.config();

async function testUIIntegration() {
  console.log('\n🧪 Testing UI Integration with Alpha Intelligence\n');

  // Test symbols
  const symbols = ['AMD', 'NVDA', 'TSLA'];
  const ipsId = '20edfe58-2e44-4234-96cd-503011577cf4';

  console.log(`📊 Running agent with symbols: ${symbols.join(', ')}\n`);

  try {
    const response = await fetch('http://localhost:3000/api/agent/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbols,
        mode: 'paper',
        ipsId,
        useV3: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log(`✅ Agent completed successfully`);
    console.log(`   Version: ${data.version}`);
    console.log(`   Run ID: ${data.runId}`);
    console.log(`   Candidates: ${data.candidates_total}`);
    console.log(`   Selected: ${data.selected?.length || 0}`);
    console.log(`   Reasoning Decisions: ${data.reasoning_decisions?.length || 0}\n`);

    // Check first candidate for Alpha Intelligence data
    if (data.selected && data.selected.length > 0) {
      const first = data.selected[0];
      console.log(`📈 First Candidate: ${first.symbol}`);
      console.log(`   IPS Score: ${first.ips_score || 'N/A'}`);
      console.log(`   Intelligence Adjustments: ${first.intelligence_adjustments || 'none'}`);

      // Check for News Sentiment
      const newsSentiment = first.general_data?.av_news_sentiment || first.metadata?.av_news_sentiment;
      if (newsSentiment) {
        console.log(`\n📰 News Sentiment Data Found:`);
        console.log(`   Label: ${newsSentiment.sentiment_label}`);
        console.log(`   Score: ${newsSentiment.average_score?.toFixed(2)}`);
        console.log(`   Articles: ${newsSentiment.count} (${newsSentiment.positive}+ / ${newsSentiment.negative}-)`);
        console.log(`   ✅ NEWS DATA WILL DISPLAY IN UI`);
      } else {
        console.log(`\n⚠️  No News Sentiment data in candidate`);
      }

      // Check for Insider Activity
      const insiderActivity = first.general_data?.insider_activity || first.metadata?.insider_activity;
      if (insiderActivity) {
        console.log(`\n👔 Insider Activity Data Found:`);
        console.log(`   Transactions: ${insiderActivity.transaction_count}`);
        console.log(`   Buy/Sell Ratio: ${insiderActivity.buy_ratio?.toFixed(2)}`);
        console.log(`   Activity Trend: ${insiderActivity.activity_trend}`);
        console.log(`   ✅ INSIDER DATA WILL DISPLAY IN UI`);
      } else {
        console.log(`\n⚠️  No Insider Activity data in candidate`);
      }

      // Check contract legs for tile display
      if (first.contract_legs && first.contract_legs.length > 0) {
        const shortLeg = first.contract_legs.find(l => l.type === 'SELL');
        const longLeg = first.contract_legs.find(l => l.type === 'BUY');
        console.log(`\n📊 Trade Structure:`);
        console.log(`   Short Strike: $${shortLeg?.strike || 'N/A'}`);
        console.log(`   Long Strike: $${longLeg?.strike || 'N/A'}`);
        console.log(`   Expiry: ${shortLeg?.expiry || 'N/A'}`);
        console.log(`   ✅ TILE DATA COMPLETE`);
      }

    } else {
      console.log(`⚠️  No candidates returned - may need to adjust filters`);
    }

    console.log(`\n✨ UI Integration Test Complete\n`);
    console.log(`🌐 Open http://localhost:3000 to see the results in the UI`);

  } catch (error: any) {
    console.error(`❌ Test failed:`, error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log(`\n💡 Make sure dev server is running: npm run dev`);
    }
  }
}

testUIIntegration();
