// Test Live Market Intelligence Integration
// Tests the new live Alpha Vantage news/sentiment integration

import * as dotenv from 'dotenv';
dotenv.config();

import { getLiveMarketIntelligenceService } from '../src/lib/services/live-market-intelligence-service';
import { getTradeContextEnrichmentService, type TradeCandidate } from '../src/lib/services/trade-context-enrichment-service';
import { getEnhancedTradeRecommendationService } from '../src/lib/services/enhanced-trade-recommendation-service';

async function main() {
  console.log('='.repeat(80));
  console.log('TESTING LIVE MARKET INTELLIGENCE INTEGRATION');
  console.log('='.repeat(80));

  // Check environment variables
  console.log('\n[ENV CHECK] Verifying environment variables...');
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`  Alpha Vantage API Key: ${alphaKey ? '✓ Set' : '✗ Missing'}`);
  console.log(`  Supabase URL: ${supabaseUrl ? '✓ Set' : '✗ Missing'}`);
  console.log(`  Supabase Service Role Key: ${supabaseKey ? '✓ Set' : '✗ Missing'}`);

  if (!alphaKey || !supabaseUrl || !supabaseKey) {
    console.error('\n✗ Missing required environment variables. Please check .env file.');
    process.exit(1);
  }

  const testSymbol = 'NVDA'; // Use a high-volume stock with lots of news

  // Test 1: Direct Live Intelligence Service
  console.log('\n\n[TEST 1] Testing Live Market Intelligence Service directly...\n');
  try {
    const liveService = getLiveMarketIntelligenceService();
    const liveIntel = await liveService.getLiveIntelligence(testSymbol, {
      includeNews: true,
      includeInsiderActivity: false,
      newsLimit: 20,
      useCache: false, // Force fresh fetch for testing
    });

    console.log(`✓ Live Intelligence fetched for ${testSymbol}`);
    console.log(`  Has News: ${liveIntel.data_quality.has_news}`);
    console.log(`  News Articles: ${liveIntel.news_sentiment?.articles.length || 0}`);
    if (liveIntel.news_sentiment) {
      console.log(`  Overall Sentiment: ${liveIntel.news_sentiment.aggregate_sentiment.label}`);
      console.log(`  Sentiment Score: ${liveIntel.news_sentiment.aggregate_sentiment.average_score.toFixed(3)}`);
      console.log(`  Bullish/Neutral/Bearish: ${liveIntel.news_sentiment.aggregate_sentiment.bullish_count}/${liveIntel.news_sentiment.aggregate_sentiment.neutral_count}/${liveIntel.news_sentiment.aggregate_sentiment.bearish_count}`);

      console.log(`\n  Recent Headlines:`);
      liveIntel.news_sentiment.articles.slice(0, 3).forEach((article, idx) => {
        const tickerSentiment = article.ticker_sentiment.find(ts => ts.ticker === testSymbol);
        console.log(`    ${idx + 1}. ${article.title.substring(0, 80)}...`);
        console.log(`       Source: ${article.source} | ${new Date(article.time_published).toLocaleString()}`);
        console.log(`       Sentiment: ${tickerSentiment?.ticker_sentiment_label || 'N/A'} (${tickerSentiment?.ticker_sentiment_score || 'N/A'})`);
      });
    }
    console.log(`  Data Quality: ${liveIntel.data_quality.overall_confidence}`);
  } catch (error: any) {
    console.error(`✗ Test 1 failed: ${error.message}`);
  }

  // Test 2: Trade Context Enrichment with Live News
  console.log('\n\n[TEST 2] Testing Trade Context Enrichment with Live News...\n');
  try {
    const enrichmentService = getTradeContextEnrichmentService();

    // Create a sample trade candidate
    const candidate: TradeCandidate = {
      symbol: testSymbol,
      strategy_type: 'put_credit_spread',
      short_strike: 130,
      long_strike: 125,
      contract_type: 'put',
      expiration_date: '2025-11-21',
      dte: 30,
      credit_received: 0.85,
      delta: -0.15,
      iv_rank: 65,
      estimated_pop: 0.85,
      composite_score: 0,
      yield_score: 0,
      ips_score: 0,
    };

    const enrichedContext = await enrichmentService.enrichTradeCandidate(
      candidate,
      '20edfe58-2e44-4234-96cd-503011577cf4', // Sample IPS ID
      {
        includeExternalIntelligence: true,
        includeInternalRAG: false, // Skip for faster test
        includeTavily: false, // Skip for faster test
        includeLiveNews: true, // ENABLE LIVE NEWS
        includeHistoricalPerformance: true,
        includeSimilarTrades: false, // Skip for faster test
      }
    );

    console.log(`✓ Trade context enriched for ${testSymbol}`);
    console.log(`  Data Quality:`);
    console.log(`    - External Intelligence: ${enrichedContext.data_quality.has_external_intelligence}`);
    console.log(`    - Live News: ${enrichedContext.data_quality.has_live_news}`);
    console.log(`    - Historical Trades: ${enrichedContext.data_quality.has_historical_trades}`);
    console.log(`    - Overall Confidence: ${enrichedContext.data_quality.overall_confidence}`);

    if (enrichedContext.live_market_intelligence?.news_sentiment) {
      const liveNews = enrichedContext.live_market_intelligence.news_sentiment;
      console.log(`  Live News Data:`);
      console.log(`    - Articles: ${liveNews.articles.length}`);
      console.log(`    - Sentiment: ${liveNews.aggregate_sentiment.label} (${liveNews.aggregate_sentiment.average_score.toFixed(3)})`);
    }
  } catch (error: any) {
    console.error(`✗ Test 2 failed: ${error.message}`);
  }

  // Test 3: Full AI-Enhanced Recommendation with Live News
  console.log('\n\n[TEST 3] Testing Full AI-Enhanced Recommendation with Live News...\n');
  try {
    const recommendationService = getEnhancedTradeRecommendationService();

    const candidate: TradeCandidate = {
      symbol: testSymbol,
      strategy_type: 'put_credit_spread',
      short_strike: 130,
      long_strike: 125,
      contract_type: 'put',
      expiration_date: '2025-11-21',
      dte: 30,
      credit_received: 0.85,
      delta: -0.15,
      iv_rank: 65,
      estimated_pop: 0.85,
      composite_score: 0,
      yield_score: 0,
      ips_score: 0,
    };

    const evaluation = await recommendationService.getRecommendation({
      candidate,
      ips_id: '20edfe58-2e44-4234-96cd-503011577cf4',
      user_id: 'test-user-123',
      options: {
        save_evaluation: false, // Don't save during testing
        include_external_intelligence: true,
        include_internal_rag: false,
        include_tavily: false,
        include_live_news: true, // ENABLE LIVE NEWS
      },
    });

    console.log(`✓ AI-Enhanced recommendation generated for ${testSymbol}`);
    console.log(`  Final Recommendation: ${evaluation.final_recommendation}`);
    console.log(`  Composite Score: ${evaluation.weighted_score.composite_score.toFixed(2)}/100`);
    console.log(`  Weighting: ${(evaluation.weighted_score.ips_weight * 100).toFixed(0)}% IPS / ${(evaluation.weighted_score.ai_weight * 100).toFixed(0)}% AI`);
    console.log(`  Weighting Rationale: ${evaluation.weighted_score.weighting_rationale}`);
    console.log(`  Confidence: ${evaluation.weighted_score.confidence_level}`);
    console.log(`\n  AI Evaluation:`);
    console.log(`    - Recommendation: ${evaluation.ai_evaluation.recommendation}`);
    console.log(`    - AI Score: ${evaluation.ai_evaluation.ai_score.toFixed(2)}/100`);
    console.log(`    - AI Confidence: ${evaluation.ai_evaluation.confidence}`);
    console.log(`    - Overall Sentiment: ${evaluation.ai_evaluation.sentiment_analysis.overall}`);
    console.log(`    - News Sentiment: ${evaluation.ai_evaluation.sentiment_analysis.news_sentiment.toFixed(3)}`);
    console.log(`\n  Decision Breakdown:`);
    console.log(`    ${evaluation.explainability.decision_breakdown}`);
    console.log(`\n  Key Factors:`);
    evaluation.explainability.key_decision_factors.forEach((factor, idx) => {
      console.log(`    ${idx + 1}. ${factor}`);
    });
  } catch (error: any) {
    console.error(`✗ Test 3 failed: ${error.message}`);
  }

  // Test 4: Cache Testing
  console.log('\n\n[TEST 4] Testing Live News Cache...\n');
  try {
    const liveService = getLiveMarketIntelligenceService();

    // First fetch (should hit API)
    console.log('  Fetching live intelligence (should call API)...');
    const start1 = Date.now();
    const intel1 = await liveService.getLiveIntelligence(testSymbol, { useCache: true });
    const time1 = Date.now() - start1;
    console.log(`  ✓ First fetch completed in ${time1}ms`);

    // Second fetch (should use cache)
    console.log('  Fetching again (should use cache)...');
    const start2 = Date.now();
    const intel2 = await liveService.getLiveIntelligence(testSymbol, { useCache: true });
    const time2 = Date.now() - start2;
    console.log(`  ✓ Second fetch completed in ${time2}ms`);

    console.log(`  Cache speedup: ${(time1 / time2).toFixed(2)}x faster`);
    console.log(`  Data matches: ${intel1.news_sentiment?.articles.length === intel2.news_sentiment?.articles.length}`);
  } catch (error: any) {
    console.error(`✗ Test 4 failed: ${error.message}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('LIVE INTELLIGENCE INTEGRATION TESTS COMPLETE');
  console.log('='.repeat(80));
}

main().catch(console.error);
