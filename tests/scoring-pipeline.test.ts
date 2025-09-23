import test from "node:test";
import assert from "node:assert/strict";
import { defaultRubric } from "@/lib/scoring/rubric-loader";
import { scoreFeatures } from "@/lib/scoring/scoring-engine";
import { extractFeatures } from "@/lib/scoring/feature-extractor";

const rubric = defaultRubric();

test("golden put credit spread trade scores deterministically", () => {
  const features = {
    strategy: "put-credit-spread",
    symbol: "XYZ",
    credit_to_width_pct: 0.22,
    delta_short: 0.13,
    iv_rank: 45,
    oi_short_leg_min: 600,
    bid_ask_pct: 1.5,
    days_to_earnings: 7,
    macro_event_flag: "None",
    price_above_ma_50: true,
    rsi_14: 55,
    fill_vs_mid_bps: 20,
  } as const;

  const result = scoreFeatures(features, rubric);
  assert.ok(result.rawScore > 0, "score should be positive");
  assert.equal(Number(result.rawScore.toFixed(1)), 83.0);
});

test("credit to width improvements are monotonic", () => {
  const baseFeatures = {
    strategy: "put-credit-spread",
    symbol: "XYZ",
    credit_to_width_pct: 0.18,
    delta_short: 0.13,
    iv_rank: 45,
    oi_short_leg_min: 600,
    bid_ask_pct: 1.5,
    days_to_earnings: 7,
    macro_event_flag: "None",
    price_above_ma_50: true,
    rsi_14: 55,
    fill_vs_mid_bps: 20,
  } as const;

  const lower = scoreFeatures(baseFeatures, rubric).rawScore;
  const higher = scoreFeatures({ ...baseFeatures, credit_to_width_pct: 0.24 }, rubric).rawScore;
  assert.ok(higher >= lower, "score must not decrease when credit/width improves");
});

test("feature extraction is order invariant", () => {
  const trade = {
    symbol: "XYZ",
    expirationDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    contractType: "put-credit-spread",
    creditReceived: 1.2,
    shortPutStrike: 190,
    longPutStrike: 185,
  };

  const factorsA = {
    credit_to_width_pct: 0.22,
    delta_short: 0.13,
    iv_rank: 45,
    oi_short_leg_min: 600,
    bid_ask_pct: 1.5,
    days_to_earnings: 7,
    macro_event_flag: "None",
    price_above_ma_50: true,
    rsi_14: 55,
    fill_vs_mid_bps: 20,
  };

  const factorsB = Object.fromEntries(Object.entries(factorsA).reverse());

  const exA = extractFeatures(trade, factorsA);
  const exB = extractFeatures(trade, factorsB as any);

  assert.ok(exA.ok && exB.ok, "extraction should succeed");
  assert.deepEqual(exA.features, exB.features, "feature extraction should be invariant to factor order");
});
