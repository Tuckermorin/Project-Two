import type { SupabaseClient } from "@supabase/supabase-js";

export type ComputedFactorScore = {
  factorName: string;
  value: number | string | boolean | null;
  weight: number;
  individualScore: number;
  weightedScore: number;
  targetMet: boolean;
};

export type ScoreComputationResult = {
  finalScore: number;
  totalWeight: number;
  weightedSum: number;
  factorScores: ComputedFactorScore[];
  targetsMetCount: number;
  targetPercentage: number;
};

const clamp = (n: number) => {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
};

function computeIndividualScore(
  operator: string | null,
  val: number,
  targetValue: number | null,
  targetValueMax: number | null
): { score: number; met: boolean } {
  const tv = Number.isFinite(targetValue) ? Number(targetValue) : null;
  const tvMax = Number.isFinite(targetValueMax) ? Number(targetValueMax) : null;
  const v = Number(val);

  switch (operator) {
    case "gte": {
      if (tv == null) return { score: 0, met: false };
      if (v >= tv) {
        const excessRatio = (v - tv) / Math.max(tv, 1);
        return { score: clamp(70 + excessRatio * 30), met: true };
      }
      return { score: clamp((v / tv) * 100), met: false };
    }
    case "lte": {
      if (tv == null) return { score: 0, met: false };
      if (v <= tv) {
        const savings = (tv - v) / Math.max(tv, 1);
        return { score: clamp(70 + savings * 30), met: true };
      }
      const excess = (v - tv) / Math.max(tv, 1);
      return { score: clamp(70 - excess * 70), met: false };
    }
    case "eq": {
      if (tv == null) return { score: 0, met: false };
      const denom = Math.abs(tv) > 0 ? Math.abs(tv) : Math.max(Math.abs(v), 1);
      const relErr = Math.abs(v - tv) / denom;
      if (relErr <= 0.05) return { score: 100, met: true };
      if (relErr <= 0.1) return { score: 90, met: false };
      if (relErr <= 0.2) return { score: 75, met: false };
      if (relErr <= 0.5) return { score: 50, met: false };
      return { score: clamp(50 - relErr * 50), met: false };
    }
    case "range": {
      if (tv == null || tvMax == null) return { score: 0, met: false };
      if (v >= tv && v <= tvMax) {
        const rangeSize = tvMax - tv;
        if (rangeSize === 0) return { score: 100, met: true };
        const position = (v - tv) / rangeSize;
        const distanceFromCenter = Math.abs(position - 0.5);
        return { score: clamp(70 + (1 - distanceFromCenter * 2) * 30), met: true };
      }
      if (v < tv) {
        const distance = (tv - v) / Math.max(tv, 1);
        return { score: clamp(70 - distance * 70), met: false };
      }
      const distance = (v - tvMax) / Math.max(tvMax, 1);
      return { score: clamp(70 - distance * 70), met: false };
    }
    default:
      return { score: clamp(v != null ? Number(v) : 0), met: true };
  }
}

export async function computeIpsScore(
  supabase: SupabaseClient,
  ipsId: string,
  factorValues: Record<string, number | string | boolean | null | undefined>
): Promise<ScoreComputationResult> {
  const { data: ipsFactors, error } = await supabase
    .from("ips_factors")
    .select(
      `
        factor_name,
        weight,
        target_value,
        target_value_max,
        target_operator,
        preference_direction,
        enabled
      `
    )
    .eq("ips_id", ipsId)
    .eq("enabled", true);

  if (error) {
    throw new Error(`Failed to fetch IPS factors: ${error.message}`);
  }

  if (!ipsFactors || ipsFactors.length === 0) {
    return {
      finalScore: 0,
      totalWeight: 0,
      weightedSum: 0,
      factorScores: [],
      targetsMetCount: 0,
      targetPercentage: 0,
    };
  }

  const factorScores: ComputedFactorScore[] = [];
  let totalWeight = 0;
  let weightedSum = 0;
  let targetsMetCount = 0;

  for (const ipsFactor of ipsFactors) {
    const factorName = ipsFactor.factor_name;
    const rawValue = factorValues?.[factorName];

    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    const val = Number(rawValue);
    const weight = Number(ipsFactor.weight) || 0;
    const { score: individualScore, met: targetMet } = computeIndividualScore(
      ipsFactor.target_operator,
      val,
      ipsFactor.target_value,
      ipsFactor.target_value_max
    );
    const weightedScore = (individualScore * weight) / 100;

    factorScores.push({
      factorName,
      value: Number.isFinite(val) ? val : rawValue,
      weight,
      individualScore,
      weightedScore,
      targetMet,
    });

    totalWeight += weight;
    weightedSum += weightedScore;
    if (targetMet) targetsMetCount += 1;
  }

  const finalScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const validFactors = factorScores.length;
  const targetPercentage = validFactors > 0 ? (targetsMetCount / validFactors) * 100 : 0;

  return {
    finalScore,
    totalWeight,
    weightedSum,
    factorScores,
    targetsMetCount,
    targetPercentage,
  };
}
