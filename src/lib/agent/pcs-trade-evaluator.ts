// Enhanced PCS Trade Evaluator
// Implements ChatGPT's sophisticated analysis framework

export interface PCSCandidate {
  symbol: string;
  strategy: 'put_credit_spread';
  short_strike: number;
  long_strike: number;
  credit: number;
  expiration_date: string;
  dte: number;
  short_delta: number;
  theta: number;
  vega: number;
  gamma?: number;
  iv_rank?: number;
  iv_percentile?: number;
  current_price: number;
  bid_ask_spread_short?: number;
  bid_ask_spread_long?: number;
  open_interest_short?: number;
  open_interest_long?: number;
  // Price history for momentum
  price_5d_ago?: number;
  ma_20?: number;
  ma_50?: number;
  ma_200?: number;
  // News
  news_count_7d?: number;
  news_count_90d?: number;
  // ATR
  atr_14?: number;
}

export interface TradeEvaluation {
  bottomLine: 'TAKE' | 'PASS' | 'TWEAK';
  score: number;
  hardGates: 'PASS' | 'FAIL';
  whatsGood: string[];
  whatsConcerning: string[];
  specificFixes: string[];
  managementRules: string[];
  factors: {
    creditToWidth: { value: number; pass: boolean; target: number };
    ror: { value: number; pass: boolean };
    theta: { value: number; pass: boolean; target: number };
    vega: { value: number; pass: boolean; target: number };
    delta: { value: number; pass: boolean; target: number };
    ivRank: { value: number | null; pass: boolean; target: number };
    momentum: { ret5d: number | null; aboveMAs: boolean; pass: boolean };
    newsZScore: { value: number | null; pass: boolean; target: number };
    liquidity: { pass: boolean; details: string };
  };
}

// Configuration
const DTE_CONFIG = {
  '0-7': { credit_width_min: 0.20, credit_width_target: 0.28, ror_min: 0.25, theta_min: 1.00 },
  '8-14': { credit_width_min: 0.25, credit_width_target: 0.30, ror_min: 0.33, theta_min: 0.80 },
};

const IVR_THRESHOLDS = {
  high: 60,
  target: 50,
  low_caution: 40,
  low_avoid: 35,
  critical: 30,
};

const NEWS_Z_THRESHOLDS = {
  hard_fail: 2.0,
  caution: 1.5,
  normal: 1.5,
};

const DELTA_THRESHOLDS = {
  max: 0.18,
  ivr_low_max: 0.15,
  ivr_critical_max: 0.12,
};

/**
 * Calculate credit-to-width ratio
 */
function calculateCreditToWidth(credit: number, width: number): number {
  return width > 0 ? credit / width : 0;
}

/**
 * Calculate return on risk
 */
function calculateROR(credit: number, width: number): number {
  const denominator = width - credit;
  return denominator > 0 ? credit / denominator : 0;
}

/**
 * Get DTE configuration
 */
function getDTEConfig(dte: number) {
  return dte <= 7 ? DTE_CONFIG['0-7'] : DTE_CONFIG['8-14'];
}

/**
 * Calculate 5-day momentum
 */
function calculate5DayReturn(currentPrice: number, price5dAgo: number | undefined): number | null {
  if (!price5dAgo || price5dAgo === 0) return null;
  return (currentPrice - price5dAgo) / price5dAgo;
}

/**
 * Check if price is above moving averages
 */
function checkMovingAverages(currentPrice: number, ma20?: number, ma50?: number): {
  above20: boolean;
  above50: boolean;
  both: boolean;
} {
  const above20 = ma20 ? currentPrice >= ma20 : false;
  const above50 = ma50 ? currentPrice >= ma50 : false;
  return { above20, above50, both: above20 && above50 };
}

/**
 * Calculate news volume z-score
 */
function calculateNewsZScore(
  newsCount7d: number | undefined,
  newsCount90d: number | undefined
): number | null {
  if (newsCount7d === undefined || newsCount90d === undefined) return null;

  // Simple approximation: assume daily average and std dev
  const dailyMean90 = newsCount90d / 90;
  const dailyStd90 = Math.sqrt(dailyMean90); // Poisson approximation

  if (dailyStd90 === 0) return 0;

  const mean7d = newsCount7d / 7;
  const z = (mean7d - dailyMean90) / dailyStd90;

  return z;
}

