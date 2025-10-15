/**
 * Risk-Adjusted Scoring for Options Trades
 *
 * Evaluates trades based on risk-adjusted returns, not just raw ROI.
 * Uses expected value, Sharpe-like ratios, and capital efficiency.
 */

export interface TradeMetrics {
  // Basic trade data
  max_profit: number;
  max_loss: number;
  entry_mid: number;
  est_pop: number; // Probability of profit (0-1)
  dte: number;

  // Greeks
  delta?: number;
  theta?: number;
  vega?: number;

  // Additional context
  iv_rank?: number;
  liquidity_score?: number;
}

export interface RiskAdjustedScore {
  // Primary score (0-100)
  risk_adjusted_score: number;

  // Component scores
  expected_value_score: number;
  capital_efficiency_score: number;
  risk_reward_ratio_score: number;
  probability_weighted_score: number;
  sharpe_like_ratio: number;

  // Metrics
  expected_value: number;
  expected_value_per_dollar: number;
  roi_percentage: number;
  risk_of_ruin_adjusted_roi: number;

  // Comparison helpers
  kelly_fraction: number; // Kelly Criterion position size
  rank_explanation: string;
}

/**
 * Calculate comprehensive risk-adjusted score for an options trade
 */
export function calculateRiskAdjustedScore(metrics: TradeMetrics): RiskAdjustedScore {
  const {
    max_profit,
    max_loss,
    entry_mid,
    est_pop,
    dte,
    delta,
    theta,
    iv_rank,
  } = metrics;

  // 1. EXPECTED VALUE (EV)
  // EV = (Probability of Win × Max Profit) - (Probability of Loss × Max Loss)
  const prob_profit = est_pop || (1 - Math.abs(delta || 0.25)); // Use delta as proxy if no POP
  const prob_loss = 1 - prob_profit;

  const expected_value = (prob_profit * max_profit) - (prob_loss * max_loss);
  const expected_value_per_dollar = expected_value / max_loss; // EV per dollar at risk

  // Score EV per dollar (0-100 scale)
  // 0.10 EV/$ = 50pts, 0.20 EV/$ = 70pts, 0.30+ EV/$ = 100pts
  const ev_score = Math.min(100, Math.max(0, 50 + (expected_value_per_dollar - 0.10) * 250));

  // 2. CAPITAL EFFICIENCY
  // How much return per dollar of capital tied up, annualized
  const roi_percentage = (max_profit / max_loss) * 100;
  const days_to_annualized = 365 / (dte || 30);
  const annualized_roi = roi_percentage * days_to_annualized;

  // Score capital efficiency (0-100 scale)
  // 50% annualized = 60pts, 100% = 80pts, 200%+ = 100pts
  const capital_efficiency_score = Math.min(100, (annualized_roi / 200) * 100);

  // 3. RISK/REWARD RATIO (Traditional)
  // But weighted by probability
  const risk_reward_ratio = max_profit / max_loss;
  const rr_score = Math.min(100, risk_reward_ratio * 100); // Simple R:R score

  // 4. PROBABILITY-WEIGHTED RETURN
  // Favors high-probability trades
  // Penalizes low-probability trades even if R:R is good
  const prob_weighted_return = prob_profit * roi_percentage;
  const prob_weighted_score = Math.min(100, prob_weighted_return * 1.5); // Scale to 100

  // 5. SHARPE-LIKE RATIO
  // (Expected Return - Risk-Free Rate) / Standard Deviation
  // For options: Use EV as return, max_loss as "volatility" proxy
  const risk_free_rate = 0.05; // 5% annual
  const excess_return = expected_value_per_dollar - (risk_free_rate / days_to_annualized);
  const sharpe_like = excess_return / (max_loss / (max_loss + max_profit)); // Volatility proxy
  const sharpe_score = Math.min(100, Math.max(0, 50 + (sharpe_like * 50)));

  // 6. KELLY CRITERION
  // Optimal position sizing based on edge and odds
  // kelly_fraction = (prob_profit * (max_profit / max_loss) - prob_loss) / (max_profit / max_loss)
  const edge = prob_profit - prob_loss;
  const odds = max_profit / max_loss;
  const kelly_fraction = Math.max(0, (prob_profit * odds - prob_loss) / odds);

  // 7. RISK OF RUIN ADJUSTMENT
  // Penalize trades where one bad outcome hurts significantly
  // If max_loss is very large relative to max_profit, reduce score
  const ruin_factor = Math.min(1, max_profit / max_loss); // Caps at 1.0
  const ruin_adjusted_roi = roi_percentage * ruin_factor;

  // COMPOSITE RISK-ADJUSTED SCORE
  // Weights optimized for income trading - ROI priority with risk awareness:
  // - Traditional R:R (ROI): 50% (primary driver - maximize returns)
  // - Capital efficiency: 25% (time value of money for short DTE)
  // - Probability-weighted return: 15% (consider win probability)
  // - EV per dollar: 10% (basic risk check)
  // - Sharpe-like ratio: 0% (not needed with other risk metrics)
  const composite_score = (
    rr_score * 0.50 +
    capital_efficiency_score * 0.25 +
    prob_weighted_score * 0.15 +
    ev_score * 0.10 +
    sharpe_score * 0.00
  );

  // Explanation for ranking
  const rank_explanation = generateRankExplanation({
    ev_score,
    capital_efficiency_score,
    prob_weighted_score,
    sharpe_score,
    expected_value_per_dollar,
    prob_profit,
    roi_percentage,
    kelly_fraction,
  });

  return {
    risk_adjusted_score: Math.round(composite_score),
    expected_value_score: Math.round(ev_score),
    capital_efficiency_score: Math.round(capital_efficiency_score),
    risk_reward_ratio_score: Math.round(rr_score),
    probability_weighted_score: Math.round(prob_weighted_score),
    sharpe_like_ratio: sharpe_like,
    expected_value,
    expected_value_per_dollar,
    roi_percentage,
    risk_of_ruin_adjusted_roi: ruin_adjusted_roi,
    kelly_fraction,
    rank_explanation,
  };
}

