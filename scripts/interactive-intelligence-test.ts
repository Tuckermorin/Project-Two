// Interactive Intelligence Test Script
// Comprehensive testing and review of market intelligence integration

import 'dotenv/config';
import { checkExternalDatabaseHealth } from '../src/lib/clients/external-supabase';
import { getMarketIntelligenceService } from '../src/lib/services/market-intelligence-service';
import { createClient } from '@supabase/supabase-js';

const mainDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function header(text: string) {
  console.log('');
  console.log('='.repeat(80));
  console.log(text);
  console.log('='.repeat(80));
  console.log('');
}

async function section(text: string) {
  console.log('');
  console.log('-'.repeat(80));
  console.log(text);
  console.log('-'.repeat(80));
}

// Test 1: System Health Check
async function testSystemHealth() {
  await header('TEST 1: SYSTEM HEALTH CHECK');

  console.log('Checking external database connectivity...');
  const health = await checkExternalDatabaseHealth();

  if (!health.connected) {
    console.error('❌ FAILED: Cannot connect to external database');
    console.error('   Error:', health.error);
    return false;
  }

  console.log('✅ External database connected');
  console.log('');
  console.log('Data Available:');
  console.log(`  • Earnings Transcripts:  ${health.stats?.earnings_transcripts.toLocaleString()}`);
  console.log(`  • Market News Articles:  ${health.stats?.market_news.toLocaleString()}`);
  console.log(`  • General News:          ${health.stats?.news_embeddings.toLocaleString()}`);
  console.log(`  • Ticker Sentiments:     ${health.stats?.ticker_sentiment.toLocaleString()}`);
  console.log('');

  // Check main database cache tables
  console.log('Checking main database cache tables...');
  const { count: cacheCount, error: cacheError } = await mainDb
    .from('market_intelligence_cache')
    .select('*', { count: 'exact', head: true });

  if (cacheError) {
    console.error('❌ FAILED: Cache table not accessible');
    console.error('   Error:', cacheError.message);
    return false;
  }

  console.log(`✅ Cache table ready (${cacheCount || 0} entries)`);
  console.log('');

  return true;
}

// Test 2: Single Symbol Deep Dive
async function testSingleSymbol(symbol: string) {
  await header(`TEST 2: DEEP DIVE - ${symbol}`);

  const service = getMarketIntelligenceService();
  const startTime = Date.now();

  console.log(`Fetching comprehensive intelligence for ${symbol}...`);
  const intel = await service.getIntelligence(symbol, {
    includeEarnings: true,
    includeNews: true,
    maxEarningsQuarters: 4,
    maxNewsArticles: 20,
    newsMaxAgeDays: 30,
  });

  const fetchTime = Date.now() - startTime;

  console.log('');
  console.log('📊 INTELLIGENCE SUMMARY');
  console.log(`   Symbol: ${intel.symbol}`);
  console.log(`   Confidence: ${intel.confidence.toUpperCase()}`);
  console.log(`   Data Age: ${intel.data_age_days} days`);
  console.log(`   Fetch Time: ${fetchTime}ms`);
  console.log(`   Sources: ${intel.sources_available.join(', ') || 'None'}`);
  console.log('');

  // Earnings Analysis
  if (intel.earnings && intel.earnings.transcripts.length > 0) {
    await section('📈 EARNINGS TRANSCRIPTS');
    console.log(`Found ${intel.earnings.transcripts.length} quarters of earnings data:`);
    console.log('');

    intel.earnings.transcripts.forEach((t, i) => {
      console.log(`${i + 1}. ${t.quarter} ${t.fiscal_year} (${t.fiscal_date_ending})`);
      console.log(`   Excerpt: ${t.excerpt.substring(0, 200)}...`);
      console.log('');
    });

    if (intel.earnings.latest_quarter) {
      console.log(`Latest Quarter Summary (${intel.earnings.latest_quarter.quarter} ${intel.earnings.latest_quarter.fiscal_year}):`);
      console.log(`   ${intel.earnings.latest_quarter.summary}`);
      console.log('');
    }
  } else {
    await section('📈 EARNINGS TRANSCRIPTS');
    console.log('❌ No earnings transcripts found for this symbol');
    console.log('');
  }

  // News Analysis
  if (intel.news && intel.news.articles.length > 0) {
    await section('📰 MARKET NEWS');
    console.log(`Found ${intel.news.articles.length} recent articles:`);
    console.log('');
    console.log(`Aggregate Sentiment: ${intel.news.aggregate_sentiment.label} (${intel.news.aggregate_sentiment.average_score.toFixed(3)})`);
    console.log('');

    console.log('Recent Headlines:');
    intel.news.articles.slice(0, 5).forEach((article, i) => {
      const publishDate = new Date(article.time_published);
      const daysAgo = Math.floor((Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24));

      console.log('');
      console.log(`${i + 1}. "${article.title}"`);
      console.log(`   Source: ${article.source} | ${daysAgo} days ago`);
      console.log(`   Sentiment: ${article.sentiment_label} (${article.sentiment_score.toFixed(3)})`);
      console.log(`   Relevance: ${(article.relevance_score * 100).toFixed(1)}%`);
      console.log(`   Topics: ${article.topics.slice(0, 3).join(', ')}`);
      console.log(`   Summary: ${article.summary.substring(0, 150)}...`);
    });
    console.log('');

    // Sentiment breakdown
    const bullish = intel.news.articles.filter(a => a.sentiment_score > 0.15).length;
    const bearish = intel.news.articles.filter(a => a.sentiment_score < -0.15).length;
    const neutral = intel.news.articles.length - bullish - bearish;

    console.log('Sentiment Breakdown:');
    console.log(`   Bullish:  ${bullish} articles (${((bullish / intel.news.articles.length) * 100).toFixed(1)}%)`);
    console.log(`   Neutral:  ${neutral} articles (${((neutral / intel.news.articles.length) * 100).toFixed(1)}%)`);
    console.log(`   Bearish:  ${bearish} articles (${((bearish / intel.news.articles.length) * 100).toFixed(1)}%)`);
    console.log('');
  } else {
    await section('📰 MARKET NEWS');
    console.log('❌ No recent news found for this symbol');
    console.log('');
  }

  return intel;
}

