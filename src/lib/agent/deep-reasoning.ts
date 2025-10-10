// Deep Reasoning Module for Options Trading Agent
// Implements multi-phase analysis: IPS validation, historical patterns, research synthesis, and threshold adjustment

import { createClient } from "@supabase/supabase-js";
import { tavilySearch } from "@/lib/clients/tavily";
import type { IPSConfig } from "@/lib/ips/loader";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// Types
// ============================================================================

export type ReasoningChain = {
  ips_baseline_score: number;
  ips_compliance: {
    overall_pass: boolean;
    violations: string[];
    passes: string[];
    factor_scores: Record<string, { value: number; target: string; pass: boolean }>;
  };
  historical_context: {
    similar_trades_count: number;
    success_rate: number | null;
    avg_pnl: number | null;
    common_patterns: string[];
    has_data: boolean;
  };
  market_factors: {
    iv_regime: string;
    news_sentiment: string;
    macro_regime: string;
    key_insights: string[];
  };
  threshold_adjustments: Array<{
    factor: string;
    original: string;
    adjusted: string;
    reason: string;
  }>;
  adjusted_score: number;
  recommendation: "ACCEPT" | "REJECT" | "REVIEW";
  recommendation_reason: string;
};

type Candidate = {
  id: string;
  symbol: string;
  strategy: string;
  contract_legs: Array<{ type: string; right: string; strike: number; expiry: string }>;
  entry_mid?: number;
  est_pop?: number;
  breakeven?: number;
  max_loss?: number;
  max_profit?: number;
  guardrail_flags?: Record<string, boolean>;
};

type Features = {
  iv_rank?: number;
  term_slope?: number;
  put_skew?: number;
  dte_mode?: number;
  volume_oi_ratio?: number;
  macro_regime?: string;
  [key: string]: any;
};

// ============================================================================
// Phase 1: IPS Validation
// ============================================================================

export function analyzeIPSCompliance(
  candidate: Candidate,
  features: Features,
  ipsConfig: IPSConfig
): {
  baseline_score: number;
  violations: string[];
  passes: string[];
  factor_scores: Record<string, { value: number; target: string; pass: boolean }>;
} {
  const violations: string[] = [];
  const passes: string[] = [];
  const factor_scores: Record<string, { value: number; target: string; pass: boolean }> = {};
  let total_score = 0;
  let total_weight = 0;

  // Get delta from actual contract legs (not features placeholder)
  const shortLeg = candidate.contract_legs?.find((l) => l.type === "SELL");
  const delta = shortLeg?.delta ? Math.abs(shortLeg.delta) : 0.25; // Use actual delta from contract

  for (const factor of ipsConfig.factors) {
    if (!factor.enabled) continue;

    const factor_key = factor.factor_key;
    let actual_value: number | undefined;
    let target_description = "";

    // Map factor keys to actual values
    switch (factor_key) {
      case "iv_rank":
        actual_value = features.iv_rank;
        target_description = factor.threshold != null
          ? `${factor.direction === "gte" ? "≥" : "≤"} ${factor.threshold}`
          : "optimized";
        break;
      case "delta_max":
        actual_value = delta;
        target_description = factor.threshold != null
          ? `≤ ${factor.threshold}`
          : "≤ 0.30";
        break;
      case "term_slope":
        actual_value = features.term_slope;
        target_description = factor.threshold != null
          ? `${factor.direction === "gte" ? "≥" : "≤"} ${factor.threshold}`
          : "positive preferred";
        break;
      case "volume_oi_ratio":
        actual_value = features.volume_oi_ratio;
        target_description = factor.threshold != null
          ? `≥ ${factor.threshold}`
          : "≥ 0.5";
        break;
      default:
        actual_value = features[factor_key];
        target_description = factor.threshold != null
          ? `${factor.direction === "gte" ? "≥" : "≤"} ${factor.threshold}`
          : "see IPS";
    }

    // Check if factor passes threshold
    let passes_threshold = true;
    if (actual_value != null && factor.threshold != null && factor.direction) {
      passes_threshold = factor.direction === "gte"
        ? actual_value >= factor.threshold
        : actual_value <= factor.threshold;
    }

    // Calculate normalized score (0-1)
    const normalized = normalizeFactorValue(factor_key, actual_value ?? 0.5);
    const weighted_score = normalized * (factor.weight || 0);

    total_score += passes_threshold ? weighted_score : weighted_score * 0.5;
    total_weight += factor.weight || 0;

    // Record result
    factor_scores[factor_key] = {
      value: actual_value ?? 0,
      target: target_description,
      pass: passes_threshold,
    };

    if (!passes_threshold) {
      violations.push(
        `${factor.display_name || factor_key}: ${actual_value?.toFixed(2) || "N/A"} (target: ${target_description})`
      );
    } else {
      passes.push(
        `${factor.display_name || factor_key}: ${actual_value?.toFixed(2) || "N/A"} ✓`
      );
    }
  }

  const baseline_score = total_weight > 0 ? (total_score / total_weight) * 100 : 50;

  return { baseline_score, violations, passes, factor_scores };
}