/**
 * Calculate ATR distance
 */
function calculateATRDistance(
  currentPrice: number,
  shortStrike: number,
  atr14: number | undefined
): number | null {
  if (!atr14 || atr14 === 0) return null;
  const distance = currentPrice - shortStrike;
  return distance / atr14; // Multiple of ATR
}

/**
 * Evaluate liquidity
 */
function evaluateLiquidity(trade: PCSCandidate): { pass: boolean; details: string; issues: string[] } {
  const issues: string[] = [];

  // Bid-ask spread check (≤ 0.5% per leg)
  const shortBidAskPct = trade.bid_ask_spread_short && trade.short_strike > 0
    ? (trade.bid_ask_spread_short / trade.short_strike) * 100
    : null;
  const longBidAskPct = trade.bid_ask_spread_long && trade.long_strike > 0
    ? (trade.bid_ask_spread_long / trade.long_strike) * 100
    : null;

  if (shortBidAskPct !== null && shortBidAskPct > 0.5) {
    issues.push(`Short leg bid-ask ${shortBidAskPct.toFixed(2)}% (target ≤0.5%)`);
  }
  if (longBidAskPct !== null && longBidAskPct > 0.5) {
    issues.push(`Long leg bid-ask ${longBidAskPct.toFixed(2)}% (target ≤0.5%)`);
  }

  // Open interest check (≥ 500 per leg)
  if (trade.open_interest_short !== undefined && trade.open_interest_short < 500) {
    issues.push(`Short leg OI ${trade.open_interest_short} (target ≥500)`);
  }
  if (trade.open_interest_long !== undefined && trade.open_interest_long < 500) {
    issues.push(`Long leg OI ${trade.open_interest_long} (target ≥500)`);
  }

  const pass = issues.length === 0;
  const details = pass ? 'Excellent liquidity' : issues.join('; ');

  return { pass, details, issues };
}

/**
 * Main evaluation function
 */
