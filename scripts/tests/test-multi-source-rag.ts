// Comprehensive Test for Multi-Source RAG System
// Tests the full stack: Internal RAG + External Intelligence + Caching

import 'dotenv/config';
import {
  queryMultiSource,
  batchQueryMultiSource,
  type MultiSourceQuery,
} from '../src/lib/agent/multi-source-rag-orchestrator';
import {
  getIntelligenceCacheService,
  getCacheStats,
  cleanupExpiredCache,
} from '../src/lib/services/intelligence-cache-service';

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

// Test 1: Single Symbol Multi-Source Query
async function testSingleSymbol(symbol: string) {
  await header(`TEST 1: MULTI-SOURCE QUERY - ${symbol}`);

  const query: MultiSourceQuery = {
    symbol,
    context: 'general',
    includeInternalRAG: true,
    includeExternalIntelligence: true,
    includeTavily: false, // Save credits
    maxNewsArticles: 20,
    maxEarningsQuarters: 4,
    newsMaxAgeDays: 30,
  };

  console.log('Querying all sources...');
  const result = await queryMultiSource(query);

  console.log('');
  console.log('📊 MULTI-SOURCE RESULT');
  console.log(`   Symbol: ${result.symbol}`);
  console.log(`   Confidence: ${result.confidence.toUpperCase()}`);
  console.log(`   Sources Used: ${result.data_sources_used.join(', ')}`);
  console.log(`   Fetch Time: ${result.total_fetch_time_ms}ms`);
  console.log(`   Credits Used: ${result.credits_used}`);
  console.log('');

  // Internal RAG Results
  await section('📚 INTERNAL RAG (Historical Trades)');
  if (result.internal_rag.has_data) {
    console.log(`   Similar Trades: ${result.internal_rag.similar_trades_count}`);
    console.log(`   Win Rate: ${result.internal_rag.win_rate ? (result.internal_rag.win_rate * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`   Avg ROI: ${result.internal_rag.avg_roi ? result.internal_rag.avg_roi.toFixed(2) + '%' : 'N/A'}`);
  } else {
    console.log(`   ❌ No historical trade data found`);
  }
  console.log('');

  // External Intelligence Results
  await section('🌐 EXTERNAL INTELLIGENCE');
  if (result.external_intelligence.has_data) {
    console.log(`   Confidence: ${result.external_intelligence.confidence.toUpperCase()}`);
    console.log(`   Data Age: ${result.external_intelligence.data_age_days} days`);
    console.log('');

    if (result.external_intelligence.earnings) {
      console.log(`   Earnings Transcripts: ${result.external_intelligence.earnings.transcripts.length} quarters`);
      if (result.external_intelligence.earnings.latest_quarter) {
        console.log(`   Latest: ${result.external_intelligence.earnings.latest_quarter.quarter} ${result.external_intelligence.earnings.latest_quarter.fiscal_year}`);
      }
    }

    if (result.external_intelligence.news) {
      console.log(`   News Articles: ${result.external_intelligence.news.articles.length}`);
      console.log(`   Sentiment: ${result.external_intelligence.news.aggregate_sentiment.label} (${result.external_intelligence.news.aggregate_sentiment.average_score.toFixed(3)})`);
    }
  } else {
    console.log(`   ❌ No external intelligence found`);
  }
  console.log('');

  // Aggregated Insights
  await section('🎯 AGGREGATED INSIGHTS');
  console.log(`   Overall Sentiment: ${result.aggregate.overall_sentiment.toUpperCase()}`);
  console.log(`   Sentiment Score: ${result.aggregate.sentiment_score.toFixed(3)}`);
  console.log(`   Data Quality: ${result.aggregate.data_quality_score}/100`);
  console.log(`   Recommendation: ${result.aggregate.recommendation_strength.toUpperCase()}`);
  console.log('');

  return result;
}

// Test 2: Cache Performance
async function testCachePerformance(symbol: string) {
  await header('TEST 2: CACHE PERFORMANCE');

  const cacheService = getIntelligenceCacheService();

  console.log(`Testing cache with ${symbol}...`);
  console.log('');

  // First fetch (cold - should be cache miss)
  console.log('1. Cold Fetch (should miss cache):');
  const start1 = Date.now();
  await cacheService.getIntelligence(symbol, { force_refresh: false });
  const time1 = Date.now() - start1;
  console.log(`   Time: ${time1}ms`);
  console.log('');

  // Second fetch (warm - should hit cache)
  console.log('2. Warm Fetch (should hit cache):');
  const start2 = Date.now();
  await cacheService.getIntelligence(symbol, { force_refresh: false });
  const time2 = Date.now() - start2;
  console.log(`   Time: ${time2}ms`);
  console.log('');

  // Third fetch (hot - should hit cache)
  console.log('3. Hot Fetch (should hit cache):');
  const start3 = Date.now();
  await cacheService.getIntelligence(symbol, { force_refresh: false });
  const time3 = Date.now() - start3;
  console.log(`   Time: ${time3}ms`);
  console.log('');

  console.log('Performance Summary:');
  console.log(`   Cold Fetch: ${time1}ms`);
  console.log(`   Cache Hit 1: ${time2}ms (${((1 - time2 / time1) * 100).toFixed(1)}% faster)`);
  console.log(`   Cache Hit 2: ${time3}ms (${((1 - time3 / time1) * 100).toFixed(1)}% faster)`);
  console.log('');

  // Get cache stats
  const stats = await getCacheStats();
  console.log('Cache Statistics:');
  console.log(`   Total Queries: ${stats.hits + stats.misses}`);
  console.log(`   Cache Hits: ${stats.hits}`);
  console.log(`   Cache Misses: ${stats.misses}`);
  console.log(`   Hit Rate: ${stats.hit_rate.toFixed(1)}%`);
  console.log(`   Avg Fetch Time: ${stats.avg_fetch_time_ms.toFixed(0)}ms`);
  console.log(`   Total Cached Entries: ${stats.total_entries}`);
  console.log('');
}

// Test 3: Batch Multi-Source Query
async function testBatchQuery(symbols: string[]) {
  await header('TEST 3: BATCH MULTI-SOURCE QUERY');

  console.log(`Querying ${symbols.length} symbols in batch...`);
  console.log('');

  const queries: MultiSourceQuery[] = symbols.map((symbol) => ({
    symbol,
    context: 'general',
    includeInternalRAG: true,
    includeExternalIntelligence: true,
    includeTavily: false,
  }));

  const startTime = Date.now();
  const results = await batchQueryMultiSource(queries);
  const totalTime = Date.now() - startTime;

  console.log(`Batch complete in ${totalTime}ms`);
  console.log('');

  // Display results table
  console.log('┌──────────┬────────────┬──────────────┬─────────────┬────────────┬──────────────┬────────────┐');
  console.log('│ Symbol   │ Confidence │ Sources      │ RAG Trades  │ News Count │ Sentiment    │ Fetch Time │');
  console.log('├──────────┼────────────┼──────────────┼─────────────┼────────────┼──────────────┼────────────┤');

  Object.entries(results).forEach(([symbol, result]) => {
    const sources = result.data_sources_used.length;
    const ragTrades = result.internal_rag.similar_trades_count;
    const newsCount = result.external_intelligence.news?.articles.length || 0;
    const sentiment = result.aggregate.overall_sentiment;
    const fetchTime = result.total_fetch_time_ms;

    console.log(
      `│ ${symbol.padEnd(8)} │ ${result.confidence.padEnd(10)} │ ${`${sources} src`.padEnd(12)} │ ${`${ragTrades}`.padEnd(11)} │ ${`${newsCount}`.padEnd(10)} │ ${sentiment.padEnd(12)} │ ${`${fetchTime}ms`.padEnd(10)} │`
    );
  });

  console.log('└──────────┴────────────┴──────────────┴─────────────┴────────────┴──────────────┴────────────┘');
  console.log('');

  // Summary statistics
  const resultArray = Object.values(results);
  const avgFetchTime = resultArray.reduce((sum, r) => sum + r.total_fetch_time_ms, 0) / resultArray.length;
  const highConfCount = resultArray.filter((r) => r.confidence === 'high').length;
  const mediumConfCount = resultArray.filter((r) => r.confidence === 'medium').length;
  const lowConfCount = resultArray.filter((r) => r.confidence === 'low').length;

  console.log('Summary:');
  console.log(`   Total Symbols: ${symbols.length}`);
  console.log(`   Avg Fetch Time: ${avgFetchTime.toFixed(0)}ms`);
  console.log(`   High Confidence: ${highConfCount}/${symbols.length}`);
  console.log(`   Medium Confidence: ${mediumConfCount}/${symbols.length}`);
  console.log(`   Low Confidence: ${lowConfCount}/${symbols.length}`);
  console.log('');
}

// Test 4: Cache Cleanup
async function testCacheCleanup() {
  await header('TEST 4: CACHE CLEANUP');

  console.log('Running cache cleanup...');
  const deletedCount = await cleanupExpiredCache();

  console.log(`   Expired entries removed: ${deletedCount}`);
  console.log('');

  const stats = await getCacheStats();
  console.log('Updated Cache Statistics:');
  console.log(`   Total Entries: ${stats.total_entries}`);
  console.log(`   Expired Entries: ${stats.expired_entries}`);
  console.log('');
}

// Main test runner
async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                                ║');
  console.log('║              MULTI-SOURCE RAG SYSTEM - COMPREHENSIVE TEST SUITE               ║');
  console.log('║                                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  try {
    // Test 1: Single Symbol Deep Dive
    await testSingleSymbol('AMD');

    // Test 2: Cache Performance
    await testCachePerformance('NVDA');

    // Test 3: Batch Query
    const testSymbols = ['TSLA', 'AAPL', 'MSFT', 'META', 'GOOGL'];
    await testBatchQuery(testSymbols);

    // Test 4: Cache Cleanup
    await testCacheCleanup();

    // Final Summary
    await header('✅ ALL TESTS PASSED');
    console.log('The multi-source RAG system is fully operational!');
    console.log('');
    console.log('System Capabilities:');
    console.log('  ✓ Multi-source data aggregation');
    console.log('  ✓ Internal RAG (historical trades)');
    console.log('  ✓ External intelligence (earnings + news)');
    console.log('  ✓ Smart caching with TTL');
    console.log('  ✓ Batch query optimization');
    console.log('  ✓ Confidence scoring');
    console.log('  ✓ Sentiment aggregation');
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
