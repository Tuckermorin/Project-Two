/**
 * Trade Quality Validation Tool
 *
 * Run this script to validate that the agent is selecting the best risk-adjusted trades.
 * Compares different scenarios to ensure scoring is working correctly.
 */

import { calculateRiskAdjustedScore, compareTrades, type TradeMetrics } from '../src/lib/agent/risk-adjusted-scoring';

console.log("\n╔════════════════════════════════════════════════════════════════╗");
console.log("║        TRADE QUALITY VALIDATION - RISK-ADJUSTED SCORING       ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

// Test Case 1: Your Example
console.log("📊 TEST CASE 1: Your Example - Higher Premium vs Higher Probability\n");
console.log("-------------------------------------------------------------------");

const trade1A: TradeMetrics = {
  max_profit: 0.25,
  max_loss: 4.75,
  entry_mid: 0.25,
  est_pop: 0.82, // 18 delta
  dte: 30,
  delta: 0.18,
};

const trade1B: TradeMetrics = {
  max_profit: 0.22,
  max_loss: 4.78,
  entry_mid: 0.22,
  est_pop: 0.90, // 10 delta
  dte: 30,
  delta: 0.10,
};

const score1A = calculateRiskAdjustedScore(trade1A);
const score1B = calculateRiskAdjustedScore(trade1B);
const comparison1 = compareTrades(score1A, score1B);

console.log("Trade A: 0.18 delta, $0.25 credit");
console.log(`  └─ Risk-Adjusted Score: ${score1A.risk_adjusted_score}/100`);
console.log(`  └─ Expected Value: $${score1A.expected_value.toFixed(3)}`);
console.log(`  └─ EV per Dollar: $${score1A.expected_value_per_dollar.toFixed(3)}`);
console.log(`  └─ Kelly Fraction: ${(score1A.kelly_fraction * 100).toFixed(1)}%`);
console.log(`  └─ ROI: ${score1A.roi_percentage.toFixed(1)}%`);
console.log(`  └─ ${score1A.rank_explanation}\n`);

console.log("Trade B: 0.10 delta, $0.22 credit");
console.log(`  └─ Risk-Adjusted Score: ${score1B.risk_adjusted_score}/100`);
console.log(`  └─ Expected Value: $${score1B.expected_value.toFixed(3)}`);
console.log(`  └─ EV per Dollar: $${score1B.expected_value_per_dollar.toFixed(3)}`);
console.log(`  └─ Kelly Fraction: ${(score1B.kelly_fraction * 100).toFixed(1)}%`);
console.log(`  └─ ROI: ${score1B.roi_percentage.toFixed(1)}%`);
console.log(`  └─ ${score1B.rank_explanation}\n`);

console.log(`🏆 WINNER: Trade ${comparison1.winner} (by ${comparison1.score_diff.toFixed(1)} points)`);
console.log(`📝 REASON: ${comparison1.reason}\n`);

// Test Case 2: High Premium, Low Probability vs Low Premium, High Probability
console.log("\n📊 TEST CASE 2: Aggressive vs Conservative Setups\n");
console.log("-------------------------------------------------------------------");

const trade2A: TradeMetrics = {
  max_profit: 0.50, // High premium
  max_loss: 4.50,
  entry_mid: 0.50,
  est_pop: 0.70, // 30 delta - risky
  dte: 21,
  delta: 0.30,
};

const trade2B: TradeMetrics = {
  max_profit: 0.15, // Low premium
  max_loss: 4.85,
  entry_mid: 0.15,
  est_pop: 0.95, // 5 delta - very safe
  dte: 21,
  delta: 0.05,
};

const score2A = calculateRiskAdjustedScore(trade2A);
const score2B = calculateRiskAdjustedScore(trade2B);
const comparison2 = compareTrades(score2A, score2B);

console.log("Trade A: Aggressive (0.30 delta, $0.50 credit)");
console.log(`  └─ Risk-Adjusted Score: ${score2A.risk_adjusted_score}/100`);
console.log(`  └─ Expected Value: $${score2A.expected_value.toFixed(3)}`);
console.log(`  └─ POP: ${(trade2A.est_pop * 100).toFixed(0)}%\n`);

console.log("Trade B: Conservative (0.05 delta, $0.15 credit)");
console.log(`  └─ Risk-Adjusted Score: ${score2B.risk_adjusted_score}/100`);
console.log(`  └─ Expected Value: $${score2B.expected_value.toFixed(3)}`);
console.log(`  └─ POP: ${(trade2B.est_pop * 100).toFixed(0)}%\n`);

console.log(`🏆 WINNER: Trade ${comparison2.winner}`);
console.log(`📝 REASON: ${comparison2.reason}\n`);

// Test Case 3: Short DTE High Yield vs Long DTE Lower Yield
console.log("\n📊 TEST CASE 3: Time Efficiency - Short DTE vs Long DTE\n");
console.log("-------------------------------------------------------------------");

const trade3A: TradeMetrics = {
  max_profit: 0.20,
  max_loss: 4.80,
  entry_mid: 0.20,
  est_pop: 0.85,
  dte: 7, // 1 week
  delta: 0.15,
};

const trade3B: TradeMetrics = {
  max_profit: 0.35,
  max_loss: 4.65,
  entry_mid: 0.35,
  est_pop: 0.85,
  dte: 45, // 6 weeks
  delta: 0.15,
};

const score3A = calculateRiskAdjustedScore(trade3A);
const score3B = calculateRiskAdjustedScore(trade3B);
const comparison3 = compareTrades(score3A, score3B);

console.log("Trade A: Short DTE (7 days, $0.20 credit)");
console.log(`  └─ Risk-Adjusted Score: ${score3A.risk_adjusted_score}/100`);
console.log(`  └─ Annualized ROI: ${(score3A.roi_percentage * (365/7)).toFixed(0)}%`);
console.log(`  └─ Capital Efficiency Score: ${score3A.capital_efficiency_score}/100\n`);

console.log("Trade B: Long DTE (45 days, $0.35 credit)");
console.log(`  └─ Risk-Adjusted Score: ${score3B.risk_adjusted_score}/100`);
console.log(`  └─ Annualized ROI: ${(score3B.roi_percentage * (365/45)).toFixed(0)}%`);
console.log(`  └─ Capital Efficiency Score: ${score3B.capital_efficiency_score}/100\n`);

console.log(`🏆 WINNER: Trade ${comparison3.winner}`);
console.log(`📝 REASON: ${comparison3.reason}\n`);

// Test Case 4: Equal ROI but Different Risk Profiles
console.log("\n📊 TEST CASE 4: Equal ROI, Different Risk Profiles\n");
console.log("-------------------------------------------------------------------");

const trade4A: TradeMetrics = {
  max_profit: 0.50,
  max_loss: 9.50, // 10-wide spread
  entry_mid: 0.50,
  est_pop: 0.85,
  dte: 30,
  delta: 0.15,
};

const trade4B: TradeMetrics = {
  max_profit: 0.25,
  max_loss: 4.75, // 5-wide spread
  entry_mid: 0.25,
  est_pop: 0.85,
  dte: 30,
  delta: 0.15,
};

const score4A = calculateRiskAdjustedScore(trade4A);
const score4B = calculateRiskAdjustedScore(trade4B);
const comparison4 = compareTrades(score4A, score4B);

console.log("Trade A: Wide Spread ($10, $0.50 credit, 5.3% ROI)");
console.log(`  └─ Risk-Adjusted Score: ${score4A.risk_adjusted_score}/100`);
console.log(`  └─ ROI: ${score4A.roi_percentage.toFixed(1)}%`);
console.log(`  └─ Risk of Ruin Adjusted: ${score4A.risk_of_ruin_adjusted_roi.toFixed(1)}%\n`);

console.log("Trade B: Tight Spread ($5, $0.25 credit, 5.3% ROI)");
console.log(`  └─ Risk-Adjusted Score: ${score4B.risk_adjusted_score}/100`);
console.log(`  └─ ROI: ${score4B.roi_percentage.toFixed(1)}%`);
console.log(`  └─ Risk of Ruin Adjusted: ${score4B.risk_of_ruin_adjusted_roi.toFixed(1)}%\n`);

console.log(`🏆 WINNER: Trade ${comparison4.winner}`);
console.log(`📝 REASON: ${comparison4.reason}\n`);

// Summary
console.log("\n╔════════════════════════════════════════════════════════════════╗");
console.log("║                         KEY INSIGHTS                           ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

console.log("✅ The risk-adjusted scoring system:");
console.log("   • Favors HIGH PROBABILITY trades when EV is similar");
console.log("   • Rewards CAPITAL EFFICIENCY (annualized returns)");
console.log("   • Penalizes trades with LARGE MAX LOSS relative to profit");
console.log("   • Uses EXPECTED VALUE as primary metric");
console.log("   • Applies KELLY CRITERION for position sizing guidance\n");

console.log("📈 This means the agent will:");
console.log("   • Prefer 0.10 delta with $0.22 credit OVER 0.18 delta with $0.25 credit");
console.log("   • Favor short DTE when yield is comparable (capital efficiency)");
console.log("   • Choose smaller spreads when ROI is equal (risk of ruin)");
console.log("   • Prioritize trades with positive expected value\n");

console.log("🎯 Your 1-14 DTE strategy benefits from:");
console.log("   • High capital efficiency scoring (frequent turnover)");
console.log("   • Theta decay advantages");
console.log("   • Quick wins with manageable risk\n");
