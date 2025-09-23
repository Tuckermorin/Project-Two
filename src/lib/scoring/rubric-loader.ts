import { createClient } from "@supabase/supabase-js";
import type { StrategyRubric } from "./types";

const DEFAULT_PCS_RUBRIC: StrategyRubric = {
  name: "PCS_Default",
  strategy: "put-credit-spread",
  rubric_version: "1.3.0",
  weights: {
    edge: 0.35,
    liquidity: 0.2,
    risk_events: 0.2,
    trend_alignment: 0.15,
    execution_quality: 0.1,
  },
  criteria: {
    edge: {
      credit_to_width_pct: [
        [0.15, 60],
        [0.2, 80],
        [0.25, 90],
        [0.3, 100],
      ],
      delta_short: [
        [0.1, 100],
        [0.12, 90],
        [0.15, 75],
        [0.18, 50],
        [0.22, 20],
      ],
      iv_rank: [
        [10, 40],
        [20, 70],
        [30, 85],
        [50, 95],
        [70, 100],
      ],
    },
    liquidity: {
      oi_short_leg_min: [
        [100, 60],
        [500, 80],
        [1000, 95],
      ],
      bid_ask_pct: [
        [1.5, 100],
        [2.0, 85],
        [3.0, 60],
        [5.0, 30],
      ],
    },
    risk_events: {
      days_to_earnings: [
        [0, 10],
        [2, 40],
        [5, 65],
        [10, 85],
        [15, 100],
      ],
      macro_event_flag: {
        FOMC: -20,
        CPI: -10,
        None: 0,
      },
    },
    trend_alignment: {
      price_above_ma_50: {
        true: 80,
        false: 40,
      },
      rsi_14: [
        [30, 50],
        [50, 80],
        [70, 60],
      ],
    },
    execution_quality: {
      fill_vs_mid_bps: [
        [0, 100],
        [25, 85],
        [50, 70],
        [100, 40],
      ],
    },
  },
  aggregation: {
    method: "weighted_mean",
    caps: { min: 0, max: 100 },
    penalties: [
      { if: "credit_to_width_pct < 0.12", minus: 25 },
      { if: "bid_ask_pct > 5.0", minus: 20 },
    ],
  },
  required_features: [
    "credit_to_width_pct",
    "delta_short",
    "iv_rank",
    "oi_short_leg_min",
    "bid_ask_pct",
    "days_to_earnings",
    "macro_event_flag",
    "price_above_ma_50",
    "rsi_14",
    "fill_vs_mid_bps",
  ],
};

let cachedClient: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!cachedClient) {
    cachedClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
        global: { headers: { "x-application-name": "deterministic-score" } },
      },
    );
  }
  return cachedClient;
}

export async function loadStrategyRubric(
  strategy: string,
  rubricVersion?: string,
): Promise<StrategyRubric> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEFAULT_PCS_RUBRIC;
  }

  try {
    const query = getClient()
      .from("ips_rubrics")
      .select("rubric")
      .eq("strategy", strategy)
      .maybeSingle();

    const { data, error } = await query;
    if (error || !data?.rubric) {
      return DEFAULT_PCS_RUBRIC;
    }
    const parsed = data.rubric as StrategyRubric;
    if (rubricVersion && parsed.rubric_version !== rubricVersion) {
      return parsed;
    }
    return parsed;
  } catch {
    return DEFAULT_PCS_RUBRIC;
  }
}

export function defaultRubric(): StrategyRubric {
  return DEFAULT_PCS_RUBRIC;
}
