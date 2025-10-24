/**
 * Test Script: Verify Alpha Intelligence Integration
 *
 * This script tests that NEWS_SENTIMENT and INSIDER_TRANSACTIONS
 * are properly integrated and returning data.
 *
 * Usage: npx tsx scripts/test-alpha-intelligence.ts
 */

import * as dotenv from 'dotenv';
import { getAlphaVantageClient } from '../src/lib/api/alpha-vantage';

// Load environment variables
dotenv.config();

async function testAlphaIntelligence() {
  console.log('='.repeat(80));
  console.log('ALPHA INTELLIGENCE INTEGRATION TEST');
  console.log('='.repeat(80));
  console.log('');

  const testSymbols = ['AMD', 'NVDA', 'TSLA'];
  const avClient = getAlphaVantageClient();

  for (const symbol of testSymbols) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Testing: ${symbol}`);
    console.log('─'.repeat(80));

    try {
      // Test NEWS_SENTIMENT
      console.log('\n📰 NEWS SENTIMENT:');
      const newsSentiment = await avClient.getNewsSentiment(symbol, 10, {
        topics: ['earnings', 'financial_markets', 'technology']
      });

      if (newsSentiment && newsSentiment.count > 0) {
        console.log(`  ✅ Fetched ${newsSentiment.count} articles`);
        console.log(`  📊 Sentiment: ${newsSentiment.sentiment_label} (${newsSentiment.average_score?.toFixed(2)})`);
        console.log(`  📈 Articles: ${newsSentiment.positive} positive, ${newsSentiment.negative} negative, ${newsSentiment.neutral} neutral`);
        console.log(`  🎯 Avg Relevance: ${newsSentiment.avg_relevance?.toFixed(2)}`);

        if (newsSentiment.topic_sentiment && Object.keys(newsSentiment.topic_sentiment).length > 0) {
          console.log('  📑 Topic Sentiment:');
          Object.entries(newsSentiment.topic_sentiment).slice(0, 3).forEach(([topic, score]) => {
            console.log(`     - ${topic}: ${(score as number).toFixed(2)}`);
          });
        }

        // Sample article
        if (newsSentiment.raw_articles && newsSentiment.raw_articles.length > 0) {
          const article = newsSentiment.raw_articles[0];
          console.log(`  📄 Sample Article: "${article.title?.substring(0, 80)}..."`);
        }
      } else {
        console.log('  ⚠️  No news sentiment data returned');
      }

      // Wait 1 second to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test INSIDER_TRANSACTIONS
      console.log('\n👔 INSIDER TRANSACTIONS:');
      const insiderData = await avClient.getInsiderTransactions(symbol);

      if (insiderData && insiderData.transaction_count > 0) {
        console.log(`  ✅ Fetched ${insiderData.transaction_count} transactions (last 90 days)`);
        console.log(`  📊 Buys: ${insiderData.acquisition_count}, Sells: ${insiderData.disposal_count}`);
        console.log(`  📈 Buy/Sell Ratio: ${insiderData.buy_ratio.toFixed(2)}`);
        console.log(`  📉 Activity Trend: ${insiderData.activity_trend > 0 ? '📈 Bullish' : insiderData.activity_trend < 0 ? '📉 Bearish' : '➡️  Neutral'} (${insiderData.activity_trend.toFixed(2)})`);
        console.log(`  💰 Net Shares: ${insiderData.net_shares.toFixed(0)}`);
        console.log(`  💵 Net Value: $${insiderData.net_value.toFixed(2)}`);

        // Sample transaction
        if (insiderData.transactions && insiderData.transactions.length > 0) {
          const trans = insiderData.transactions[0];
          console.log(`  📋 Recent Transaction:`);
          console.log(`     ${trans.executive_name} (${trans.executive_title})`);
          console.log(`     ${trans.acquisition_or_disposal === 'A' ? '🟢 BUY' : '🔴 SELL'} ${Number(trans.shares).toFixed(0)} shares @ $${Number(trans.share_price).toFixed(2)}`);
          console.log(`     Date: ${trans.transaction_date}`);
        }
      } else {
        console.log('  ⚠️  No insider transaction data (may be normal for some stocks)');
      }

      // Interpretation
      console.log('\n🎯 INTERPRETATION:');
      const sentiment = newsSentiment?.average_score || 0;
      const buyRatio = insiderData?.buy_ratio || 0;

      if (sentiment > 0.3 && buyRatio > 1.5) {
        console.log('  ✅ STRONG BUY SIGNAL: Positive news + Insider buying');
      } else if (sentiment < -0.3 && buyRatio < 0.5) {
        console.log('  ⛔ STRONG SELL SIGNAL: Negative news + Insider selling');
      } else if (Math.abs(sentiment) > 0.5 && Math.abs(buyRatio - 1.0) > 0.5) {
        console.log('  ⚠️  DIVERGENCE: News sentiment and insider activity conflict');
      } else {
        console.log('  ℹ️  Mixed or neutral signals');
      }

      // Wait between symbols to respect rate limits
      if (symbol !== testSymbols[testSymbols.length - 1]) {
        console.log('\n⏳ Waiting 2 seconds before next symbol...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error: any) {
      console.error(`\n❌ ERROR testing ${symbol}:`, error.message);
      if (error.message.includes('rate limit')) {
        console.log('⚠️  Rate limit hit. Waiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
  console.log('\n✅ If you see sentiment scores and insider data above, integration is working!');
  console.log('✅ This data will now appear in:');
  console.log('   - Agent console logs when running analysis');
  console.log('   - Trade metadata when trades are created');
  console.log('   - RAG embeddings for learning');
  console.log('\n📊 Next: Run the agent with your watchlist to see it in action!\n');
}

// Run the test
testAlphaIntelligence().catch(console.error);