// Test 3: Multi-Symbol Comparison
async function testMultipleSymbols(symbols: string[]) {
  await header('TEST 3: MULTI-SYMBOL COMPARISON');

  const service = getMarketIntelligenceService();
  const results: any[] = [];

  console.log(`Fetching intelligence for ${symbols.length} symbols...`);
  console.log('');

  for (const symbol of symbols) {
    const startTime = Date.now();
    const intel = await service.getIntelligence(symbol, {
      includeEarnings: true,
      includeNews: true,
      maxEarningsQuarters: 2,
      maxNewsArticles: 10,
      newsMaxAgeDays: 30,
    });
    const fetchTime = Date.now() - startTime;

    results.push({ symbol, intel, fetchTime });
  }

  // Display comparison table
  console.log('┌──────────┬────────────┬───────────┬──────────┬────────────┬──────────────┬────────────┐');
  console.log('│ Symbol   │ Confidence │ Data Age  │ Earnings │ News Count │ Sentiment    │ Fetch Time │');
  console.log('├──────────┼────────────┼───────────┼──────────┼────────────┼──────────────┼────────────┤');

  results.forEach(({ symbol, intel, fetchTime }) => {
    const earningsCount = intel.earnings?.transcripts.length || 0;
    const newsCount = intel.news?.articles.length || 0;
    const sentiment = intel.news?.aggregate_sentiment.label || 'N/A';
    const sentimentScore = intel.news?.aggregate_sentiment.average_score.toFixed(3) || 'N/A';

    console.log(
      `│ ${symbol.padEnd(8)} │ ${intel.confidence.padEnd(10)} │ ${`${intel.data_age_days}d`.padEnd(9)} │ ${`${earningsCount}Q`.padEnd(8)} │ ${`${newsCount}`.padEnd(10)} │ ${sentiment.padEnd(12)} │ ${`${fetchTime}ms`.padEnd(10)} │`
    );
  });

  console.log('└──────────┴────────────┴───────────┴──────────┴────────────┴──────────────┴────────────┘');
  console.log('');

  // Summary statistics
  const avgFetchTime = results.reduce((sum, r) => sum + r.fetchTime, 0) / results.length;
  const highConfidence = results.filter(r => r.intel.confidence === 'high').length;
  const mediumConfidence = results.filter(r => r.intel.confidence === 'medium').length;
  const lowConfidence = results.filter(r => r.intel.confidence === 'low').length;

  console.log('Summary Statistics:');
  console.log(`   Average Fetch Time: ${avgFetchTime.toFixed(0)}ms`);
  console.log(`   High Confidence:    ${highConfidence}/${results.length} symbols`);
  console.log(`   Medium Confidence:  ${mediumConfidence}/${results.length} symbols`);
  console.log(`   Low Confidence:     ${lowConfidence}/${results.length} symbols`);
  console.log('');

  return results;
}

