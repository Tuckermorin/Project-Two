import type { IPSConfig } from "./loader";

type Features = {
  iv_rank?: number;           // 0..1
  term_slope?: number;        // arbitrary; we map → 0..1
  put_skew?: number;          // arbitrary; we map → 0..1
  dte_mode?: number;          // days; we map → 0..1
  volume_oi_ratio?: number;   // ratio
  macro_regime?: string;      // categorical
  [k: string]: any;
};

/** Map raw feature → 0..1 score with some sensible defaults */
function normalize(featureKey: string, value: any): number {
  if (value == null) return 0.5;
  switch (featureKey) {
    case "iv_rank": return Math.max(0, Math.min(1, Number(value)));
    case "term_slope": return Math.max(0, Math.min(1, (Number(value) * 0.5) + 0.5));
    case "put_skew": return Math.max(0, Math.min(1, (Number(value) * 0.5) + 0.5));
    case "dte_mode": {
      const dte = Number(value);
      return Math.max(0, Math.min(1, (14 - Math.abs(dte - 10)) / 14));
    }
    case "volume_oi_ratio": return Math.max(0, Math.min(1, Number(value)));
    case "macro_regime": {
      const map: Record<string, number> = { easing: 0.7, neutral: 0.5, tightening: 0.3 };
      return map[String(value)] ?? 0.5;
    }
    default: return 0.5;
  }
}

/** Return alignment 0..1 and per-factor contributions */
export function scoreAgainstIPS(ips: IPSConfig, features: Features) {
  const breakdown: Record<string, number> = {};
  let total = 0;
  for (const f of ips.factors) {
    if (!f.enabled) continue;
    const raw = features[f.factor_key];
    let ok = true;
    if (f.threshold != null && f.direction) {
      ok = f.direction === "gte" ? Number(raw ?? -Infinity) >= f.threshold : Number(raw ?? Infinity) <= f.threshold;
    }
    const x = normalize(f.factor_key, raw);
    const contrib = (ok ? x : x * 0.5) * (f.weight || 0);
    breakdown[f.factor_key] = Number(contrib.toFixed(4));
    total += contrib;
  }
  return { alignment: Number((total).toFixed(4)), breakdown };
}

export function shortSummary(symbol:string, alignment:number, f:any, newsSignal?:string, riskNote?:string) {
  const pct = Math.round(alignment * 100);
  const ivText = (f.iv_rank != null && f.iv_rank >= 0.6) ? "high IV rank" : "balanced IV";
  const risk = riskNote ?? ((f.delta && f.delta > 0.3) ? `elevated delta at ${f.delta.toFixed(2)}` : "standard spread risk");
  const news = newsSignal ?? "neutral recent news";
  return `This trade is ${pct}% aligned with your IPS criteria and benefits from ${ivText}. Recent news is ${news}. The main risk is ${risk}.`;
}
