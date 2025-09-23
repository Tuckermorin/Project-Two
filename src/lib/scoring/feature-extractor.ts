import crypto from "crypto";
import { z } from "zod";
import type {
  ExtractedFeatures,
  FeatureExtractionResult,
  FeatureExtractionSuccess,
} from "./types";

const tradeSchema = z.object({
  symbol: z.string().min(1, "Symbol required"),
  expirationDate: z.string().optional().nullable(),
  contractType: z.string().min(1, "Strategy required"),
  creditReceived: z.number().optional().nullable(),
  shortPutStrike: z.number().optional().nullable(),
  longPutStrike: z.number().optional().nullable(),
  shortCallStrike: z.number().optional().nullable(),
  longCallStrike: z.number().optional().nullable(),
  optionStrike: z.number().optional().nullable(),
  debitPaid: z.number().optional().nullable(),
  numberOfContracts: z.number().optional().nullable(),
});

const FACTOR_ALIASES: Record<string, string[]> = {
  credit_to_width_pct: [
    "credit_to_width_pct",
    "credit_to_width_percent",
    "credit_to_width_percentage",
    "credit_width_pct",
    "credit/width %",
    "credit to width",
  ],
  delta_short: [
    "delta_short",
    "short_delta",
    "short leg delta",
    "delta (short)",
    "delta short",
  ],
  iv_rank: ["iv_rank", "ivr", "iv rank"],
  oi_short_leg_min: [
    "oi_short_leg_min",
    "short_leg_open_interest",
    "short leg oi",
    "short_oi",
  ],
  bid_ask_pct: [
    "bid_ask_pct",
    "bid-ask %",
    "bid_ask_spread_pct",
    "bid ask pct",
  ],
  days_to_earnings: [
    "days_to_earnings",
    "earnings_days",
    "days until earnings",
  ],
  macro_event_flag: [
    "macro_event_flag",
    "macro event",
    "macro risk flag",
  ],
  price_above_ma_50: [
    "price_above_ma_50",
    "price>ma50",
    "price above ma50",
    "above_50_ma",
  ],
  rsi_14: ["rsi_14", "rsi", "rsi14"],
  fill_vs_mid_bps: [
    "fill_vs_mid_bps",
    "fill_vs_mid",
    "fill vs mid bps",
  ],
  dte: ["dte", "days_to_expiration"],
};

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const norm = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(norm)) return true;
    if (["false", "no", "n", "0"].includes(norm)) return false;
  }
  if (typeof value === "number") {
    if (value === 0) return false;
    if (value === 1) return true;
  }
  return null;
}

function computeDte(expiration: string | null | undefined): number | null {
  if (!expiration) return null;
  const expDate = new Date(expiration);
  if (Number.isNaN(expDate.getTime())) return null;
  const today = new Date();
  const diff = expDate.getTime() - today.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(days));
}

function computeCreditWidthPct(trade: z.infer<typeof tradeSchema>): number | null {
  const credit = trade.creditReceived;
  const width = (() => {
    if (trade.shortPutStrike != null && trade.longPutStrike != null) {
      return Math.abs(trade.shortPutStrike - trade.longPutStrike);
    }
    if (trade.shortCallStrike != null && trade.longCallStrike != null) {
      return Math.abs(trade.longCallStrike - trade.shortCallStrike);
    }
    return null;
  })();
  if (credit == null || width == null || width === 0) return null;
  return credit / width;
}

export function hashInput(payload: Record<string, unknown>): string {
  const sortedKeys = Object.keys(payload).sort();
  const ordered: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const value = payload[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      ordered[key] = JSON.parse(JSON.stringify(value, Object.keys(value as any).sort()));
    } else {
      ordered[key] = value;
    }
  }
  return crypto.createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

