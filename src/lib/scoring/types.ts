export type RubricMetricTable = Array<[number, number]>;

export type RubricBooleanMap = Record<string, number>;

export type RubricMetricConfig = RubricMetricTable | RubricBooleanMap;

export interface RubricCriterionConfig {
  [metric: string]: RubricMetricConfig;
}

export interface RubricAggregationRule {
  if: string;
  minus: number;
}

export interface RubricAggregationConfig {
  method: "weighted_mean";
  caps?: { min?: number; max?: number };
  penalties?: RubricAggregationRule[];
}

export interface StrategyRubric {
  name: string;
  strategy?: string;
  rubric_version: string;
  weights: Record<string, number>;
  criteria: Record<string, RubricCriterionConfig>;
  aggregation: RubricAggregationConfig;
  required_features?: string[];
}

export interface ExtractedFeatures {
  strategy: string;
  symbol: string;
  expirationDate?: string | null;
  dte?: number | null;
  credit_to_width_pct?: number | null;
  delta_short?: number | null;
  iv_rank?: number | null;
  oi_short_leg_min?: number | null;
  bid_ask_pct?: number | null;
  days_to_earnings?: number | null;
  macro_event_flag?: string | null;
  price_above_ma_50?: boolean | null;
  rsi_14?: number | null;
  fill_vs_mid_bps?: number | null;
  [key: string]: unknown;
}

export interface ExtractionIssue {
  field: string;
  message: string;
}

export interface FeatureExtractionSuccess {
  ok: true;
  features: ExtractedFeatures;
  missing: string[];
  outOfRange: ExtractionIssue[];
}

export interface FeatureExtractionError {
  ok: false;
  error: string;
  missing: string[];
  outOfRange: ExtractionIssue[];
  features?: ExtractedFeatures;
}

export type FeatureExtractionResult = FeatureExtractionSuccess | FeatureExtractionError;

export interface MetricScore {
  metric: string;
  rawValue: number | string | boolean | null;
  score: number | null;
  reason: string;
  passed: boolean;
}

export interface CriterionScore {
  criterion: string;
  weight: number;
  metrics: MetricScore[];
  score: number;
}

export interface AggregatedScore {
  rawScore: number;
  penaltiesApplied: string[];
  violations: string[];
  criterionScores: CriterionScore[];
}

export interface CalibrationResult {
  calibrationVersion: string;
  calibratedProbability: number;
}

export interface CachedScorePayload {
  rubric_version: string;
  calibration_version: string;
  raw_score: number;
  calibrated_success_prob: number;
  reasons: string[];
  violations: string[];
  confidence: "low" | "medium" | "high";
  ips_id: string;
  ips_version?: string | null;
  input_hash: string;
}

export type SupabaseClient = ReturnType<typeof import("@supabase/supabase-js").createClient>;