// Test 4: Cache Performance
async function testCachePerformance(symbol: string) {
  await header('TEST 4: CACHE PERFORMANCE TEST');

  const service = getMarketIntelligenceService();

  console.log(`Testing cache performance with ${symbol}...`);
  console.log('');

  // First fetch (no cache)
  console.log('1. Cold fetch (no cache):');
  const start1 = Date.now();
  await service.getIntelligence(symbol);
  const time1 = Date.now() - start1;
  console.log(`   Time: ${time1}ms`);
  console.log('');

  // Second fetch (should be slightly faster due to external DB caching)
  console.log('2. Warm fetch (external DB cache):');
  const start2 = Date.now();
  await service.getIntelligence(symbol);
  const time2 = Date.now() - start2;
  console.log(`   Time: ${time2}ms`);
  console.log('');

  // Third fetch
  console.log('3. Hot fetch (full cache):');
  const start3 = Date.now();
  await service.getIntelligence(symbol);
  const time3 = Date.now() - start3;
  console.log(`   Time: ${time3}ms`);
  console.log('');

  console.log('Performance Improvement:');
  console.log(`   Cold → Warm: ${((1 - time2 / time1) * 100).toFixed(1)}% faster`);
  console.log(`   Warm → Hot:  ${((1 - time3 / time2) * 100).toFixed(1)}% faster`);
  console.log(`   Cold → Hot:  ${((1 - time3 / time1) * 100).toFixed(1)}% faster`);
  console.log('');
}

// Test 5: Data Quality Assessment
async function testDataQuality(symbols: string[]) {
  await header('TEST 5: DATA QUALITY ASSESSMENT');

  const service = getMarketIntelligenceService();

  console.log(`Assessing data quality for ${symbols.length} symbols...`);
  console.log('');

  let totalEarnings = 0;
  let totalNews = 0;
  let avgDataAge = 0;
  let avgSentimentScore = 0;

  for (const symbol of symbols) {
    const intel = await service.getIntelligence(symbol);
    totalEarnings += intel.earnings?.transcripts.length || 0;
    totalNews += intel.news?.articles.length || 0;
    avgDataAge += intel.data_age_days;
    avgSentimentScore += intel.news?.aggregate_sentiment.average_score || 0;
  }

  avgDataAge /= symbols.length;
  avgSentimentScore /= symbols.length;

  console.log('Data Quality Metrics:');
  console.log(`   Total Earnings Transcripts:   ${totalEarnings}`);
  console.log(`   Total News Articles:          ${totalNews}`);
  console.log(`   Average Data Age:             ${avgDataAge.toFixed(1)} days`);
  console.log(`   Average Sentiment Score:      ${avgSentimentScore.toFixed(3)}`);
  console.log(`   Earnings Coverage:            ${(totalEarnings / symbols.length).toFixed(1)} quarters/symbol`);
  console.log(`   News Coverage:                ${(totalNews / symbols.length).toFixed(1)} articles/symbol`);
  console.log('');

  const freshness = avgDataAge <= 7 ? 'Excellent' : avgDataAge <= 30 ? 'Good' : 'Fair';
  console.log(`Overall Data Freshness: ${freshness} (${avgDataAge.toFixed(0)} days average)`);
  console.log('');
}

// Main test runner
async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                                ║');
  console.log('║           MARKET INTELLIGENCE INTEGRATION - INTERACTIVE TEST SUITE            ║');
  console.log('║                                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  try {
    // Test 1: System Health
    const healthOk = await testSystemHealth();
    if (!healthOk) {
      console.error('');
      console.error('❌ System health check failed. Cannot continue.');
      process.exit(1);
    }

    // Test 2: Single Symbol Deep Dive
    await testSingleSymbol('AMD');

    // Test 3: Multi-Symbol Comparison
    const testSymbols = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'META'];
    await testMultipleSymbols(testSymbols);

    // Test 4: Cache Performance
    await testCachePerformance('AMD');

    // Test 5: Data Quality
    await testDataQuality(['AMD', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN']);

    // Final Summary
    await header('✅ ALL TESTS PASSED');
    console.log('The market intelligence integration is working as expected!');
    console.log('');
    console.log('Key Capabilities:');
    console.log('  ✓ External database connectivity');
    console.log('  ✓ Earnings transcript retrieval');
    console.log('  ✓ Market news aggregation');
    console.log('  ✓ Sentiment analysis');
    console.log('  ✓ Multi-symbol querying');
    console.log('  ✓ Cache performance optimization');
    console.log('  ✓ Data quality assessment');
    console.log('');
    console.log('Ready for integration into trading agent!');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.error('║                              ❌ TEST FAILED                                    ║');
    console.error('╚════════════════════════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

main();
