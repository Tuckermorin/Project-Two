export type IPSFactor = {
  factor_key: string;           // e.g. "iv_rank", "delta_max", "term_slope"
  weight: number;               // 0..1
  threshold?: number | null;    // optional gating threshold
  threshold_max?: number | null; // optional max threshold for range
  direction?: "gte" | "lte" | "range" | null; // how to interpret threshold
  enabled?: boolean | null;
  factor_scope?: "general" | "chain" | null; // scope: general (non-chain) or chain (requires options data)
  // optional meta
  display_name?: string | null;
  description?: string | null;
};

export type IPSConfig = {
  id: string;
  name: string;
  version: string | null;
  factors: IPSFactor[];
  // DTE configuration - hard filters for options selection
  min_dte: number;  // Minimum days to expiration (hard filter)
  max_dte: number;  // Maximum days to expiration (hard filter)
};
