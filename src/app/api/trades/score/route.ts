import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractFeatures, fingerprintForCaching } from '@/lib/scoring/feature-extractor';
import { loadStrategyRubric, defaultRubric } from '@/lib/scoring/rubric-loader';
import { scoreFeatures } from '@/lib/scoring/scoring-engine';
import { calibrateScore } from '@/lib/scoring/calibration';
import { lookupCachedScore, persistScore } from '@/lib/scoring/cache';
import { generateNarrative } from '@/lib/scoring/narrative';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function normaliseStrategy(contractType?: string | null): string {
  return (contractType || 'put-credit-spread').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

function determineConfidence(params: { violations: string[]; penalties: string[]; missing: string[]; outOfRange: number }): 'low' | 'medium' | 'high' {
  if (params.missing.length > 0 || params.outOfRange > 0 || params.violations.length > 0) {
    return 'low';
  }
  if (params.penalties.length > 0) {
    return 'medium';
  }
  return 'high';
}

function buildReasons(criterionScores: ReturnType<typeof scoreFeatures>['criterionScores'], penalties: string[]): string[] {
  const metricEntries = criterionScores.flatMap((criterion) =>
    criterion.metrics
      .filter((m) => m.score != null)
      .map((metric) => ({
        metric: metric.metric,
        score: metric.score ?? 0,
        raw: metric.rawValue,
        positive: (metric.score ?? 0) >= 70,
      })),
  );

  const positives = metricEntries.filter((m) => m.positive).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const negatives = metricEntries.filter((m) => !m.positive).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const reasons: string[] = [];
  const toDisplay = (entry: typeof metricEntries[number]): string => {
    const value = entry.raw;
    if (typeof value === 'number') {
      const isPct = entry.metric.includes('pct') || entry.metric.includes('percent');
      return `${entry.metric.replace(/_/g, ' ')} ${isPct ? `${(value * (isPct ? 100 : 1)).toFixed(isPct ? 0 : 2)}${isPct ? '%' : ''}` : value.toFixed(3)} ${entry.score >= 70 ? '(+)' : '(−)'}`;
    }
    return `${entry.metric.replace(/_/g, ' ')} ${String(value)} ${entry.score >= 70 ? '(+)' : '(−)'}`;
  };

  positives.slice(0, 3).forEach((entry) => reasons.push(toDisplay(entry)));
  negatives.slice(0, 2).forEach((entry) => {
    if (reasons.length < 5) reasons.push(toDisplay(entry));
  });

  for (const penalty of penalties) {
    if (reasons.length >= 5) break;
    reasons.push(`Penalty applied: ${penalty}`);
  }

  if (reasons.length < 3 && negatives.length > 0) {
    for (const entry of negatives) {
      if (reasons.length >= 3) break;
      const formatted = toDisplay(entry);
      if (!reasons.includes(formatted)) reasons.push(formatted);
    }
  }

  return reasons.slice(0, 5);
}

function buildFactorScores(criterionScores: ReturnType<typeof scoreFeatures>['criterionScores']) {
  const factors: Array<{ factorName: string; value: number | string | boolean | null; weight: number; individualScore: number | null; weightedScore: number; targetMet: boolean }> = [];
  for (const criterion of criterionScores) {
    const metricWeight = (criterion.weight || 0) / Math.max(1, criterion.metrics.length);
    for (const metric of criterion.metrics) {
      const value = metric.rawValue ?? null;
      const score = metric.score ?? null;
      const weightedScore = score != null ? score * metricWeight : 0;
      factors.push({
        factorName: `${criterion.criterion}.${metric.metric}`,
        value: typeof value === 'number' || typeof value === 'boolean' ? value : value ?? null,
        weight: metricWeight,
        individualScore: score,
        weightedScore,
        targetMet: metric.passed,
      });
    }
  }
  return factors;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ipsId, factorValues, tradeDraft, tradeId } = body;

    if (!ipsId || !factorValues || !tradeDraft) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: ipsId, factorValues, tradeDraft',
      }, { status: 400 });
    }

    const { data: ips, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ips) {
      return NextResponse.json({
        success: false,
        error: 'IPS configuration not found',
      }, { status: 404 });
    }

    const strategy = normaliseStrategy(tradeDraft?.contractType || body?.strategyId);
    const rubric = await loadStrategyRubric(strategy).catch(() => defaultRubric());

    const inputHash = fingerprintForCaching(rubric.rubric_version, {
      trade: tradeDraft,
      factors: factorValues,
      ipsId,
    });

    const cached = await lookupCachedScore(supabase as any, inputHash, rubric.rubric_version);
    if (cached?.details) {
      const details = cached.details;
      const analysis_output = {
        rubric_version: details.rubric_version ?? rubric.rubric_version,
        calibration_version: details.calibration_version ?? 'none',
        raw_score: Number(details.raw_score ?? cached.finalScore),
        calibrated_success_prob: Number(details.calibrated_success_prob ?? (cached.finalScore / 100)),
        reasons: details.reasons ?? [],
        violations: details.violations ?? [],
        confidence: details.confidence ?? 'medium',
        ips_id: ipsId,
        ips_version: details.ips_version ?? ips?.version ?? ips?.ips_version ?? null,
        input_hash: details.input_hash ?? inputHash,
      };
      return NextResponse.json({
        success: true,
        cache: true,
        data: {
          score: analysis_output.raw_score,
          scoreId: cached.id,
          breakdown: {
            totalWeight: details.total_weight ?? 1,
            weightedSum: details.weighted_sum ?? analysis_output.raw_score,
            factorScores: details.factor_scores ?? [],
            targetsMetCount: details.targets_met ?? 0,
            targetPercentage: details.target_percentage ?? 0,
          },
          timestamp: details.timestamp ?? new Date().toISOString(),
        },
        extracted_features: details.extracted_features ?? {},
        analysis_output,
        narrative: details.narrative ?? '',
      });
    }

    const extraction = extractFeatures(tradeDraft, factorValues);
    const ipsVersion = ips?.version ?? ips?.ips_version ?? ips?.rubric_version ?? null;

    if (!extraction.ok) {
      const neutralScore = 50;
      const violations = [extraction.error, ...extraction.missing.map((m) => `Missing: ${m}`), ...extraction.outOfRange.map((o) => `${o.field}: ${o.message}`)];
      const analysis_output = {
        rubric_version: rubric.rubric_version,
        calibration_version: 'none',
        raw_score: neutralScore,
        calibrated_success_prob: 0.5,
        reasons: ['Unable to score due to incomplete inputs.'],
        violations,
        confidence: 'low' as const,
        ips_id: ipsId,
        ips_version: ipsVersion,
        input_hash: inputHash,
      };
      const narrative = `Score defaulted to ${neutralScore} because required inputs were missing: ${extraction.missing.join(', ')}.`;
      return NextResponse.json({
        success: true,
        data: {
          score: neutralScore,
          scoreId: null,
          breakdown: {
            totalWeight: 0,
            weightedSum: 0,
            factorScores: [],
            targetsMetCount: 0,
            targetPercentage: 0,
          },
          timestamp: new Date().toISOString(),
        },
        extracted_features: {
          ...(extraction.features ?? {}),
          missing_fields: extraction.missing,
          out_of_range: extraction.outOfRange,
        },
        analysis_output,
        narrative,
      });
    }

    const aggregated = scoreFeatures(extraction.features, rubric);
    const calibration = calibrateScore(aggregated.rawScore);
    const factorScores = buildFactorScores(aggregated.criterionScores);

    const totalWeight = aggregated.criterionScores.reduce((sum, c) => sum + (c.weight || 0), 0) || 1;
    const weightedSum = aggregated.criterionScores.reduce((sum, c) => sum + c.score * (c.weight || 0), 0);
    const targetsMetCount = factorScores.filter((f) => f.targetMet).length;
    const targetPercentage = factorScores.length > 0 ? (targetsMetCount / factorScores.length) * 100 : 0;

    const reasons = buildReasons(aggregated.criterionScores, aggregated.penaltiesApplied);
    const confidence = determineConfidence({
      violations: aggregated.violations,
      penalties: aggregated.penaltiesApplied,
      missing: [],
      outOfRange: 0,
    });

    const seed = parseInt(inputHash.slice(0, 8), 16) % 2147483647;
    const narrative = await generateNarrative({
      score: aggregated.rawScore,
      calibratedProbability: calibration.calibratedProbability,
      reasons,
      confidence,
      rubricVersion: rubric.rubric_version,
      calibrationVersion: calibration.calibrationVersion,
      features: extraction.features,
      seed: Number.isFinite(seed) ? seed : 0,
    });

    const analysis_output = {
      rubric_version: rubric.rubric_version,
      calibration_version: calibration.calibrationVersion,
      raw_score: aggregated.rawScore,
      calibrated_success_prob: calibration.calibratedProbability,
      reasons,
      violations: aggregated.violations,
      confidence,
      ips_id: ipsId,
      ips_version: ipsVersion,
      input_hash: inputHash,
    };

    const calculationDetails = {
      ...analysis_output,
      factor_scores: factorScores,
      criterion_scores: aggregated.criterionScores,
      penalties: aggregated.penaltiesApplied,
      total_weight: totalWeight,
      weighted_sum: weightedSum,
      targets_met: targetsMetCount,
      target_percentage: targetPercentage,
      extracted_features: extraction.features,
      narrative,
      timestamp: new Date().toISOString(),
    };

    await persistScore(supabase as any, {
      ipsId,
      tradeId: tradeId ?? null,
      finalScore: aggregated.rawScore,
      totalWeight,
      factorScores,
      targetsMet: targetsMetCount,
      targetPercentage,
      calculationDetails,
    });

    return NextResponse.json({
      success: true,
      data: {
        score: aggregated.rawScore,
        scoreId: null,
        breakdown: {
          totalWeight,
          weightedSum,
          factorScores,
          targetsMetCount,
          targetPercentage,
        },
        timestamp: new Date().toISOString(),
      },
      extracted_features: extraction.features,
      analysis_output,
      narrative,
    });
  } catch (error) {
    console.error('Error calculating IPS score:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate IPS score',
    }, { status: 500 });
  }
}
