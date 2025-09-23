import type {
  AggregatedScore,
  CriterionScore,
  MetricScore,
  StrategyRubric,
} from "./types";
import type { ExtractedFeatures } from "./types";

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Number(value.toFixed(2));
}

function evaluateNumericTable(value: number, table: Array<[number, number]>): number {
  if (table.length === 0) return 0;
  const increasing = table[table.length - 1][1] >= table[0][1];
  const sorted = [...table].sort((a, b) => a[0] - b[0]);
  if (increasing) {
    let score = sorted[0][1];
    for (const [threshold, s] of sorted) {
      if (value >= threshold) {
        score = s;
      }
    }
    return clampScore(score);
  }
  for (const [threshold, s] of sorted) {
    if (value <= threshold) {
      return clampScore(s);
    }
  }
  return clampScore(sorted[sorted.length - 1][1]);
}

function evaluateBooleanMap(value: boolean | string, mapping: Record<string, number>): number {
  const values = Object.values(mapping);
  const hasNegative = values.some((v) => v < 0);
  const resolve = (key: string) => {
    if (!(key in mapping)) return null;
    const raw = mapping[key];
    if (hasNegative) {
      return clampScore(100 + raw);
    }
    return clampScore(raw);
  };

  if (typeof value === "boolean") {
    const key = value ? "true" : "false";
    const found = resolve(key);
    if (found != null) return found;
  }
  const key = String(value);
  const fallback = resolve(key);
  if (fallback != null) return fallback;
  return 0;
}

function renderReason(metric: string, rawValue: number | string | boolean | null, score: number): string {
  if (rawValue == null) {
    return `${metric}: missing (neutral)`;
  }
  if (typeof rawValue === "number") {
    return `${metric}: ${rawValue} → ${score}`;
  }
  return `${metric}: ${String(rawValue)} → ${score}`;
}

export function scoreFeatures(
  features: ExtractedFeatures,
  rubric: StrategyRubric,
): AggregatedScore {
  const criterionScores: CriterionScore[] = [];
  const penaltiesApplied: string[] = [];
  const violations: string[] = [];

  for (const [criterionName, metricsConfig] of Object.entries(rubric.criteria)) {
    const metrics: MetricScore[] = [];
    for (const [metricKey, metricConfig] of Object.entries(metricsConfig)) {
      const rawValue = features[metricKey];
      let metricScore: number | null = null;
      if (rawValue == null) {
        metrics.push({
          metric: metricKey,
          rawValue: null,
          score: null,
          reason: `${metricKey}: missing`,
          passed: false,
        });
        continue;
      }

      if (Array.isArray(metricConfig)) {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          metrics.push({
            metric: metricKey,
            rawValue,
            score: null,
            reason: `${metricKey}: invalid numeric value`,
            passed: false,
          });
          continue;
        }
        metricScore = evaluateNumericTable(numericValue, metricConfig);
      } else {
        metricScore = evaluateBooleanMap(rawValue as any, metricConfig as Record<string, number>);
      }

      metrics.push({
        metric: metricKey,
        rawValue: rawValue as any,
        score: metricScore,
        reason: renderReason(metricKey, rawValue as any, metricScore),
        passed: (metricScore ?? 0) >= 70,
      });
    }

    const available = metrics.filter((m) => m.score != null);
    const criterionScore =
      available.length > 0
        ? available.reduce((sum, m) => sum + (m.score ?? 0), 0) / available.length
        : 50;

    criterionScores.push({
      criterion: criterionName,
      weight: rubric.weights[criterionName] ?? 0,
      metrics,
      score: clampScore(criterionScore),
    });
  }

  const totalWeight = criterionScores.reduce((sum, c) => sum + (c.weight || 0), 0) || 1;
  let weightedSum = 0;
  for (const c of criterionScores) {
    const weight = c.weight || 0;
    const normalizedWeight = weight / totalWeight;
    weightedSum += c.score * normalizedWeight;
  }

  let rawScore = clampScore(weightedSum);

  // Apply penalties
  for (const rule of rubric.aggregation.penalties || []) {
    const match = rule.if.match(/^(?<field>[a-z0-9_]+)\s*(?<op><=|>=|<|>)\s*(?<value>-?\d+(?:\.\d+)?)/i);
    if (!match || !match.groups) continue;
    const { field, op, value } = match.groups;
    const numericValue = Number(value);
    const featureValue = Number(features[field as keyof ExtractedFeatures]);
    let shouldPenalize = false;
    if (!Number.isFinite(featureValue)) continue;
    switch (op) {
      case "<":
        shouldPenalize = featureValue < numericValue;
        break;
      case ">":
        shouldPenalize = featureValue > numericValue;
        break;
      case "<=":
        shouldPenalize = featureValue <= numericValue;
        break;
      case ">=":
        shouldPenalize = featureValue >= numericValue;
        break;
      default:
        shouldPenalize = false;
    }
    if (shouldPenalize) {
      rawScore = clampScore(rawScore - rule.minus);
      penaltiesApplied.push(`${rule.if} (-${rule.minus})`);
    }
  }

  const { caps } = rubric.aggregation;
  if (caps?.min != null && rawScore < caps.min) {
    rawScore = caps.min;
  }
  if (caps?.max != null && rawScore > caps.max) {
    rawScore = caps.max;
  }

  const required = rubric.required_features || [];
  for (const field of required) {
    if (features[field as keyof ExtractedFeatures] == null) {
      violations.push(`Missing required feature: ${field}`);
    }
  }

  return {
    rawScore: clampScore(rawScore),
    penaltiesApplied,
    violations,
    criterionScores,
  } satisfies AggregatedScore;
}