function normalizeFactorValue(factor_key: string, value: number): number {
  switch (factor_key) {
    case "iv_rank":
      return Math.max(0, Math.min(1, value));
    case "delta_max":
      // Lower delta is better for credit spreads
      return Math.max(0, Math.min(1, 1 - value));
    case "term_slope":
      return Math.max(0, Math.min(1, value * 0.5 + 0.5));
    case "volume_oi_ratio":
      return Math.max(0, Math.min(1, value));
    default:
      return 0.5;
  }
}

// ============================================================================
// Phase 2: Historical Pattern Analysis
// ============================================================================

export async function queryHistoricalTrades(
  symbol: string,
  strategy: string,
  dte_range: [number, number] = [20, 50]
): Promise<{
  similar_trades_count: number;
  success_rate: number | null;
  avg_pnl: number | null;
  common_patterns: string[];
  has_data: boolean;
}> {
  try {
    // Query completed trades with similar characteristics
    const { data: trades, error } = await supabase
      .from("trades")
      .select("id, status, premium_collected, premium_paid, exit_pnl, strike_price_short, strike_price_long")
      .eq("symbol", symbol)
      .in("status", ["closed", "expired"])
      .not("exit_date", "is", null)
      .order("exit_date", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[DeepReasoning] Historical query error:", error);
      return { similar_trades_count: 0, success_rate: null, avg_pnl: null, common_patterns: [], has_data: false };
    }

    if (!trades || trades.length === 0) {
      return { similar_trades_count: 0, success_rate: null, avg_pnl: null, common_patterns: [], has_data: false };
    }

    // Filter for similar strategy (approximate match)
    const similar = trades.filter((t) => {
      // Basic strategy matching - can be enhanced
      return true; // For now include all completed trades for this symbol
    });

    if (similar.length === 0) {
      return { similar_trades_count: 0, success_rate: null, avg_pnl: null, common_patterns: [], has_data: false };
    }

    // Calculate success metrics
    const winning_trades = similar.filter((t) => {
      const pnl = t.exit_pnl ?? 0;
      return pnl > 0;
    });

    const success_rate = (winning_trades.length / similar.length) * 100;

    const total_pnl = similar.reduce((sum, t) => sum + (t.exit_pnl ?? 0), 0);
    const avg_pnl = total_pnl / similar.length;

    // Identify common patterns
    const common_patterns: string[] = [];
    if (success_rate > 70) {
      common_patterns.push("Strong historical win rate on this symbol");
    } else if (success_rate < 40) {
      common_patterns.push("Below-average historical performance on this symbol");
    }

    if (avg_pnl > 100) {
      common_patterns.push("Historically profitable with good avg P&L");
    } else if (avg_pnl < 0) {
      common_patterns.push("Warning: Historical losses on similar setups");
    }

    return {
      similar_trades_count: similar.length,
      success_rate,
      avg_pnl,
      common_patterns,
      has_data: true,
    };
  } catch (err) {
    console.error("[DeepReasoning] Historical analysis error:", err);
    return { similar_trades_count: 0, success_rate: null, avg_pnl: null, common_patterns: [], has_data: false };
  }
}

