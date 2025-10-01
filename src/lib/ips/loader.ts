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

/** Load a specific IPS by ID */
export async function loadIPSById(ipsId: string): Promise<IPSConfig> {
  console.log(`[loadIPSById] Loading IPS with ID: ${ipsId}`);

  // 1) Fetch the specific IPS configuration
  const { data: cfgRow, error: cfgErr } = await supabaseAdmin
    .from("ips_configurations")
    .select("*")
    .eq("id", ipsId)
    .single();

  if (cfgErr) {
    console.error(`[loadIPSById] Error loading IPS config:`, cfgErr);
    throw new Error(`IPS load failed: ${cfgErr.message}`);
  }
  if (!cfgRow) {
    console.error(`[loadIPSById] No IPS found with ID: ${ipsId}`);
    throw new Error(`No IPS configuration found with ID: ${ipsId}`);
  }

  console.log(`[loadIPSById] Found IPS: ${cfgRow.name}`);

  // 2) Fetch factors for this IPS
  const { data: factors, error: facErr } = await supabaseAdmin
    .from("ips_factors")
    .select(`
      factor_id,
      factor_name,
      weight,
      target_value,
      target_operator,
      target_value_max,
      preference_direction,
      enabled
    `)
    .eq("ips_id", ipsId);

  if (facErr) {
    console.error(`[loadIPSById] Error loading IPS factors:`, facErr);
    throw new Error(`IPS factors load failed: ${facErr.message}`);
  }

  console.log(`[loadIPSById] Loaded ${factors?.length || 0} factors`);

  const config: IPSConfig = {
    id: ipsId,
    name: cfgRow.name ?? "IPS",
    version: null,
    factors: (factors ?? []).map(f => {
      const factor = {
        factor_key: f.factor_id,
        weight: Number(f.weight ?? 0) / 10, // Normalize from 1-10 scale to 0-1
        threshold: f.target_value == null ? null : Number(f.target_value),
        direction: f.target_operator === "gte" ? "gte" : f.target_operator === "lte" ? "lte" : null,
        enabled: f.enabled ?? true,
        display_name: f.factor_name ?? null,
        description: null,
      };
      console.log(`[loadIPSById] Factor: ${factor.display_name}, weight: ${factor.weight}, threshold: ${factor.threshold}, direction: ${factor.direction}`);
      return factor;
    }),
  };

  // Filter only enabled factors
  config.factors = config.factors.filter(f => f.enabled);

  // safety: normalize weights to sum<=1
  const sum = config.factors.reduce((a,b)=>a+(b.weight||0),0) || 1;
  config.factors = config.factors.map(f => ({ ...f, weight: Number(f.weight||0)/sum }));

  console.log(`[loadIPSById] Final config with ${config.factors.length} enabled factors, normalized weights sum to 1`);

  return config;
}
