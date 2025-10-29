// AI Trade Evaluator Service
// Provides AI-powered trade recommendations using enriched context
// Implements progressive weighting: 60/40 → 50/50 → 30/70 (IPS/AI)

import { ChatOllama } from "@langchain/ollama";
import type { EnrichedTradeContext, TradeCandidate } from './trade-context-enrichment-service';
import { getEnhancedRationaleGenerator, type StructuredRationale } from './enhanced-rationale-generator';

// ============================================================================
// Types
// ============================================================================

export type AIConfidence = 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
export type TradeRecommendation = 'strong_buy' | 'buy' | 'neutral' | 'avoid' | 'strong_avoid';

export interface AIEvaluation {
  recommendation: TradeRecommendation;
  confidence: AIConfidence;
  confidence_score: number; // 0-100
  ai_score: number; // 0-100, AI's assessment of trade quality
  reasoning: {
    primary_factors: string[];
    supporting_evidence: string[];
    risk_factors: string[];
    opportunities: string[];
  };
  sentiment_analysis: {
    overall: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    news_sentiment: number; // -1 to +1
    earnings_sentiment: number; // -1 to +1
    historical_sentiment: number; // -1 to +1
  };
  historical_context: {
    similar_trades_outcome: 'positive' | 'negative' | 'mixed' | 'unknown';
    symbol_performance: 'strong' | 'moderate' | 'weak' | 'unknown';
    strategy_effectiveness: 'high' | 'medium' | 'low' | 'unknown';
  };
  market_alignment: {
    conditions_favorable: boolean;
    alignment_score: number; // 0-100
    key_indicators: string[];
  };
  data_sufficiency: {
    sufficient_for_high_confidence: boolean;
    data_quality_score: number; // 0-100
    missing_data_points: string[];
  };
}

export interface WeightedScore {
  ips_weight: number; // 0-1
  ai_weight: number; // 0-1
  ips_score: number; // 0-100
  ai_score: number; // 0-100
  composite_score: number; // 0-100
  weighting_rationale: string;
  confidence_level: AIConfidence;
}

export interface TradeEvaluationResult {
  candidate: TradeCandidate;
  ips_evaluation: EnrichedTradeContext['ips_evaluation'];
  ai_evaluation: AIEvaluation;
  weighted_score: WeightedScore;
  final_recommendation: TradeRecommendation;
  explainability: {
    decision_breakdown: string;
    ips_contribution: string;
    ai_contribution: string;
    key_decision_factors: string[];
    confidence_explanation: string;
  };
  enriched_context: EnrichedTradeContext; // Full enriched context for debugging/storage
  structured_rationale?: StructuredRationale; // Enhanced rationale with learning
  evaluated_at: string;
}

// ============================================================================
// AI Trade Evaluator
// ============================================================================

export class AITradeEvaluator {
  private llm: ChatOllama;

  constructor() {
    const normalizeBaseUrl = (raw?: string | null): string => {
      const fallback = "http://golem:11434";
      if (!raw) return fallback;
      const trimmed = raw.trim();
      if (!trimmed) return fallback;
      try {
        const url = new URL(trimmed);
        if (url.pathname && url.pathname !== "/") {
          url.pathname = "/";
        }
        url.search = "";
        url.hash = "";
        const base = url.origin + (url.pathname === "/" ? "" : url.pathname);
        return base.replace(/\/$/, "");
      } catch (error) {
        return trimmed.replace(/\/api\/chat$/i, "").replace(/\/$/, "") || fallback;
      }
    };

    const ollamaBaseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST);

    this.llm = new ChatOllama({
      model: "gpt-oss:20b",
      temperature: 0.3,
      baseUrl: ollamaBaseUrl,
      numCtx: 32768,
    });