// ============================================================================
// Phase 3: Multi-Source Research Synthesis
// ============================================================================

export async function synthesizeResearch(
  symbol: string,
  macroData: Record<string, any>,
  features: Features
): Promise<{
  iv_regime: string;
  news_sentiment: string;
  macro_regime: string;
  key_insights: string[];
}> {
  const key_insights: string[] = [];

  // 1. IV Regime analysis
  const iv_rank = features.iv_rank ?? 0.5;
  let iv_regime = "neutral";
  if (iv_rank > 0.7) {
    iv_regime = "elevated";
    key_insights.push(`High IV environment (${(iv_rank * 100).toFixed(0)}th percentile) - favorable for premium selling`);
  } else if (iv_rank < 0.3) {
    iv_regime = "compressed";
    key_insights.push(`Low IV environment (${(iv_rank * 100).toFixed(0)}th percentile) - limited premium collection`);
  }

  // 2. News sentiment (using Alpha Vantage Alpha Intelligence)
  let news_sentiment = "neutral";
  try {
    // Use Alpha Vantage sentiment data if available (more accurate than keyword counting)
    const avNews = candidate.general_data?.av_news_sentiment;

    if (avNews) {
      const score = avNews.average_score || 0;
      const label = avNews.sentiment_label || "neutral";

      // Map Alpha Vantage sentiment to our categories
      if (label === "bullish" || label === "somewhat-bullish") {
        news_sentiment = "positive";
        key_insights.push(`Bullish news sentiment: ${score.toFixed(2)} (${avNews.positive} positive articles)`);
      } else if (label === "bearish" || label === "somewhat-bearish") {
        news_sentiment = "negative";
        key_insights.push(`Bearish news sentiment: ${score.toFixed(2)} (${avNews.negative} negative articles) - caution warranted`);
      } else {
        news_sentiment = "neutral";
      }

      // Add topic-specific insights
      if (avNews.topic_sentiment) {
        const earningsSent = avNews.topic_sentiment.Earnings;
        if (earningsSent !== undefined) {
          if (earningsSent < -0.3) {
            key_insights.push(`⚠️ Negative earnings sentiment: ${earningsSent.toFixed(2)}`);
          } else if (earningsSent > 0.3) {
            key_insights.push(`✓ Positive earnings sentiment: ${earningsSent.toFixed(2)}`);
          }
        }

        const techSent = avNews.topic_sentiment.Technology;
        if (techSent !== undefined && Math.abs(techSent) > 0.3) {
          key_insights.push(`Tech sector sentiment: ${techSent > 0 ? 'positive' : 'negative'} (${techSent.toFixed(2)})`);
        }
      }

      // Add relevance context
      if (avNews.avg_relevance !== null && avNews.avg_relevance < 0.3) {
        key_insights.push(`Low news relevance (${avNews.avg_relevance.toFixed(2)}) - sentiment may be sector-wide`);
      }
    } else {
      // Fallback to Tavily if Alpha Vantage data unavailable
      const newsRes = await tavilySearch(
        `${symbol} stock news earnings outlook sentiment last 7 days`,
        { time_range: "week", max_results: 5 }
      );

      if (newsRes.results && newsRes.results.length > 0) {
        const snippets = newsRes.results.map((r: any) => r.snippet?.toLowerCase() || "").join(" ");

        // Simple sentiment analysis
        const positive_words = ["beat", "positive", "upgraded", "strong", "growth", "rally"];
        const negative_words = ["miss", "negative", "downgraded", "weak", "decline", "concern"];

        const positive_count = positive_words.filter((w) => snippets.includes(w)).length;
        const negative_count = negative_words.filter((w) => snippets.includes(w)).length;

        if (positive_count > negative_count) {
          news_sentiment = "positive";
          key_insights.push("Recent news sentiment is positive (Tavily)");
        } else if (negative_count > positive_count) {
          news_sentiment = "negative";
          key_insights.push("Recent news sentiment is negative - caution warranted (Tavily)");
        }
      }
    }

    // Check insider activity
    const insider = candidate.general_data?.insider_activity;
    if (insider && insider.transaction_count >= 3) {
      const buyRatio = insider.buy_ratio || 0;
      if (buyRatio > 1.5) {
        key_insights.push(`✓ Insider buying signal: ${insider.acquisition_count} buys vs ${insider.disposal_count} sells`);
      } else if (buyRatio < 0.5) {
        key_insights.push(`⚠️ Insider selling: ${insider.disposal_count} sells vs ${insider.acquisition_count} buys`);
      }
    }
  } catch (err) {
    console.error("[DeepReasoning] News synthesis error:", err);
  }

  // 3. Macro regime
  const macro_regime = features.macro_regime || "neutral";

  // Parse FRED data
  if (macroData.T10Y3M && macroData.T10Y3M.length > 0) {
    const term_spread = macroData.T10Y3M[macroData.T10Y3M.length - 1].value;
    if (term_spread < 0) {
      key_insights.push("Inverted yield curve - recession risk elevated");
    } else if (term_spread > 2) {
      key_insights.push("Steep yield curve - expansion phase");
    }
  }

  if (macroData.DFF && macroData.DFF.length > 0) {
    const fed_funds = macroData.DFF[macroData.DFF.length - 1].value;
    if (fed_funds > 5) {
      key_insights.push("High interest rate environment - volatility risk");
    }
  }

  return { iv_regime, news_sentiment, macro_regime, key_insights };
}