/**
 * Generate human-readable explanation of why a trade ranks well/poorly
 */
function generateRankExplanation(scores: {
  ev_score: number;
  capital_efficiency_score: number;
  prob_weighted_score: number;
  sharpe_score: number;
  expected_value_per_dollar: number;
  prob_profit: number;
  roi_percentage: number;
  kelly_fraction: number;
}): string {
  const { ev_score, capital_efficiency_score, prob_weighted_score, expected_value_per_dollar, prob_profit, kelly_fraction } = scores;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Check EV
  if (ev_score >= 80) {
    strengths.push(`Excellent expected value ($${expected_value_per_dollar.toFixed(2)} per $1 at risk)`);
  } else if (ev_score < 50) {
    weaknesses.push(`Low expected value ($${expected_value_per_dollar.toFixed(2)} per $1 at risk)`);
  }

  // Check probability
  if (prob_profit >= 0.75) {
    strengths.push(`High win probability (${(prob_profit * 100).toFixed(0)}%)`);
  } else if (prob_profit < 0.65) {
    weaknesses.push(`Lower win probability (${(prob_profit * 100).toFixed(0)}%)`);
  }

  // Check capital efficiency
  if (capital_efficiency_score >= 80) {
    strengths.push("Efficient use of capital");
  } else if (capital_efficiency_score < 50) {
    weaknesses.push("Capital-intensive setup");
  }

  // Check Kelly sizing
  if (kelly_fraction >= 0.15) {
    strengths.push(`Strong edge (${(kelly_fraction * 100).toFixed(0)}% Kelly)`);
  } else if (kelly_fraction < 0.05) {
    weaknesses.push("Minimal statistical edge");
  }

  // Build explanation
  if (strengths.length > 0 && weaknesses.length === 0) {
    return `⭐ ${strengths.join(". ")}.`;
  } else if (strengths.length > 0) {
    return `${strengths.join(". ")}. However: ${weaknesses.join(", ")}.`;
  } else if (weaknesses.length > 0) {
    return `⚠️ ${weaknesses.join(". ")}.`;
  }

  return "Balanced risk/reward profile.";
}

/**
 * Compare two trades and explain which is better
 */