export function evaluatePCSTrade(trade: PCSCandidate): TradeEvaluation {
  const width = trade.short_strike - trade.long_strike;
  const dteConfig = getDTEConfig(trade.dte);

  // 1. Credit-to-width ratio
  const creditToWidth = calculateCreditToWidth(trade.credit, width);
  const creditToWidthPass = creditToWidth >= dteConfig.credit_width_min;

  // 2. Return on risk
  const ror = calculateROR(trade.credit, width);
  const rorPass = ror >= dteConfig.ror_min;

  // 3. Theta validation
  const thetaPass = trade.theta >= dteConfig.theta_min;

  // 4. Vega validation
  const vegaPass = trade.vega <= 0;

  // 5. Delta validation (will adjust based on IVR)
  const ivRank = trade.iv_rank ?? trade.iv_percentile ?? null;
  let deltaMax = DELTA_THRESHOLDS.max;
  if (ivRank !== null) {
    if (ivRank < IVR_THRESHOLDS.critical) {
      deltaMax = DELTA_THRESHOLDS.ivr_critical_max;
    } else if (ivRank < IVR_THRESHOLDS.low_caution) {
      deltaMax = DELTA_THRESHOLDS.ivr_low_max;
    }
  }
  const deltaPass = Math.abs(trade.short_delta) <= deltaMax;

  // 6. IV Rank validation
  const ivrTarget = ivRank !== null && ivRank < IVR_THRESHOLDS.low_caution ? IVR_THRESHOLDS.target : IVR_THRESHOLDS.low_avoid;
  const ivrPass = ivRank !== null ? ivRank >= IVR_THRESHOLDS.low_avoid : true; // Pass if unknown

  // 7. Momentum
  const ret5d = calculate5DayReturn(trade.current_price, trade.price_5d_ago);
  const mas = checkMovingAverages(trade.current_price, trade.ma_20, trade.ma_50);
  const momentumPass = (ret5d !== null ? ret5d >= 0 : true) && mas.both;

  // 8. News z-score
  const newsZ = calculateNewsZScore(trade.news_count_7d, trade.news_count_90d);
  const newsZPass = newsZ !== null ? newsZ <= NEWS_Z_THRESHOLDS.hard_fail : true;

  // 9. Liquidity
  const liquidity = evaluateLiquidity(trade);

  // Hard gates
  const hardGates: boolean =
    thetaPass &&
    vegaPass &&
    deltaPass &&
    newsZPass &&
    liquidity.pass;

  // IVR compensation logic
  let compensationNeeded = false;
  let compensationRequirements: string[] = [];

  if (ivRank !== null && ivRank < IVR_THRESHOLDS.low_caution && ivRank >= IVR_THRESHOLDS.low_avoid) {
    // IVR 35-40: require compensation
    compensationNeeded = true;
    const ret5dStrong = ret5d !== null && ret5d >= 0.005; // ≥0.5%
    const creditStrong = creditToWidth >= 0.28;
    const newsCalm = newsZ !== null && newsZ <= 1.5;
    const deltaStrict = Math.abs(trade.short_delta) <= 0.15;

    if (!ret5dStrong) compensationRequirements.push('5-day return ≥ +0.5%');
    if (!creditStrong) compensationRequirements.push('Credit/width ≥ 28%');
    if (!newsCalm) compensationRequirements.push('News z-score ≤ 1.5');
    if (!deltaStrict) compensationRequirements.push('Delta ≤ 0.15');
  } else if (ivRank !== null && ivRank < IVR_THRESHOLDS.low_avoid) {
    // IVR < 35: skip or very strict compensation
    compensationNeeded = true;
    compensationRequirements.push('IVR too low (<35) - consider skipping or switching ticker');
  }

  // Build evaluation
  const whatsGood: string[] = [];
  const whatsConcerning: string[] = [];
  const specificFixes: string[] = [];

  // What's good
  if (deltaPass) whatsGood.push(`Delta ${Math.abs(trade.short_delta).toFixed(2)} within target (≤${deltaMax.toFixed(2)})`);
  if (liquidity.pass) whatsGood.push('Excellent liquidity (OI and bid-ask)');
  if (thetaPass) whatsGood.push(`Theta +$${trade.theta.toFixed(2)}/day (target ≥$${dteConfig.theta_min.toFixed(2)})`);
  if (momentumPass && ret5d !== null) whatsGood.push(`Strong momentum (5d return ${(ret5d * 100).toFixed(1)}%, above MAs)`);
  if (creditToWidthPass) whatsGood.push(`Credit/width ${(creditToWidth * 100).toFixed(1)}% (target ≥${(dteConfig.credit_width_min * 100).toFixed(0)}%)`);

  // What's concerning
  if (!creditToWidthPass) {
    whatsConcerning.push(`Credit too thin: ${(creditToWidth * 100).toFixed(1)}% of width (target ${(dteConfig.credit_width_target * 100).toFixed(0)}%)`);
    specificFixes.push(`Move short strike closer to ATM to improve credit while keeping Δ ≤${deltaMax.toFixed(2)}`);
  }
  if (!thetaPass) {
    whatsConcerning.push(`Theta ${trade.theta.toFixed(2)} below minimum $${dteConfig.theta_min.toFixed(2)}/day`);
    specificFixes.push('Widen spread or adjust DTE to improve theta');
  }
  if (!vegaPass) {
    whatsConcerning.push(`Vega positive (+${trade.vega.toFixed(2)}) - should be negative for PCS`);
    specificFixes.push('Widen spread or move strikes to flip vega negative');
  }
  if (!momentumPass) {
    const issues = [];
    if (ret5d !== null && ret5d < 0) issues.push(`5d return ${(ret5d * 100).toFixed(1)}%`);
    if (!mas.above20) issues.push('below 20-DMA');
    if (!mas.above50) issues.push('below 50-DMA');
    whatsConcerning.push(`Momentum soft: ${issues.join(', ')}`);
    specificFixes.push('Wait for price to recover above moving averages');
  }
  if (newsZ !== null && newsZ > NEWS_Z_THRESHOLDS.caution) {
    whatsConcerning.push(`News volume spike: z-score ${newsZ.toFixed(1)} (elevated gap risk)`);
    specificFixes.push(`Wait until news z-score ≤ ${NEWS_Z_THRESHOLDS.caution}`);
  }
  if (!ivrPass && ivRank !== null) {
    whatsConcerning.push(`IV Rank ${ivRank.toFixed(0)} below minimum ${IVR_THRESHOLDS.low_avoid}`);
    specificFixes.push('Switch to different ticker with higher IV Rank');
  }
  if (compensationRequirements.length > 0) {
    whatsConcerning.push(`IVR ${ivRank?.toFixed(0)} requires compensation: ${compensationRequirements.join(', ')}`);
  }
  if (!liquidity.pass) {
    whatsConcerning.push(`Liquidity concerns: ${liquidity.details}`);
    specificFixes.push('Consider more liquid strikes or skip this trade');
  }

  // Bottom line decision
  let bottomLine: 'TAKE' | 'PASS' | 'TWEAK';
  if (!hardGates) {
    bottomLine = 'PASS';
  } else if (compensationRequirements.length > 0 || !creditToWidthPass || !momentumPass) {
    bottomLine = 'TWEAK';
  } else {
    bottomLine = 'TAKE';
  }

  // Calculate score (0-100)
  const factorScores = [
    creditToWidthPass ? 15 : 0,
    rorPass ? 10 : 0,
    thetaPass ? 15 : 0,
    vegaPass ? 10 : 0,
    deltaPass ? 15 : 0,
    ivrPass ? 15 : 0,
    momentumPass ? 10 : 0,
    newsZPass ? 5 : 0,
    liquidity.pass ? 5 : 0,
  ];
  const score = factorScores.reduce((a, b) => a + b, 0);

  // Management rules
  const managementRules = [
    `Profit-take: 50-60% of max profit or when short Δ < 0.06`,
    `Risk cap: Roll/close if short Δ > 0.30`,
    `Momentum break: Close on close below 50-DMA + news spike`,
    `Time: Close at T-2 if profits < 30% to avoid gamma risk`,
    `No earnings/ex-div within trade life`,
  ];

  return {
    bottomLine,
    score,
    hardGates: hardGates ? 'PASS' : 'FAIL',
    whatsGood,
    whatsConcerning,
    specificFixes,
    managementRules,
    factors: {
      creditToWidth: { value: creditToWidth, pass: creditToWidthPass, target: dteConfig.credit_width_target },
      ror: { value: ror, pass: rorPass },
      theta: { value: trade.theta, pass: thetaPass, target: dteConfig.theta_min },
      vega: { value: trade.vega, pass: vegaPass, target: 0 },
      delta: { value: Math.abs(trade.short_delta), pass: deltaPass, target: deltaMax },
      ivRank: { value: ivRank, pass: ivrPass, target: ivrTarget },
      momentum: { ret5d, aboveMAs: mas.both, pass: momentumPass },
      newsZScore: { value: newsZ, pass: newsZPass, target: NEWS_Z_THRESHOLDS.normal },
      liquidity: { pass: liquidity.pass, details: liquidity.details },
    },
  };
}

/**
 * Format evaluation for display
 */
export function formatEvaluation(evaluation: TradeEvaluation): string {
  const lines = [
    `Bottom line: ${evaluation.bottomLine}`,
    `Score: ${evaluation.score}/100 | Hard Gates: ${evaluation.hardGates}`,
    '',
    'What\'s good:',
    ...evaluation.whatsGood.map(g => `  ✓ ${g}`),
    '',
  ];

  if (evaluation.whatsConcerning.length > 0) {
    lines.push('What\'s concerning:');
    lines.push(...evaluation.whatsConcerning.map(c => `  ⚠ ${c}`));
    lines.push('');
  }

  if (evaluation.specificFixes.length > 0 && evaluation.bottomLine === 'TWEAK') {
    lines.push('Specific fixes:');
    lines.push(...evaluation.specificFixes.map(f => `  → ${f}`));
    lines.push('');
  }

  if (evaluation.bottomLine === 'TAKE') {
    lines.push('Management rules:');
    lines.push(...evaluation.managementRules.map(r => `  • ${r}`));
  }

  return lines.join('\n');
}