    console.log(`[AITradeEvaluator] Initialized with Ollama model gpt-oss:20b at ${ollamaBaseUrl}`);
  }

  /**
   * Main evaluation function: combines IPS + AI to produce weighted recommendation
   */
  async evaluateTrade(
    enrichedContext: EnrichedTradeContext,
    options: {
      forceWeighting?: { ips: number; ai: number };
      useProgressiveWeighting?: boolean;
    } = {}
  ): Promise<TradeEvaluationResult> {
    const { useProgressiveWeighting = true } = options;

    console.log(`[AITradeEvaluator] Evaluating trade for ${enrichedContext.candidate.symbol}`);

    // Step 1: Get AI evaluation
    const aiEvaluation = await this.getAIEvaluation(enrichedContext);

    // Step 2: Calculate weighted score
    const weightedScore = this.calculateWeightedScore(
      enrichedContext,
      aiEvaluation,
      useProgressiveWeighting,
      options.forceWeighting
    );

    // Step 3: Determine final recommendation
    const finalRecommendation = this.determineFinalRecommendation(
      weightedScore.composite_score,
      weightedScore.confidence_level
    );

    // Step 4: Generate explainability
    const explainability = this.generateExplainability(
      enrichedContext,
      aiEvaluation,
      weightedScore,
      finalRecommendation
    );

    // Step 5: Generate enhanced structured rationale (optional, for learning)
    let structuredRationale: StructuredRationale | undefined;
    try {
      const rationaleGenerator = getEnhancedRationaleGenerator();
      structuredRationale = await rationaleGenerator.generateRationale(
        enrichedContext,
        aiEvaluation
      );
      console.log(`[AITradeEvaluator] Enhanced rationale generated with embedding`);
    } catch (error) {
      console.warn(`[AITradeEvaluator] Failed to generate enhanced rationale:`, error);
      // Continue without rationale - not critical
    }

    const result: TradeEvaluationResult = {
      candidate: enrichedContext.candidate,
      ips_evaluation: enrichedContext.ips_evaluation,
      ai_evaluation: aiEvaluation,
      weighted_score: weightedScore,
      final_recommendation: finalRecommendation,
      explainability,
      enriched_context: enrichedContext,
      structured_rationale: structuredRationale,
      evaluated_at: new Date().toISOString(),
    };

    console.log(`[AITradeEvaluator] Evaluation complete`);
    console.log(`  Final Recommendation: ${finalRecommendation}`);
    console.log(`  Composite Score: ${weightedScore.composite_score.toFixed(2)}`);
    console.log(`  Weighting: ${(weightedScore.ips_weight * 100).toFixed(0)}% IPS / ${(weightedScore.ai_weight * 100).toFixed(0)}% AI`);
    if (structuredRationale) {
      console.log(`  Enhanced Rationale: "${structuredRationale.summary.one_sentence_thesis}"`);
    }

    return result;
  }

  /**
   * Get AI evaluation using Ollama gpt-oss:20b with enriched context
   */
  private async getAIEvaluation(context: EnrichedTradeContext): Promise<AIEvaluation> {
    console.log(`[AITradeEvaluator] Requesting AI evaluation from Ollama (gpt-oss:20b)...`);

    const prompt = this.buildAIPrompt(context);

    try {
      const messages = [
        {
          role: 'system' as const,
          content: `You are an expert options trading analyst specializing in credit spreads.
Analyze the provided trade context and provide a detailed evaluation in JSON format.
Be objective, data-driven, and consider all available information.
Output ONLY valid JSON in the exact format requested - no markdown formatting, no code blocks, no preamble.`,
        },
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const response = await this.llm.invoke(messages);
      const responseText = response.content?.toString().trim();

      if (!responseText) {
        throw new Error('No response from AI');
      }

      // Clean up response (remove markdown code blocks if present)
      let cleanedResponse = responseText;
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleanedResponse);
      return this.normalizeAIResponse(parsed);
    } catch (error: any) {
      console.error(`[AITradeEvaluator] AI evaluation failed: ${error.message}`);
      return this.getFallbackAIEvaluation(context);
    }
  }

  /**
   * Build comprehensive prompt for AI evaluation
   */
  private buildAIPrompt(context: EnrichedTradeContext): string {
    const { candidate, ips_evaluation, multi_source_intelligence, live_market_intelligence, historical_performance, market_conditions } = context;

    const sections: string[] = [];

    // Trade Details
    sections.push(`TRADE CANDIDATE:
Symbol: ${candidate.symbol}
Strategy: ${candidate.strategy_type}
Strikes: ${candidate.short_strike}/${candidate.long_strike} ${candidate.contract_type}
Expiration: ${candidate.expiration_date} (${candidate.dte} DTE)
Credit: $${candidate.credit_received?.toFixed(2) || 'N/A'}
Delta: ${candidate.delta?.toFixed(3) || 'N/A'}
IV Rank: ${candidate.iv_rank || 'N/A'}
Estimated POP: ${candidate.estimated_pop ? (candidate.estimated_pop * 100).toFixed(1) + '%' : 'N/A'}`);

    // IPS Evaluation
    sections.push(`\nIPS EVALUATION (${ips_evaluation.ips_name}):
Passed: ${ips_evaluation.passed ? 'YES' : 'NO'}
Score: ${ips_evaluation.score_percentage.toFixed(1)}% (${ips_evaluation.score}/${ips_evaluation.max_score})
Passed Factors: ${ips_evaluation.passed_factors.length}
Failed Factors: ${ips_evaluation.failed_factors.length}

Passed Factors:
${ips_evaluation.passed_factors.map(f => `  ✓ ${f.factor_name}: ${f.actual_value} (weight: ${f.weight || 1})`).join('\n')}
${ips_evaluation.failed_factors.length > 0 ? '\nFailed Factors:\n' + ips_evaluation.failed_factors.map(f => `  ✗ ${f.factor_name}: ${f.actual_value} (expected ${f.expected_value}, weight: ${f.weight || 1})`).join('\n') : ''}`);

    // Historical Performance
    if (historical_performance.total_trades > 0) {
      sections.push(`\nHISTORICAL PERFORMANCE (${candidate.symbol}):
Total Trades: ${historical_performance.total_trades}
Win Rate: ${historical_performance.win_rate.toFixed(1)}%
Average ROI: ${historical_performance.avg_roi.toFixed(2)}%
Average DTE: ${historical_performance.avg_dte.toFixed(0)} days
Recent Trades (last 5):
${historical_performance.recent_trades.map(t => `  - ${t.strategy_type}: ${t.realized_pl_percent > 0 ? '+' : ''}${t.realized_pl_percent.toFixed(2)}%`).join('\n')}`);
    } else {
      sections.push(`\nHISTORICAL PERFORMANCE: No historical trades for ${candidate.symbol}`);
    }

    // Multi-Source Intelligence
    if (multi_source_intelligence.aggregate) {
      sections.push(`\nMARKET INTELLIGENCE:
Overall Sentiment: ${multi_source_intelligence.aggregate.overall_sentiment}
Sentiment Score: ${multi_source_intelligence.aggregate.sentiment_score.toFixed(2)}
Data Quality: ${multi_source_intelligence.aggregate.data_quality_score}/100
Confidence: ${multi_source_intelligence.confidence}`);
    }

    // External Intelligence Summary
    if (multi_source_intelligence.external_intelligence) {
      const ext = multi_source_intelligence.external_intelligence;
      sections.push(`\nEXTERNAL INTELLIGENCE (CACHED):
Earnings Transcripts: ${ext.earnings_count} quarters
Recent News: ${ext.news_count} articles (avg sentiment: ${ext.aggregate_news_sentiment?.toFixed(2) || 'N/A'})
Data Freshness: ${ext.data_freshness}`);
    }

    // Live Market Intelligence
    if (live_market_intelligence?.news_sentiment) {
      const liveNews = live_market_intelligence.news_sentiment;
      sections.push(`\nLIVE MARKET NEWS (REAL-TIME from Alpha Vantage):
Article Count: ${liveNews.articles.length}
Overall Sentiment: ${liveNews.aggregate_sentiment.label}
Sentiment Score: ${liveNews.aggregate_sentiment.average_score.toFixed(3)} (-1 to +1)
Bullish Articles: ${liveNews.aggregate_sentiment.bullish_count}
Bearish Articles: ${liveNews.aggregate_sentiment.bearish_count}
Neutral Articles: ${liveNews.aggregate_sentiment.neutral_count}
Time Range: ${new Date(liveNews.time_range.from).toLocaleDateString()} to ${new Date(liveNews.time_range.to).toLocaleDateString()}

Recent Headlines (top 5):
${liveNews.articles.slice(0, 5).map((article, idx) => {
  const tickerSentiment = article.ticker_sentiment.find(ts => ts.ticker === candidate.symbol);
  return `  ${idx + 1}. ${article.title}
     Source: ${article.source} | Published: ${new Date(article.time_published).toLocaleString()}
     Sentiment: ${tickerSentiment?.ticker_sentiment_label || article.overall_sentiment_label} (${tickerSentiment?.ticker_sentiment_score || article.overall_sentiment_score.toFixed(3)})
     Summary: ${article.summary.substring(0, 150)}...`;
}).join('\n')}`);
    }

    // Market Conditions
    sections.push(`\nMARKET CONDITIONS:
Overall Sentiment: ${market_conditions.overall_sentiment}
Conditions Favorable: ${market_conditions.conditions_favorable ? 'YES' : 'NO'}
Risk Factors: ${market_conditions.risk_factors.length > 0 ? market_conditions.risk_factors.join(', ') : 'None identified'}`);

    const fullPrompt = sections.join('\n') + `\n\nBased on the above context, provide a comprehensive evaluation in JSON format with these fields:
{
  "recommendation": "strong_buy" | "buy" | "neutral" | "avoid" | "strong_avoid",
  "confidence": "very_high" | "high" | "medium" | "low" | "very_low",
  "confidence_score": 0-100,
  "ai_score": 0-100,
  "reasoning": {
    "primary_factors": ["list of main factors supporting recommendation"],
    "supporting_evidence": ["additional evidence"],
    "risk_factors": ["identified risks"],
    "opportunities": ["potential opportunities"]
  },
  "sentiment_analysis": {
    "overall": "bullish" | "bearish" | "neutral" | "mixed",
    "news_sentiment": -1 to +1,
    "earnings_sentiment": -1 to +1,
    "historical_sentiment": -1 to +1
  },
  "historical_context": {
    "similar_trades_outcome": "positive" | "negative" | "mixed" | "unknown",
    "symbol_performance": "strong" | "moderate" | "weak" | "unknown",
    "strategy_effectiveness": "high" | "medium" | "low" | "unknown"
  },
  "market_alignment": {
    "conditions_favorable": boolean,
    "alignment_score": 0-100,
    "key_indicators": ["list of key market indicators"]
  },
  "data_sufficiency": {
    "sufficient_for_high_confidence": boolean,
    "data_quality_score": 0-100,
    "missing_data_points": ["list of missing data"]
  }
}`;

    return fullPrompt;
  }

  /**
   * Normalize AI response to expected format
   */
  private normalizeAIResponse(parsed: any): AIEvaluation {
    return {
      recommendation: parsed.recommendation || 'neutral',
      confidence: parsed.confidence || 'medium',
      confidence_score: parsed.confidence_score || 50,
      ai_score: parsed.ai_score || 50,
      reasoning: parsed.reasoning || {
        primary_factors: [],
        supporting_evidence: [],
        risk_factors: [],
        opportunities: [],
      },
      sentiment_analysis: parsed.sentiment_analysis || {
        overall: 'neutral',
        news_sentiment: 0,
        earnings_sentiment: 0,
        historical_sentiment: 0,
      },
      historical_context: parsed.historical_context || {
        similar_trades_outcome: 'unknown',
        symbol_performance: 'unknown',
        strategy_effectiveness: 'unknown',
      },
      market_alignment: parsed.market_alignment || {
        conditions_favorable: true,
        alignment_score: 50,
        key_indicators: [],
      },
      data_sufficiency: parsed.data_sufficiency || {
        sufficient_for_high_confidence: false,
        data_quality_score: 50,
        missing_data_points: [],
      },
    };
  }

  /**
   * Get fallback evaluation if AI fails
   */
  private getFallbackAIEvaluation(context: EnrichedTradeContext): AIEvaluation {
    return {
      recommendation: 'neutral',
      confidence: 'low',
      confidence_score: 30,
      ai_score: 50,
      reasoning: {
        primary_factors: ['AI evaluation unavailable - using fallback'],
        supporting_evidence: [],
        risk_factors: ['Limited AI analysis'],
        opportunities: [],
      },
      sentiment_analysis: {
        overall: 'neutral',
        news_sentiment: 0,
        earnings_sentiment: 0,
        historical_sentiment: 0,
      },
      historical_context: {
        similar_trades_outcome: 'unknown',
        symbol_performance: 'unknown',
        strategy_effectiveness: 'unknown',
      },
      market_alignment: {
        conditions_favorable: true,
        alignment_score: 50,
        key_indicators: [],
      },
      data_sufficiency: {
        sufficient_for_high_confidence: false,
        data_quality_score: 30,
        missing_data_points: ['AI evaluation failed'],
      },
    };
  }

  /**
   * Calculate weighted score using progressive weighting strategy
   * 60/40 (IPS/AI) → 50/50 → 30/70 based on data availability
   * If IPS has ai_weight configured, that takes precedence
   */
  private calculateWeightedScore(
    context: EnrichedTradeContext,
    aiEvaluation: AIEvaluation,
    useProgressiveWeighting: boolean,
    forceWeighting?: { ips: number; ai: number }
  ): WeightedScore {
    let ipsWeight: number;
    let aiWeight: number;
    let rationale: string;

    // Priority 1: Force weighting (manual override)
    if (forceWeighting) {
      ipsWeight = forceWeighting.ips;
      aiWeight = forceWeighting.ai;
      rationale = 'Manual weighting override';
    }
    // Priority 2: IPS configuration ai_weight (user-configured weight)
    else if (context.ips_evaluation.ai_weight !== undefined && context.ips_evaluation.ai_weight !== null) {
      // Convert percentage (0-100) to decimal (0-1)
      aiWeight = context.ips_evaluation.ai_weight / 100;
      ipsWeight = 1 - aiWeight;
      rationale = `User-configured AI weight: ${context.ips_evaluation.ai_weight}% AI, ${(100 - context.ips_evaluation.ai_weight)}% IPS`;
    }
    // Priority 3: Progressive weighting based on data availability
    else if (useProgressiveWeighting) {
      const weights = this.determineProgressiveWeights(context, aiEvaluation);
      ipsWeight = weights.ips;
      aiWeight = weights.ai;
      rationale = weights.rationale;
    }
    // Priority 4: Default 50/50
    else {
      ipsWeight = 0.5;
      aiWeight = 0.5;
      rationale = 'Default balanced weighting';
    }

    // Get IPS score (convert to 0-100)
    const ipsScore = context.ips_evaluation.score_percentage;

    // Get AI score
    const aiScore = aiEvaluation.ai_score;

    // Calculate composite
    const compositeScore = ipsScore * ipsWeight + aiScore * aiWeight;

    // Determine confidence based on data quality and score variance
    const confidenceLevel = this.determineConfidenceLevel(
      context,
      aiEvaluation,
      compositeScore
    );

    return {
      ips_weight: ipsWeight,
      ai_weight: aiWeight,
      ips_score: ipsScore,
      ai_score: aiScore,
      composite_score: compositeScore,
      weighting_rationale: rationale,
      confidence_level: confidenceLevel,
    };
  }

  /**
   * Determine progressive weights based on data availability
   * Phase 1 (60/40): Limited data, rely more on IPS
   * Phase 2 (50/50): Moderate data, balance IPS and AI
   * Phase 3 (30/70): Rich data, rely more on AI
   */
  private determineProgressiveWeights(
    context: EnrichedTradeContext,
    aiEvaluation: AIEvaluation
  ): { ips: number; ai: number; rationale: string } {
    const dataQuality = context.data_quality;
    const hasHistorical = context.historical_performance.total_trades >= 10;
    const hasRichIntel = aiEvaluation.data_sufficiency.data_quality_score >= 70;
    const highConfidence = aiEvaluation.confidence_score >= 70;

    // Calculate data richness score (0-100)
    let dataRichnessScore = 0;
    if (dataQuality.has_external_intelligence) dataRichnessScore += 20;
    if (dataQuality.has_internal_rag) dataRichnessScore += 15;
    if (dataQuality.has_tavily_research) dataRichnessScore += 15;
    if (dataQuality.has_live_news) dataRichnessScore += 20;
    if (hasHistorical) dataRichnessScore += 15;
    if (hasRichIntel) dataRichnessScore += 15;

    // Determine phase based on data richness
    if (dataRichnessScore >= 70 && highConfidence) {
      // Phase 3: 30/70 (IPS/AI) - Rich data, trust AI more
      return {
        ips: 0.3,
        ai: 0.7,
        rationale: `Rich data environment (score: ${dataRichnessScore}/100) - AI has high confidence with comprehensive context`,
      };
    } else if (dataRichnessScore >= 40) {
      // Phase 2: 50/50 - Moderate data, balanced approach
      return {
        ips: 0.5,
        ai: 0.5,
        rationale: `Moderate data availability (score: ${dataRichnessScore}/100) - balanced IPS/AI weighting`,
      };
    } else {
      // Phase 1: 60/40 (IPS/AI) - Limited data, rely on IPS
      return {
        ips: 0.6,
        ai: 0.4,
        rationale: `Limited data environment (score: ${dataRichnessScore}/100) - rely more on rule-based IPS`,
      };
    }
  }

  /**
   * Determine overall confidence level
   */
  private determineConfidenceLevel(
    context: EnrichedTradeContext,
    aiEvaluation: AIEvaluation,
    compositeScore: number
  ): AIConfidence {
    const aiConfScore = aiEvaluation.confidence_score;
    const dataQualScore = aiEvaluation.data_sufficiency.data_quality_score;
    const ipsPass = context.ips_evaluation.passed;

    // Calculate overall confidence score
    const overallConfScore = (aiConfScore + dataQualScore) / 2;

    // Reduce confidence if IPS fails
    const adjustedConfScore = ipsPass ? overallConfScore : overallConfScore * 0.8;

    if (adjustedConfScore >= 80) return 'very_high';
    if (adjustedConfScore >= 65) return 'high';
    if (adjustedConfScore >= 45) return 'medium';
    if (adjustedConfScore >= 25) return 'low';
    return 'very_low';
  }

  /**
   * Determine final recommendation based on composite score and confidence
   */
  private determineFinalRecommendation(
    compositeScore: number,
    confidence: AIConfidence
  ): TradeRecommendation {
    // High confidence thresholds
    if (confidence === 'very_high' || confidence === 'high') {
      if (compositeScore >= 80) return 'strong_buy';
      if (compositeScore >= 65) return 'buy';
      if (compositeScore >= 40) return 'neutral';
      if (compositeScore >= 25) return 'avoid';
      return 'strong_avoid';
    }

    // Medium/low confidence - be more conservative
    if (compositeScore >= 75) return 'buy';
    if (compositeScore >= 55) return 'neutral';
    if (compositeScore >= 35) return 'avoid';
    return 'strong_avoid';
  }

  /**
   * Generate explainability for the decision
   */
  private generateExplainability(
    context: EnrichedTradeContext,
    aiEvaluation: AIEvaluation,
    weightedScore: WeightedScore,
    finalRecommendation: TradeRecommendation
  ): TradeEvaluationResult['explainability'] {
    const ipsContribution = `IPS scored ${weightedScore.ips_score.toFixed(1)}/100 (${context.ips_evaluation.passed ? 'PASSED' : 'FAILED'}). Weight: ${(weightedScore.ips_weight * 100).toFixed(0)}%.`;

    const aiContribution = `AI scored ${weightedScore.ai_score.toFixed(1)}/100 with ${aiEvaluation.confidence} confidence. Weight: ${(weightedScore.ai_weight * 100).toFixed(0)}%.`;

    const keyFactors = [
      ...aiEvaluation.reasoning.primary_factors.slice(0, 3),
      context.ips_evaluation.passed ? 'IPS criteria met' : 'IPS criteria not fully met',
    ];

    const decisionBreakdown = `Final recommendation: ${finalRecommendation.toUpperCase()}. ` +
      `Composite score: ${weightedScore.composite_score.toFixed(1)}/100. ` +
      `${weightedScore.weighting_rationale}`;

    const confidenceExplanation = `Confidence level: ${weightedScore.confidence_level}. ` +
      `Based on data quality score of ${aiEvaluation.data_sufficiency.data_quality_score}/100 ` +
      `and AI confidence score of ${aiEvaluation.confidence_score}/100.`;

    return {
      decision_breakdown: decisionBreakdown,
      ips_contribution: ipsContribution,
      ai_contribution: aiContribution,
      key_decision_factors: keyFactors,
      confidence_explanation: confidenceExplanation,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let evaluatorInstance: AITradeEvaluator | null = null;

export function getAITradeEvaluator(): AITradeEvaluator {
  if (!evaluatorInstance) {
    evaluatorInstance = new AITradeEvaluator();
  }
  return evaluatorInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function evaluateTradeWithAI(
  enrichedContext: EnrichedTradeContext,
  options?: Parameters<AITradeEvaluator['evaluateTrade']>[1]
): Promise<TradeEvaluationResult> {
  return getAITradeEvaluator().evaluateTrade(enrichedContext, options);
}
