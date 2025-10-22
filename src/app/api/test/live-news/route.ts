// Quick test endpoint to verify live news integration
import { NextRequest, NextResponse } from 'next/server';
import { getLiveMarketIntelligenceService } from '@/lib/services/live-market-intelligence-service';
import { getEnhancedTradeRecommendationService } from '@/lib/services/enhanced-trade-recommendation-service';
import type { TradeCandidate } from '@/lib/services/trade-context-enrichment-service';

export async function POST(req: NextRequest) {
  try {
    const { symbol, ipsId } = await req.json();

    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    console.log(`[TestLiveNews] Testing live news integration for ${symbol}`);

    // Test 1: Direct live intelligence service
    const liveService = getLiveMarketIntelligenceService();
    const liveIntel = await liveService.getLiveIntelligence(symbol, {
      includeNews: true,
      newsLimit: 20,
      useCache: false, // Force fresh for testing
    });

    const hasNews = !!liveIntel.news_sentiment && liveIntel.news_sentiment.articles.length > 0;
    const newsCount = liveIntel.news_sentiment?.articles.length || 0;
    const sentiment = liveIntel.news_sentiment?.aggregate_sentiment;

    console.log(`[TestLiveNews] Live news: ${newsCount} articles, sentiment: ${sentiment?.label}`);

    // Test 2: Full AI evaluation (if IPS provided)
    let aiEvaluation = null;
    if (ipsId) {
      const recommendationService = getEnhancedTradeRecommendationService();

      // Create a sample trade candidate
      const candidate: TradeCandidate = {
        symbol,
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
        ips_id: ipsId,
        user_id: 'test-user',
        options: {
          save_evaluation: false, // Don't save test evaluations
          include_live_news: true,
        },
      });

      const enrichedContext = (evaluation as any).enriched_context;

      aiEvaluation = {
        final_recommendation: evaluation.final_recommendation,
        composite_score: evaluation.weighted_score.composite_score,
        weighting: `${(evaluation.weighted_score.ips_weight * 100).toFixed(0)}/${(evaluation.weighted_score.ai_weight * 100).toFixed(0)}`,
        weighting_rationale: evaluation.weighted_score.weighting_rationale,
        ai_confidence: evaluation.ai_evaluation.confidence,
        news_sentiment_in_analysis: evaluation.ai_evaluation.sentiment_analysis.news_sentiment,
        has_live_news_in_context: enrichedContext?.data_quality?.has_live_news || false,
        live_news_article_count: enrichedContext?.live_market_intelligence?.news_sentiment?.articles?.length || 0,
      };

      console.log(`[TestLiveNews] AI Evaluation: ${evaluation.final_recommendation} (${evaluation.weighted_score.composite_score}/100)`);
    }

    return NextResponse.json({
      ok: true,
      symbol,
      live_intelligence: {
        has_news: hasNews,
        article_count: newsCount,
        sentiment: {
          label: sentiment?.label,
          score: sentiment?.average_score,
          bullish: sentiment?.bullish_count,
          neutral: sentiment?.neutral_count,
          bearish: sentiment?.bearish_count,
        },
        recent_headlines: liveIntel.news_sentiment?.articles.slice(0, 5).map(a => ({
          title: a.title,
          source: a.source,
          published: a.time_published,
          sentiment: a.ticker_sentiment.find(ts => ts.ticker === symbol)?.ticker_sentiment_label,
        })),
        data_quality: liveIntel.data_quality,
      },
      ai_evaluation: aiEvaluation,
    });

  } catch (error: any) {
    console.error('[TestLiveNews] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
