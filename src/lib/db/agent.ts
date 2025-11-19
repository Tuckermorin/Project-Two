import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function logTool(
  runId: string,
  tool: string,
  input: any,
  output: any,
  ms: number,
  error?: string
) {
  await supabase.from("tool_invocations").insert({
    run_id: runId,
    tool,
    input,
    output_summary: output,
    latency_ms: ms,
    error,
  });
}

export async function openRun(props: {
  runId: string;
  mode: "backtest" | "paper" | "live";
  symbols: string[];
  userId: string;
}) {
  await supabase.from("agent_runs").insert({
    run_id: props.runId,
    mode: props.mode,
    watchlist: props.symbols,
    user_id: props.userId,
  });
}

export async function closeRun(runId: string, outcome: any) {
  await supabase
    .from("agent_runs")
    .update({ finished_at: new Date().toISOString(), outcome })
    .eq("run_id", runId);
}

export async function persistRawOptions(
  runId: string,
  symbol: string,
  asof: string,
  payload: any
) {
  await supabase.from("option_chains_raw").upsert(
    {
      symbol,
      asof,
      payload,
      provider: "alpha_vantage",
    },
    { onConflict: "symbol,asof,provider" }
  );
}

export async function persistContracts(rows: any[]) {
  if (!rows.length) return;
  await supabase.from("option_contracts").upsert(rows, {
    onConflict: "symbol,expiry,strike,option_type,asof",
  });
}

export async function persistFeatures(
  runId: string,
  symbol: string,
  asof: string,
  f: any
) {
  await supabase.from("features_snapshot").insert({
    run_id: runId,
    symbol,
    asof,
    ...f,
  });
}

export async function persistScore(runId: string, score: any) {
  await supabase.from("scores").insert({
    run_id: runId,
    ...score,
  });
}

export async function persistCandidate(runId: string, c: any, userId: string) {
  await supabase.from("trade_candidates").insert({
    run_id: runId,
    user_id: userId,
    ...c,
    // Explicitly include IPS scoring fields to ensure they're saved
    ips_score: c.ips_score ?? null,
    ips_factor_details: c.ips_factor_details ?? null,
    tier: c.tier ?? null,
    composite_score: c.composite_score ?? null,
    yield_score: c.yield_score ?? null,
    reddit_score: c.reddit_score ?? null,
    diversity_score: c.diversity_score ?? null,
    historical_analysis: c.historical_analysis ?? null,
  });
}

export async function latestCandidates(runId: string) {
  return await supabase
    .from("trade_candidates")
    .select("*")
    .eq("run_id", runId)
    .order("symbol");
}

export async function persistReasoningChain(
  runId: string,
  candidateId: string,
  chain: any
) {
  // Store reasoning chain in trade_candidates or a separate table if needed
  // For now, we can store it as part of the candidate JSON
  await supabase
    .from("trade_candidates")
    .update({ reasoning_chain: chain })
    .eq("run_id", runId)
    .eq("id", candidateId);
}