export function compareTrades(tradeA: RiskAdjustedScore, tradeB: RiskAdjustedScore): {
  winner: 'A' | 'B' | 'tie';
  reason: string;
  score_diff: number;
} {
  const diff = tradeA.risk_adjusted_score - tradeB.risk_adjusted_score;

  if (Math.abs(diff) < 3) {
    return {
      winner: 'tie',
      reason: 'Trades are roughly equivalent in risk-adjusted terms',
      score_diff: diff,
    };
  }

  const winner = diff > 0 ? 'A' : 'B';
  const better = winner === 'A' ? tradeA : tradeB;
  const worse = winner === 'A' ? tradeB : tradeA;

  // Explain why one is better
  const reasons: string[] = [];

  if (Math.abs(better.expected_value_per_dollar - worse.expected_value_per_dollar) > 0.05) {
    reasons.push(`better expected value ($${better.expected_value_per_dollar.toFixed(2)} vs $${worse.expected_value_per_dollar.toFixed(2)} per $1)`);
  }

  if (Math.abs(better.kelly_fraction - worse.kelly_fraction) > 0.05) {
    reasons.push(`stronger statistical edge (${(better.kelly_fraction * 100).toFixed(0)}% vs ${(worse.kelly_fraction * 100).toFixed(0)}% Kelly)`);
  }

  if (Math.abs(better.capital_efficiency_score - worse.capital_efficiency_score) > 15) {
    reasons.push(`more capital efficient`);
  }

  const reason = reasons.length > 0
    ? `Trade ${winner} is better due to ${reasons.join(' and ')}`
    : `Trade ${winner} has a higher overall risk-adjusted score`;

  return {
    winner,
    reason,
    score_diff: Math.abs(diff),
  };
}

/**
 * Example usage and validation
 */
export function exampleComparison() {
  // Your example: Delta 0.18, Premium 0.25
  const tradeA: TradeMetrics = {
    max_profit: 0.25,
    max_loss: 4.75, // Assume $5 wide spread
    entry_mid: 0.25,
    est_pop: 0.82, // ~18 delta = ~82% POP
    dte: 30,
    delta: 0.18,
  };

  // Your example: Delta 0.10, Premium 0.22
  const tradeB: TradeMetrics = {
    max_profit: 0.22,
    max_loss: 4.78,
    entry_mid: 0.22,
    est_pop: 0.90, // ~10 delta = ~90% POP
    dte: 30,
    delta: 0.10,
  };

  const scoreA = calculateRiskAdjustedScore(tradeA);
  const scoreB = calculateRiskAdjustedScore(tradeB);

  const comparison = compareTrades(scoreA, scoreB);

  console.log("\n=== TRADE COMPARISON ===\n");
  console.log("Trade A (0.18 delta, $0.25 credit):");
  console.log(`  Risk-Adjusted Score: ${scoreA.risk_adjusted_score}/100`);
  console.log(`  Expected Value: $${scoreA.expected_value.toFixed(3)}`);
  console.log(`  EV per Dollar: $${scoreA.expected_value_per_dollar.toFixed(3)}`);
  console.log(`  ROI: ${scoreA.roi_percentage.toFixed(1)}%`);
  console.log(`  Kelly Fraction: ${(scoreA.kelly_fraction * 100).toFixed(1)}%`);
  console.log(`  ${scoreA.rank_explanation}\n`);

  console.log("Trade B (0.10 delta, $0.22 credit):");
  console.log(`  Risk-Adjusted Score: ${scoreB.risk_adjusted_score}/100`);
  console.log(`  Expected Value: $${scoreB.expected_value.toFixed(3)}`);
  console.log(`  EV per Dollar: $${scoreB.expected_value_per_dollar.toFixed(3)}`);
  console.log(`  ROI: ${scoreB.roi_percentage.toFixed(1)}%`);
  console.log(`  Kelly Fraction: ${(scoreB.kelly_fraction * 100).toFixed(1)}%`);
  console.log(`  ${scoreB.rank_explanation}\n`);

  console.log(`Winner: Trade ${comparison.winner}`);
  console.log(`Reason: ${comparison.reason}`);
  console.log(`Score Difference: ${comparison.score_diff.toFixed(1)} points\n`);
}
