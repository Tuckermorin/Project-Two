// AI-Enhanced Trade Evaluation Step for Options Agent V3
// Uses Phase 3 Enhanced Recommendation Service with Live Intelligence

import type { TradeCandidate } from '../services/trade-context-enrichment-service';
import { getEnhancedTradeRecommendationService } from '../services/enhanced-trade-recommendation-service';

// Calculate days to expiration
function calculateDTE(expiryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Convert agent candidate format to TradeCandidate format
export function convertToTradeCandidate(agentCandidate: any, ipsId?: string): TradeCandidate {
  const shortLeg = agentCandidate.contract_legs?.find((l: any) => l.type === 'SELL');
  const longLeg = agentCandidate.contract_legs?.find((l: any) => l.type === 'BUY');

  // Convert agent's factor_scores to ips_factors format for AI context
  const ipsFactors = agentCandidate.factor_scores?.map((fs: any) => ({
    factor_name: fs.name || fs.factor,
    actual_value: fs.actual_value || fs.value,
    target_value: fs.target_value,
    passed: fs.passed,
    weight: fs.weight,
  })) || [];

  // Count passed and failed factors
  const passedFactors = ipsFactors.filter((f: any) => f.passed);
  const failedFactors = ipsFactors.filter((f: any) => !f.passed);

  return {
    symbol: agentCandidate.symbol,
    strategy_type: 'put_credit_spread',
    short_strike: shortLeg?.strike || 0,
    long_strike: longLeg?.strike || 0,
    contract_type: 'put',
    expiration_date: shortLeg?.expiry || '',
    dte: calculateDTE(shortLeg?.expiry || ''),
    credit_received: agentCandidate.entry_mid || 0,
    delta: Math.abs(shortLeg?.delta || 0),
    iv_rank: agentCandidate.iv_rank || 0,
    estimated_pop: agentCandidate.est_pop || 0,
    composite_score: 0,
    yield_score: 0,
    ips_score: agentCandidate.ips_score || 0,
    // Include agent's IPS evaluation data for AI context
    ips_factors: ipsFactors,
    ips_evaluation: agentCandidate.factor_scores && ipsId ? {
      ips_id: ipsId, // Use the actual IPS ID from the state
      ips_name: 'Agent IPS',
      passed: failedFactors.length === 0,
      score: agentCandidate.ips_score || 0,
      max_score: 100,
      score_percentage: agentCandidate.ips_score || 0,
      passed_factors: passedFactors.map((f: any) => ({
        factor_key: f.factor_name,
        factor_name: f.factor_name,
        actual_value: f.actual_value,
        weight: f.weight || 1,
      })),
      failed_factors: failedFactors.map((f: any) => ({
        factor_key: f.factor_name,
        factor_name: f.factor_name,
        actual_value: f.actual_value,
        expected_value: f.target_value,
        weight: f.weight || 1,
      })),
    } : undefined,
  };
}

/**
 * AI-Enhanced Trade Evaluation
 * Replaces generateTradeRationales with full AI evaluation using Phase 3 system
 */
export async function evaluateTradesWithAI(state: any): Promise<Partial<any>> {
  console.log(`[AIEvaluation] Evaluating ${state.selected.length} trades with AI-enhanced recommendation service`);
  console.log(`[AIEvaluation] Using progressive weighting with live news integration`);

  const recommendationService = getEnhancedTradeRecommendationService();
  const evaluatedTrades: any[] = [];
  const batchSize = 3; // Process 3 at a time to manage rate limits

  // Process in batches to avoid overwhelming the APIs
  for (let i = 0; i < state.selected.length; i += batchSize) {
    const batch = state.selected.slice(i, i + batchSize);
    console.log(`[AIEvaluation] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(state.selected.length / batchSize)} (${batch.length} trades)`);

    const batchResults = await Promise.all(
      batch.map(async (candidate) => {
        try {
          console.log(`[AIEvaluation] Evaluating ${candidate.symbol}...`);

          // Convert to TradeCandidate format with IPS ID
          const tradeCandidate = convertToTradeCandidate(candidate, state.ipsId);

          // Get AI-enhanced evaluation with live news and full context
          const evaluation = await recommendationService.getRecommendation({
            candidate: tradeCandidate,
            ips_id: state.ipsId!,
            user_id: process.env.NEXT_PUBLIC_DEFAULT_USER_ID || 'b2c427e9-3eec-4e15-a22e-0aafc3047c0c',
            options: {
              save_evaluation: true, // Save to ai_trade_evaluations table
              include_live_news: true, // Include real-time Alpha Vantage news
              include_external_intelligence: true, // Cached intelligence from external DB
              include_internal_rag: false, // Skip for speed (can enable later)
              include_tavily: false, // Skip for speed (can enable later)
            },
          });

          console.log(`[AIEvaluation] ${candidate.symbol} - Final: ${evaluation.final_recommendation}, Composite: ${evaluation.weighted_score.composite_score.toFixed(2)}/100, Weighting: ${(evaluation.weighted_score.ips_weight * 100).toFixed(0)}/${(evaluation.weighted_score.ai_weight * 100).toFixed(0)}`);

          // Merge AI evaluation results into candidate
          return {
            ...candidate,
            // AI-Enhanced Scores
            composite_score: evaluation.weighted_score.composite_score,
            ai_score: evaluation.ai_evaluation.ai_score,
            ai_recommendation: evaluation.final_recommendation,
            ai_confidence: evaluation.ai_evaluation.confidence,

            // Progressive Weighting
            ips_weight: evaluation.weighted_score.ips_weight,
            ai_weight: evaluation.weighted_score.ai_weight,
            weighting_rationale: evaluation.weighted_score.weighting_rationale,

            // AI Rationale & Explainability
            rationale: evaluation.explainability.decision_breakdown,
            structured_rationale: evaluation.structured_rationale, // Full structured rationale for enhanced UI
            ai_key_factors: evaluation.explainability.key_decision_factors,
            ai_risk_factors: evaluation.ai_evaluation.reasoning.risk_factors,
            ai_opportunities: evaluation.ai_evaluation.reasoning.opportunities,

            // Live News & Sentiment
            live_news_sentiment: evaluation.enriched_context.live_market_intelligence?.news_sentiment?.aggregate_sentiment,
            live_news_article_count: evaluation.enriched_context.live_market_intelligence?.news_sentiment?.articles?.length || 0,
            news_sentiment_score: evaluation.ai_evaluation.sentiment_analysis.news_sentiment,

            // Data Quality Indicators
            data_quality: evaluation.enriched_context.data_quality,
            has_live_news: evaluation.enriched_context.data_quality.has_live_news,
            overall_confidence: evaluation.enriched_context.data_quality.overall_confidence,

            // Historical Performance Data
            historical_performance: evaluation.enriched_context.historical_performance,

            // Full evaluation reference (for debugging/analysis)
            ai_evaluation_id: (evaluation as any).evaluation_id, // If saved
          };
        } catch (error: any) {
          console.error(`[AIEvaluation] Failed to evaluate ${candidate.symbol}:`, error.message);

          // Fall back to IPS-only scoring on error
          return {
            ...candidate,
            composite_score: candidate.ips_score, // Use IPS score as fallback
            ai_score: null,
            ai_recommendation: 'unavailable',
            ai_confidence: 'low',
            rationale: `IPS Score: ${candidate.ips_score?.toFixed(1)}/100. AI evaluation unavailable (${error.message}).`,
            ai_evaluation_error: error.message,
          };
        }
      })
    );

    evaluatedTrades.push(...batchResults);
  }

  // Re-sort by composite score (IPS + AI weighted)
  // This allows AI to influence final ranking when it has high confidence
  evaluatedTrades.sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));

  console.log(`[AIEvaluation] Completed AI evaluation for ${evaluatedTrades.length} trades`);
  console.log(`  Top composite score: ${evaluatedTrades[0]?.composite_score?.toFixed(2) || 'N/A'}`);
  console.log(`  Top weighting: ${Math.round((evaluatedTrades[0]?.ips_weight || 0.5) * 100)}/${Math.round((evaluatedTrades[0]?.ai_weight || 0.5) * 100)} (IPS/AI)`);
  console.log(`  Trades with live news: ${evaluatedTrades.filter(t => t.has_live_news).length}/${evaluatedTrades.length}`);

  return {
    selected: evaluatedTrades,
  };
}