export function extractFeatures(
  tradeDraft: unknown,
  factorValues: Record<string, unknown>,
): FeatureExtractionResult {
  const parsed = tradeSchema.safeParse(tradeDraft ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
      missing: parsed.error.issues.map((i) => i.path.join(".")),
      outOfRange: [],
    };
  }

  const trade = parsed.data;
  const normalisedFactorMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(factorValues || {})) {
    const normKey = normaliseKey(key);
    normalisedFactorMap.set(normKey, value);
  }

  const lookup = (feature: string): unknown => {
    const aliases = FACTOR_ALIASES[feature] || [feature];
    for (const alias of aliases) {
      const norm = normaliseKey(alias);
      if (normalisedFactorMap.has(norm)) {
        return normalisedFactorMap.get(norm);
      }
    }
    return undefined;
  };

  const issues: FeatureExtractionSuccess["outOfRange"] = [];
  const missing: string[] = [];

  const features: ExtractedFeatures = {
    strategy: normaliseKey(trade.contractType),
    symbol: trade.symbol,
    expirationDate: trade.expirationDate ?? null,
  };

  const computedDte = computeDte(trade.expirationDate ?? null);
  if (computedDte != null) {
    features.dte = computedDte;
    if (computedDte <= 0) {
      issues.push({ field: "dte", message: "Expiration must be in the future" });
    }
  }

  const computedCreditWidth = computeCreditWidthPct(trade);
  if (computedCreditWidth != null) {
    features.credit_to_width_pct = Number(computedCreditWidth.toFixed(4));
  }

  const numericFeatures: Array<[keyof ExtractedFeatures, number | null]> = [
    ["credit_to_width_pct", toNumber(lookup("credit_to_width_pct")) ?? features.credit_to_width_pct ?? null],
    ["delta_short", toNumber(lookup("delta_short"))],
    ["iv_rank", toNumber(lookup("iv_rank"))],
    ["oi_short_leg_min", toNumber(lookup("oi_short_leg_min"))],
    ["bid_ask_pct", toNumber(lookup("bid_ask_pct"))],
    ["days_to_earnings", toNumber(lookup("days_to_earnings"))],
    ["rsi_14", toNumber(lookup("rsi_14"))],
    ["fill_vs_mid_bps", toNumber(lookup("fill_vs_mid_bps"))],
    ["dte", toNumber(lookup("dte")) ?? features.dte ?? null],
  ];

  for (const [field, value] of numericFeatures) {
    if (value == null) {
      missing.push(field);
    } else {
      features[field] = value;
    }
  }

  const boolCandidates: Array<[keyof ExtractedFeatures, boolean | null]> = [
    ["price_above_ma_50", toBoolean(lookup("price_above_ma_50"))],
  ];
  for (const [field, value] of boolCandidates) {
    if (value == null) {
      missing.push(field);
    } else {
      features[field] = value;
    }
  }

  const macroFlag = lookup("macro_event_flag");
  if (typeof macroFlag === "string" && macroFlag.trim().length > 0) {
    features.macro_event_flag = macroFlag.trim();
  } else if (macroFlag == null) {
    missing.push("macro_event_flag");
  } else {
    issues.push({ field: "macro_event_flag", message: "Macro flag must be a string" });
  }

  const delta = toNumber(features.delta_short ?? null);
  if (delta != null && (delta < 0 || delta > 1)) {
    issues.push({ field: "delta_short", message: "Delta must be between 0 and 1" });
  }

  const creditPct = toNumber(features.credit_to_width_pct ?? null);
  if (creditPct != null && creditPct < 0) {
    issues.push({ field: "credit_to_width_pct", message: "Credit/width must be positive" });
  }

  if (issues.length > 0 || missing.length > 0) {
    return {
      ok: false,
      error: "Missing or invalid fields",
      missing,
      outOfRange: issues,
      features,
    };
  }

  return {
    ok: true,
    features,
    missing: [],
    outOfRange: [],
  } satisfies FeatureExtractionSuccess;
}

export function fingerprintForCaching(
  rubricVersion: string,
  payload: { trade: unknown; factors: Record<string, unknown>; ipsId: string },
): string {
  return hashInput({
    rubricVersion,
    ipsId: payload.ipsId,
    trade: payload.trade,
    factors: payload.factors,
  });
}
