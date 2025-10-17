// Enhanced IPS Scoring System
// Implements granular factor scoring, tier classification, and diversification tracking

export type FactorDetail = {
  factor_key: string;
  factor_name: string;
  value: number | null;
  target: string;
  target_min?: number;
  target_max?: number;
  passed: boolean;
  weight: number;
  distance: number; // How far from target (negative = below, positive = above for favorable)
  severity: 'pass' | 'minor_miss' | 'major_miss';
};

export type TierClassification = 'elite' | 'quality' | 'speculative';

export type EnhancedIPSResult = {
  ips_score: number;
  tier: TierClassification | null;
  factor_details: FactorDetail[];
  passed_factors: FactorDetail[];
  minor_misses: FactorDetail[];
  major_misses: FactorDetail[];
  total_weight_passed: number;
  total_weight_minor: number;
  total_weight_major: number;
};

/**
 * Calculate enhanced IPS score with granular factor details
 */
export function calculateEnhancedIPSScore(
  candidate: any,
  ipsConfig: any
): EnhancedIPSResult {
  if (!ipsConfig || !ipsConfig.factors) {
    return {
      ips_score: 50,
      tier: null,
      factor_details: [],
      passed_factors: [],
      minor_misses: [],
      major_misses: [],
      total_weight_passed: 0,
      total_weight_minor: 0,
      total_weight_major: 0,
    };
  }

  const factorDetails: FactorDetail[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  // Get delta from contract legs
  const shortLeg = candidate.contract_legs?.find((l: any) => l.type === "SELL");
  const delta = shortLeg?.delta ? Math.abs(shortLeg.delta) : 0.25;

  for (const factor of ipsConfig.factors) {
    if (!factor.enabled) continue;

    totalWeight += factor.weight;

    const factorKey = factor.factor_key;
    let actualValue: number | null = null;
    let targetDesc = "";
    let targetMin: number | undefined;
    let targetMax: number | undefined;

    // Map factor keys to actual values
    switch (factorKey) {
      case "iv_rank":
        actualValue = candidate.iv_rank ?? null;
        targetMin = factor.threshold;
        targetDesc = factor.threshold != null
          ? `≥${factor.threshold}`
          : "optimized";
        break;
      case "delta_max":
        actualValue = delta;
        targetMax = factor.threshold ?? 0.30;
        targetDesc = `≤${targetMax}`;
        break;
      case "term_slope":
        actualValue = candidate.term_slope ?? null;
        targetMin = factor.threshold ?? 0;
        targetDesc = factor.threshold != null
          ? `≥${factor.threshold}`
          : "positive preferred";
        break;
      case "volume_oi_ratio":
        actualValue = candidate.volume_oi_ratio ?? null;
        targetMin = factor.threshold ?? 0.5;
        targetDesc = `≥${targetMin}`;
        break;
      case "put_skew":
        actualValue = candidate.put_skew ?? null;
        targetMin = factor.threshold ?? 0.95;
        targetDesc = `≥${targetMin}`;
        break;
      default:
        // Try to get from candidate directly
        actualValue = candidate[factorKey] ?? null;
        targetDesc = factor.threshold != null
          ? `${factor.direction === "gte" ? "≥" : "≤"}${factor.threshold}`
          : "see IPS";
    }

    // Determine if passed and calculate distance
    let passed = true;
    let distance = 0;

    if (actualValue !== null) {
      if (targetMin !== undefined && targetMax !== undefined) {
        // Range target (e.g., DTE 30-45)
        passed = actualValue >= targetMin && actualValue <= targetMax;
        if (actualValue < targetMin) {
          distance = actualValue - targetMin; // Negative = below range
        } else if (actualValue > targetMax) {
          distance = actualValue - targetMax; // Positive = above range
        }
      } else if (targetMin !== undefined) {
        // Minimum target (e.g., IV Rank ≥70)
        passed = actualValue >= targetMin;
        distance = actualValue - targetMin; // Negative = below target
      } else if (targetMax !== undefined) {
        // Maximum target (e.g., Delta ≤0.30)
        passed = actualValue <= targetMax;
        distance = targetMax - actualValue; // Positive = room to spare, negative = exceeded
      }
    } else {
      // Missing data = fail
      passed = false;
      distance = -999; // Flag as missing
    }

    // Calculate severity of miss
    let severity: 'pass' | 'minor_miss' | 'major_miss' = 'pass';
    if (!passed) {
      // Define "minor" as within 10% of target
      const threshold = targetMin ?? targetMax ?? 0;
      const toleranceRange = Math.abs(threshold * 0.1);
      severity = Math.abs(distance) <= toleranceRange ? 'minor_miss' : 'major_miss';
    }

    // Calculate factor score based on distance
    let factorScore = 100;
    if (!passed) {
      if (severity === 'minor_miss') {
        // Minor miss = 70-90 points based on distance
        const missRatio = Math.abs(distance) / (Math.abs(targetMin ?? targetMax ?? 1) * 0.1);
        factorScore = Math.max(70, 90 - (missRatio * 20));
      } else {
        // Major miss = 30-70 points based on how far off
        const missRatio = Math.min(1, Math.abs(distance) / (Math.abs(targetMin ?? targetMax ?? 1)));
        factorScore = Math.max(30, 70 - (missRatio * 40));
      }
    }

    weightedScore += factorScore * factor.weight;

    const detail: FactorDetail = {
      factor_key: factorKey,
      factor_name: factor.display_name || factor.factor_name,
      value: actualValue,
      target: targetDesc,
      target_min: targetMin,
      target_max: targetMax,
      passed,
      weight: factor.weight,
      distance,
      severity,
    };

    factorDetails.push(detail);
  }

  const ipsScore = totalWeight > 0 ? (weightedScore / totalWeight) : 50;

  // Classify into tiers
  const tier: TierClassification | null =
    ipsScore >= 90 ? 'elite' :
    ipsScore >= 75 ? 'quality' :
    ipsScore >= 60 ? 'speculative' :
    null;

  // Separate factors by outcome
  const passedFactors = factorDetails.filter(f => f.passed);
  const minorMisses = factorDetails.filter(f => f.severity === 'minor_miss');
  const majorMisses = factorDetails.filter(f => f.severity === 'major_miss');

  const totalWeightPassed = passedFactors.reduce((sum, f) => sum + f.weight, 0);
  const totalWeightMinor = minorMisses.reduce((sum, f) => sum + f.weight, 0);
  const totalWeightMajor = majorMisses.reduce((sum, f) => sum + f.weight, 0);

  return {
    ips_score: ipsScore,
    tier,
    factor_details: factorDetails,
    passed_factors: passedFactors,
    minor_misses: minorMisses,
    major_misses: majorMisses,
    total_weight_passed: totalWeightPassed,
    total_weight_minor: totalWeightMinor,
    total_weight_major: totalWeightMajor,
  };
}

/**
 * Calculate portfolio diversity score based on sector, symbol, and strategy distribution
 */
export function calculateDiversityScore(
  candidates: any[],
  currentCandidate: any
): number {
  if (candidates.length === 0) return 100;

  // Count occurrences
  const sectorCount = candidates.filter(c => c.sector === currentCandidate.sector).length;
  const symbolCount = candidates.filter(c => c.symbol === currentCandidate.symbol).length;
  const strategyCount = candidates.filter(c => c.strategy === currentCandidate.strategy).length;

  // Penalties for over-concentration
  const sectorPenalty = Math.min(30, sectorCount * 10); // -10 per duplicate sector
  const symbolPenalty = Math.min(40, symbolCount * 20); // -20 per duplicate symbol
  const strategyPenalty = Math.min(20, strategyCount * 5); // -5 per duplicate strategy

  const diversityScore = Math.max(0, 100 - sectorPenalty - symbolPenalty - strategyPenalty);

  return diversityScore;
}

/**
 * Apply diversification filters to candidate list
 */
export function applyDiversificationFilters(
  candidates: any[],
  options: {
    maxPerSector?: number;
    maxPerSymbol?: number;
    maxPerStrategy?: number;
  } = {}
): any[] {
  const {
    maxPerSector = 3,
    maxPerSymbol = 2,
    maxPerStrategy = 10, // Less restrictive for strategies
  } = options;

  const selected: any[] = [];
  const sectorCounts: Record<string, number> = {};
  const symbolCounts: Record<string, number> = {};
  const strategyCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    const sector = candidate.sector || 'Unknown';
    const symbol = candidate.symbol;
    const strategy = candidate.strategy;

    // Check caps
    const sectorOk = (sectorCounts[sector] || 0) < maxPerSector;
    const symbolOk = (symbolCounts[symbol] || 0) < maxPerSymbol;
    const strategyOk = (strategyCounts[strategy] || 0) < maxPerStrategy;

    if (sectorOk && symbolOk && strategyOk) {
      selected.push(candidate);
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
      symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
    } else {
      console.log(
        `[Diversification] Filtered ${symbol}: ` +
        `Sector=${!sectorOk ? '❌' : '✓'} Symbol=${!symbolOk ? '❌' : '✓'} Strategy=${!strategyOk ? '✓' : '❌'}`
      );
    }
  }

  return selected;
}