// ============================================================================
// Phase 4: Intelligent Threshold Adjustment
// ============================================================================

export function adjustThresholds(
  ipsConfig: IPSConfig,
  market_factors: {
    iv_regime: string;
    news_sentiment: string;
    macro_regime: string;
    key_insights: string[];
  },
  historical_context: {
    similar_trades_count: number;
    success_rate: number | null;
    avg_pnl: number | null;
    common_patterns: string[];
    has_data: boolean;
  },
  guardrail_flags: Record<string, boolean>
): {
  adjusted_factors: Array<{ factor_key: string; original_threshold: number | null; adjusted_threshold: number | null }>;
  adjustments: Array<{ factor: string; original: string; adjusted: string; reason: string }>;
} {
  const adjusted_factors: Array<{
    factor_key: string;
    original_threshold: number | null;
    adjusted_threshold: number | null;
  }> = [];
  const adjustments: Array<{ factor: string; original: string; adjusted: string; reason: string }> = [];

  for (const factor of ipsConfig.factors) {
    if (!factor.enabled || factor.threshold == null) continue;

    let adjusted_threshold = factor.threshold;
    let adjustment_reason: string | null = null;

    switch (factor.factor_key) {
      case "delta_max":
        // Tighten delta if negative sentiment or earnings risk
        if (market_factors.news_sentiment === "negative" || guardrail_flags.earnings_risk) {
          const original = adjusted_threshold;
          adjusted_threshold = Math.max(0.10, adjusted_threshold * 0.75); // Reduce by 25%
          adjustment_reason = "Tightened due to negative sentiment/earnings risk";
          adjustments.push({
            factor: "Delta Max",
            original: original.toFixed(2),
            adjusted: adjusted_threshold.toFixed(2),
            reason: adjustment_reason,
          });
        }
        // Relax if strong historical success
        else if (
          historical_context.has_data &&
          historical_context.success_rate != null &&
          historical_context.success_rate > 75
        ) {
          const original = adjusted_threshold;
          adjusted_threshold = Math.min(0.40, adjusted_threshold * 1.15); // Increase by 15%
          adjustment_reason = "Relaxed due to strong historical win rate";
          adjustments.push({
            factor: "Delta Max",
            original: original.toFixed(2),
            adjusted: adjusted_threshold.toFixed(2),
            reason: adjustment_reason,
          });
        }
        break;

      case "iv_rank":
        // Lower IV requirement if strong historical pattern
        if (
          historical_context.has_data &&
          historical_context.success_rate != null &&
          historical_context.success_rate > 70
        ) {
          const original = adjusted_threshold;
          adjusted_threshold = Math.max(0.30, adjusted_threshold - 0.10); // Reduce by 10 percentile points
          adjustment_reason = "Lowered IV requirement due to proven historical edge";
          adjustments.push({
            factor: "IV Rank",
            original: original.toFixed(2),
            adjusted: adjusted_threshold.toFixed(2),
            reason: adjustment_reason,
          });
        }
        // Increase IV requirement in risk-off regime
        else if (market_factors.macro_regime === "risk_off") {
          const original = adjusted_threshold;
          adjusted_threshold = Math.min(0.80, adjusted_threshold + 0.10);
          adjustment_reason = "Increased IV requirement in risk-off environment";
          adjustments.push({
            factor: "IV Rank",
            original: original.toFixed(2),
            adjusted: adjusted_threshold.toFixed(2),
            reason: adjustment_reason,
          });
        }
        break;
    }

    adjusted_factors.push({
      factor_key: factor.factor_key,
      original_threshold: factor.threshold,
      adjusted_threshold,
    });
  }

  return { adjusted_factors, adjustments };
}

