// Test script for external market intelligence database
// Verifies connectivity and queries sample data

import 'dotenv/config';
import { checkExternalDatabaseHealth } from '../src/lib/clients/external-supabase';
import { getMarketIntelligenceService } from '../src/lib/services/market-intelligence-service';

async function main() {
  console.log('='.repeat(80));
  console.log('TESTING EXTERNAL MARKET INTELLIGENCE DATABASE');
  console.log('='.repeat(80));
  console.log('');

  // Test 1: Connection health check
  console.log('Test 1: Checking database connection and table counts...');
  console.log('-'.repeat(80));
  const health = await checkExternalDatabaseHealth();

  if (!health.connected) {
    console.error('❌ Failed to connect to external database');
    console.error('   Error:', health.error);
    process.exit(1);
  }

  console.log('✓ Successfully connected to external database');
  console.log('');
  console.log('  Table Counts:');
  console.log(`    Earnings Transcripts:  ${health.stats?.earnings_transcripts.toLocaleString()}`);
  console.log(`    Market News:           ${health.stats?.market_news.toLocaleString()}`);
  console.log(`    General News:          ${health.stats?.news_embeddings.toLocaleString()}`);
  console.log(`    Ticker Sentiment:      ${health.stats?.ticker_sentiment.toLocaleString()}`);
  console.log('');

  // Test 2: Query intelligence for a known symbol (AMD)
  console.log('Test 2: Fetching intelligence for AMD...');
  console.log('-'.repeat(80));
  const intelligenceService = getMarketIntelligenceService();
  const amdIntel = await intelligenceService.getIntelligence('AMD', {
    includeEarnings: true,
    includeNews: true,
    maxEarningsQuarters: 4,
    maxNewsArticles: 10,
    newsMaxAgeDays: 30,
  });

  console.log(`Symbol: ${amdIntel.symbol}`);
  console.log(`Confidence: ${amdIntel.confidence}`);
  console.log(`Data Age: ${amdIntel.data_age_days} days`);
  console.log(`Sources Available: ${amdIntel.sources_available.join(', ')}`);
  console.log('');

  if (amdIntel.earnings) {
    console.log(`  Earnings Intelligence:`);
    console.log(`    Transcripts Found: ${amdIntel.earnings.transcripts.length}`);
    if (amdIntel.earnings.transcripts.length > 0) {
      const latest = amdIntel.earnings.transcripts[0];
      console.log(`    Latest: ${latest.quarter} ${latest.fiscal_year} (${latest.fiscal_date_ending})`);
      console.log(`    Excerpt: ${latest.excerpt.substring(0, 150)}...`);
    }
  } else {
    console.log(`  Earnings Intelligence: None found`);
  }
  console.log('');

  if (amdIntel.news) {
    console.log(`  News Intelligence:`);
    console.log(`    Articles Found: ${amdIntel.news.articles.length}`);
    console.log(`    Aggregate Sentiment: ${amdIntel.news.aggregate_sentiment.label} (${amdIntel.news.aggregate_sentiment.average_score.toFixed(3)})`);
    if (amdIntel.news.articles.length > 0) {
      console.log(`    Recent Articles:`);
      amdIntel.news.articles.slice(0, 3).forEach((article, i) => {
        console.log(`      ${i + 1}. "${article.title}"`);
        console.log(`         Source: ${article.source} | Sentiment: ${article.sentiment_label} (${article.sentiment_score.toFixed(3)})`);
        console.log(`         Published: ${new Date(article.time_published).toLocaleDateString()}`);
      });
    }
  } else {
    console.log(`  News Intelligence: None found`);
  }
  console.log('');

  // Test 3: Try a few more symbols
  console.log('Test 3: Testing multiple symbols...');
  console.log('-'.repeat(80));
  const testSymbols = ['TSLA', 'AAPL', 'NVDA'];

  for (const symbol of testSymbols) {
    const intel = await intelligenceService.getIntelligence(symbol, {
      includeEarnings: true,
      includeNews: true,
      maxEarningsQuarters: 2,
      maxNewsArticles: 5,
      newsMaxAgeDays: 30,
    });

    const earningsCount = intel.earnings?.transcripts.length || 0;
    const newsCount = intel.news?.articles.length || 0;
    const sentiment = intel.news?.aggregate_sentiment.label || 'N/A';

    console.log(`  ${symbol}:`);
    console.log(`    Earnings: ${earningsCount} quarters | News: ${newsCount} articles | Sentiment: ${sentiment}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log('✓ External database connection: OK');
  console.log(`✓ Data available: ${health.stats ? 'Yes' : 'No'}`);
  console.log('✓ Intelligence service: OK');
  console.log('✓ Query functionality: OK');
  console.log('');
  console.log('All tests passed successfully!');
  console.log('');
}

main().catch((error) => {
  console.error('');
  console.error('='.repeat(80));
  console.error('TEST FAILED');
  console.error('='.repeat(80));
  console.error('Error:', error);
  process.exit(1);
});
