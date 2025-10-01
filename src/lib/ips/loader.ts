import { createClient } from "@supabase/supabase-js";

type IPSFactor = {
  factor_key: string;           // e.g. "iv_rank", "delta_max", "term_slope"
  weight: number;               // 0..1
  threshold?: number | null;    // optional gating threshold
  direction?: "gte" | "lte" | null; // how to interpret threshold
  enabled?: boolean | null;
  // optional meta
  display_name?: string | null;
  description?: string | null;
};

export type IPSConfig = {
  id: string;
  name: string;
  version: string | null;
  factors: IPSFactor[];
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only
);

/** Load the active IPS for a user (or default/global if none). */
export async function loadActiveIPS(userId?: string): Promise<IPSConfig> {
  // 1) pick an active config. We assume ips_configurations has flags: is_active boolean, user_id nullable
  const { data: cfgRow, error: cfgErr } = await supabaseAdmin
    .from("ips_configurations")
    .select("*")
    .eq("is_active", true)
    .order("last_modified", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cfgErr) throw new Error(`IPS load failed: ${cfgErr.message}`);
  if (!cfgRow) throw new Error("No active IPS configuration found");

  const cfgId = cfgRow.id;

  // 2) fetch factors
  const { data: factors, error: facErr } = await supabaseAdmin
    .from("ips_factors")
    .select(`
      factor_id,
      factor_name,
      weight,
      target_value,
      target_operator,
      target_value_max,
      enabled
    `)
    .eq("ips_id", cfgId)
    .eq("enabled", true);

  if (facErr) throw new Error(`IPS factors load failed: ${facErr.message}`);

  const config: IPSConfig = {
    id: cfgId,
    name: cfgRow.name ?? "Active IPS",
    version: null,
    factors: (factors ?? []).map(f => ({
      factor_key: f.factor_id, // Use factor_id as the key
      weight: Number(f.weight ?? 0) / 10, // Normalize from 1-10 scale to 0-1
      threshold: f.target_value == null ? null : Number(f.target_value),
      direction: f.target_operator === "gte" ? "gte" : f.target_operator === "lte" ? "lte" : null,
      enabled: f.enabled ?? true,
      display_name: f.factor_name ?? null,
      description: null,
    })),
  };

  // safety: normalize weights to sum<=1
  const sum = config.factors.reduce((a,b)=>a+(b.weight||0),0) || 1;
  config.factors = config.factors.map(f => ({ ...f, weight: Number(f.weight||0)/sum }));

  return config;
}
