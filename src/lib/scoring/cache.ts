import type { SupabaseClient, CachedScorePayload } from "./types";

export async function lookupCachedScore(
  supabase: SupabaseClient,
  inputHash: string,
  rubricVersion: string,
) {
  try {
    const { data, error } = await supabase
      .from("ips_score_calculations")
      .select("id, final_score, calculation_details")
      .contains("calculation_details", { input_hash: inputHash, rubric_version: rubricVersion })
      .maybeSingle();

    if (error || !data) return null;
    const details = (data.calculation_details || {}) as Record<string, any>;
    return {
      id: data.id,
      finalScore: Number(data.final_score) || 0,
      details,
    };
  } catch (error) {
    console.error("Cache lookup failed", error);
    return null;
  }
}

export async function persistScore(
  supabase: SupabaseClient,
  payload: {
    ipsId: string;
    tradeId?: string | null;
    finalScore: number;
    totalWeight: number;
    factorScores: any[];
    targetsMet: number;
    targetPercentage: number;
    calculationDetails: Record<string, any>;
  },
) {
  const base = {
    ips_id: payload.ipsId,
    trade_id: payload.tradeId ?? null,
    final_score: payload.finalScore,
    total_weight: payload.totalWeight,
    factors_used: payload.factorScores.length,
    targets_met: payload.targetsMet,
    target_percentage: payload.targetPercentage,
    calculation_details: payload.calculationDetails,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("ips_score_calculations")
      .insert(base)
      .select()
      .maybeSingle();
    if (error) {
      console.error("Failed to persist score", error);
    }
    if (data?.id) {
      const inserts = payload.factorScores.map((fs) => ({
        ips_score_calculation_id: data.id,
        factor_name: fs.metric ?? fs.factorName ?? fs.metricName,
        factor_value: fs.rawValue ?? fs.value ?? null,
        weight: fs.weight ?? null,
        individual_score: fs.score ?? fs.individualScore ?? null,
        weighted_score: fs.weightedScore ?? null,
        target_met: fs.passed ?? fs.targetMet ?? null,
        created_at: new Date().toISOString(),
      }));
      if (inserts.length > 0) {
        const { error: factorError } = await supabase
          .from("factor_score_details")
          .insert(inserts);
        if (factorError) {
          console.error("Failed to persist factor details", factorError);
        }
      }
    }
    return data;
  } catch (error) {
    console.error("Persist score failed", error);
    return null;
  }
}

export function buildCachePayload(details: Record<string, any>): CachedScorePayload {
  return {
    rubric_version: details.rubric_version,
    calibration_version: details.calibration_version,
    raw_score: details.raw_score,
    calibrated_success_prob: details.calibrated_success_prob,
    reasons: details.reasons ?? [],
    violations: details.violations ?? [],
    confidence: details.confidence ?? "medium",
    ips_id: details.ips_id,
    ips_version: details.ips_version,
    input_hash: details.input_hash,
  } satisfies CachedScorePayload;
}