// ============================================================================
// Phase 5: Build Complete Reasoning Chain
// ============================================================================

export async function buildReasoningChain(
  candidate: Candidate,
  features: Features,
  ipsConfig: IPSConfig,
  macroData: Record<string, any>
): Promise<ReasoningChain> {
  // Phase 1: IPS Compliance
  const ips_analysis = analyzeIPSCompliance(candidate, features, ipsConfig);

  // Phase 2: Historical Context
  const historical_context = await queryHistoricalTrades(
    candidate.symbol,
    candidate.strategy,
    [20, 50]
  );

  // Phase 3: Market Research
  const market_factors = await synthesizeResearch(
    candidate.symbol,
    macroData,
    features
  );

  // Phase 4: Threshold Adjustments
  const { adjustments } = adjustThresholds(
    ipsConfig,
    market_factors,
    historical_context,
    candidate.guardrail_flags || {}
  );

  // Calculate adjusted score
  let adjusted_score = ips_analysis.baseline_score;

  // Apply bonuses/penalties
  if (historical_context.has_data && historical_context.success_rate != null) {
    if (historical_context.success_rate > 70) {
      adjusted_score += 10; // Bonus for proven success
    } else if (historical_context.success_rate < 40) {
      adjusted_score -= 15; // Penalty for poor history
    }
  }

  if (market_factors.iv_regime === "elevated") {
    adjusted_score += 5; // Bonus for high IV (good for sellers)
  } else if (market_factors.iv_regime === "compressed") {
    adjusted_score -= 5;
  }

  if (market_factors.news_sentiment === "negative") {
    adjusted_score -= 10;
  } else if (market_factors.news_sentiment === "positive") {
    adjusted_score += 5;
  }

  adjusted_score = Math.max(0, Math.min(100, adjusted_score));

  // Generate recommendation
  let recommendation: "ACCEPT" | "REJECT" | "REVIEW" = "REVIEW";
  let recommendation_reason = "";

  if (adjusted_score >= 60) {
    recommendation = "ACCEPT";
    recommendation_reason = "Meets adjusted IPS criteria with favorable market context";
    if (historical_context.has_data && historical_context.success_rate != null && historical_context.success_rate > 70) {
      recommendation_reason += " and strong historical performance";
    }
  } else if (adjusted_score < 40) {
    recommendation = "REJECT";
    recommendation_reason = "Below IPS threshold even with adjustments";
    if (ips_analysis.violations.length > 2) {
      recommendation_reason += ` (${ips_analysis.violations.length} factor violations)`;
    }
  } else {
    recommendation = "REVIEW";
    recommendation_reason = "Marginal fit - manual review recommended";
  }

  return {
    ips_baseline_score: ips_analysis.baseline_score,
    ips_compliance: {
      overall_pass: ips_analysis.violations.length === 0,
      violations: ips_analysis.violations,
      passes: ips_analysis.passes,
      factor_scores: ips_analysis.factor_scores,
    },
    historical_context,
    market_factors,
    threshold_adjustments: adjustments,
    adjusted_score,
    recommendation,
    recommendation_reason,
  };
}
