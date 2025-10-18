/**
 * Audit Agent Optimality
 *
 * This script performs a comprehensive audit to validate that the agent
 * is finding the OPTIMAL trades, not just acceptable ones.
 *
 * It exhaustively tests all combinations of:
 * - All available DTEs (not just first 3)
 * - All available strikes (not just first 100)
 * - All spread widths (1, 2, 3, 5, 10 strikes apart)
 *
 * Then scores them all and compares to what the agent actually selected.
 *
 * Usage:
 *   npx tsx scripts/audit-agent-optimality.ts --symbol AMZN
 *   npx tsx scripts/audit-agent-optimality.ts --symbol TSLA --ips-id <uuid>
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { calculateRiskAdjustedScore } from "@/lib/agent/risk-adjusted-scoring";

// Create a direct Supabase client for scripts (doesn't need cookies)
function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface AuditConfig {
  symbol: string;
  ipsId?: string;

  // Exhaustive search parameters
  maxExpirations: number; // How many expirations to test (default: all)
  maxStrikesPerExpiration: number; // How many strikes to test per expiration (default: all)
  spreadWidths: number[]; // How many strikes apart for long leg (e.g., [1, 2, 3, 5, 10])

  // Filtering
  minDTE?: number;
  maxDTE?: number;
  minDelta?: number;
  maxDelta?: number;
  minCredit?: number;
  minRiskReward?: number;
}

interface AuditCandidate {
  // Basic info
  symbol: string;
  strategy: string;
  dte: number;

  // Legs
  short_strike: number;
  long_strike: number;
  spread_width: number;
  expiry: string;

  // Greeks
  short_delta: number;
  short_theta?: number;
  short_vega?: number;
  short_iv?: number;
  long_delta: number;

  // Pricing
  entry_mid: number;
  max_profit: number;
  max_loss: number;
  breakeven: number;
  est_pop: number;
  risk_reward: number;

  // Scores
  yield_score?: number;
  ips_score?: number;
  composite_score?: number;

  // Risk-adjusted metrics
  risk_adjusted_metrics?: any;
}

interface AuditResult {
  symbol: string;
  total_combinations_tested: number;
  expirations_tested: number;
  strikes_tested_per_expiration: number;
  spread_widths_tested: number[];

  // Top candidates by different metrics
  top_by_composite: AuditCandidate[];
  top_by_ips: AuditCandidate[];
  top_by_yield: AuditCandidate[];
  top_by_roi: AuditCandidate[];
  top_by_expected_value: AuditCandidate[];

  // What agent selected
  agent_selected?: AuditCandidate;

  // Analysis
  is_agent_optimal: boolean;
  agent_rank_in_composite?: number;
  agent_rank_in_ips?: number;
  better_alternatives?: AuditCandidate[];

  // Stats
  score_distribution: {
    composite: { min: number; max: number; avg: number; median: number };
    ips: { min: number; max: number; avg: number; median: number };
    yield: { min: number; max: number; avg: number; median: number };
  };
}

/**
 * Main audit function
 */
export async function auditAgentOptimality(config: AuditConfig): Promise<AuditResult> {
  console.log(`\n🔍 AUDIT: ${config.symbol}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Step 1: Fetch ALL options data for the symbol
  console.log(`📊 Step 1: Fetching comprehensive options data...`);
  const avClient = getAlphaVantageClient();

  console.log(`   Fetching realtime options with Greeks...`);
  const optionsData = await avClient.getRealtimeOptions(config.symbol, { requireGreeks: true });
  console.log(`   Received ${optionsData.length} option contracts`);

  const quote = await avClient.getQuote(config.symbol);
  const currentPrice = parseFloat(quote["05. price"]);
  console.log(`   Current price: $${currentPrice.toFixed(2)}`);

  // Step 2: Get IPS configuration
  console.log(`\n⚙️  Step 2: Loading IPS configuration...`);
  const supabase = createClient();

  let ipsConfig: any = null;
  if (config.ipsId) {
    const { data } = await supabase
      .from("ips_configurations")
      .select("*, ips_factors(*)")
      .eq("id", config.ipsId)
      .single();
    ipsConfig = data;
  } else {
    // Get default IPS
    const { data } = await supabase
      .from("ips_configurations")
      .select("*, ips_factors(*)")
      .limit(1)
      .single();
    ipsConfig = data;
  }

  console.log(`   IPS: ${ipsConfig?.name || "Default"}`);
  console.log(`   DTE Range: ${ipsConfig?.min_dte || 1}-${ipsConfig?.max_dte || 365} days`);
  console.log(`   Factors: ${ipsConfig?.ips_factors?.length || 0} enabled`);

  // Step 3: Generate ALL possible combinations
  console.log(`\n🔨 Step 3: Generating all possible combinations...`);
  const allCandidates = await generateAllCombinations(
    config.symbol,
    optionsData,
    currentPrice,
    config,
    ipsConfig
  );

  console.log(`   Generated ${allCandidates.length} total candidates`);

  // Step 4: Score all candidates
  console.log(`\n📈 Step 4: Scoring all candidates...`);
  const scoredCandidates = await scoreAllCandidates(allCandidates, ipsConfig, supabase);

  console.log(`   Scored ${scoredCandidates.length} candidates`);

  // Step 5: Sort and rank
  console.log(`\n🏆 Step 5: Ranking candidates...`);
  const topComposite = [...scoredCandidates].sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0)).slice(0, 10);
  const topIPS = [...scoredCandidates].sort((a, b) => (b.ips_score || 0) - (a.ips_score || 0)).slice(0, 10);
  const topYield = [...scoredCandidates].sort((a, b) => (b.yield_score || 0) - (a.yield_score || 0)).slice(0, 10);
  const topROI = [...scoredCandidates].sort((a, b) => (b.risk_reward || 0) - (a.risk_reward || 0)).slice(0, 10);
  const topEV = [...scoredCandidates]
    .sort((a, b) => (b.risk_adjusted_metrics?.expected_value_per_dollar || 0) - (a.risk_adjusted_metrics?.expected_value_per_dollar || 0))
    .slice(0, 10);

  // Step 6: Calculate statistics
  console.log(`\n📊 Step 6: Calculating statistics...`);
  const stats = calculateStatistics(scoredCandidates);

  // Step 7: Fetch what agent actually selected (if available)
  console.log(`\n🤖 Step 7: Checking agent's selection...`);
  const agentSelected = await getAgentSelection(config.symbol, supabase);

  // Step 8: Compare
  let isOptimal = false;
  let agentRankComposite: number | undefined;
  let agentRankIPS: number | undefined;
  let betterAlternatives: AuditCandidate[] = [];

  if (agentSelected) {
    console.log(`   Agent selected: ${agentSelected.short_strike} / ${agentSelected.long_strike} put spread, ${agentSelected.dte} DTE`);

    // Find where agent's selection ranks
    const compositeRanked = [...scoredCandidates].sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
    agentRankComposite = compositeRanked.findIndex(c =>
      Math.abs(c.short_strike - agentSelected.short_strike) < 0.01 &&
      Math.abs(c.long_strike - agentSelected.long_strike) < 0.01 &&
      c.dte === agentSelected.dte
    ) + 1;

    const ipsRanked = [...scoredCandidates].sort((a, b) => (b.ips_score || 0) - (a.ips_score || 0));
    agentRankIPS = ipsRanked.findIndex(c =>
      Math.abs(c.short_strike - agentSelected.short_strike) < 0.01 &&
      Math.abs(c.long_strike - agentSelected.long_strike) < 0.01 &&
      c.dte === agentSelected.dte
    ) + 1;

    isOptimal = agentRankComposite === 1 && agentRankIPS === 1;

    if (!isOptimal) {
      // Find better alternatives
      betterAlternatives = compositeRanked.slice(0, 5);
    }

    console.log(`   Composite rank: #${agentRankComposite} of ${scoredCandidates.length}`);
    console.log(`   IPS rank: #${agentRankIPS} of ${scoredCandidates.length}`);
  } else {
    console.log(`   No agent selection found for comparison`);
  }

  return {
    symbol: config.symbol,
    total_combinations_tested: scoredCandidates.length,
    expirations_tested: [...new Set(scoredCandidates.map(c => c.expiry))].length,
    strikes_tested_per_expiration: Math.floor(scoredCandidates.length / [...new Set(scoredCandidates.map(c => c.expiry))].length),
    spread_widths_tested: config.spreadWidths,
    top_by_composite: topComposite,
    top_by_ips: topIPS,
    top_by_yield: topYield,
    top_by_roi: topROI,
    top_by_expected_value: topEV,
    agent_selected: agentSelected || undefined,
    is_agent_optimal: isOptimal,
    agent_rank_in_composite: agentRankComposite,
    agent_rank_in_ips: agentRankIPS,
    better_alternatives: betterAlternatives,
    score_distribution: stats,
  };
}

/**
 * Generate all possible put credit spread combinations
 */
async function generateAllCombinations(
  symbol: string,
  optionsData: any,
  currentPrice: number,
  config: AuditConfig,
  ipsConfig: any
): Promise<AuditCandidate[]> {
  const candidates: AuditCandidate[] = [];

  // Get all puts (note: Alpha Vantage uses 'type' field with 'put' or 'call')
  const puts = optionsData.filter((c: any) => c.type === "put" && c.strike && c.strike < currentPrice);

  // Get all unique expirations
  const allExpirations = [...new Set(puts.map((p: any) => p.expiration))];

  // Calculate DTE for each and filter
  const validExpirations = allExpirations
    .map(expiry => ({ expiry, dte: calculateDTE(expiry as string) }))
    .filter(e => {
      if (config.minDTE && e.dte < config.minDTE) return false;
      if (config.maxDTE && e.dte > config.maxDTE) return false;
      return true;
    })
    .sort((a, b) => a.dte - b.dte)
    .slice(0, config.maxExpirations);

  console.log(`   Testing ${validExpirations.length} expirations`);

  for (const { expiry, dte } of validExpirations) {
    const expiryPuts = puts
      .filter((p: any) => p.expiration === expiry && p.strike && p.bid && p.ask)
      .sort((a: any, b: any) => b.strike - a.strike);

    if (expiryPuts.length < 2) continue;

    const strikesToTest = Math.min(config.maxStrikesPerExpiration, expiryPuts.length);

    console.log(`   ${expiry} (${dte}d): Testing ${strikesToTest} strikes × ${config.spreadWidths.length} widths`);

    // Test all strikes
    for (let i = 0; i < strikesToTest; i++) {
      const shortPut = expiryPuts[i];
      const shortDelta = Math.abs(shortPut.delta || 0);

      // Apply delta filter
      if (config.minDelta && shortDelta < config.minDelta) continue;
      if (config.maxDelta && shortDelta > config.maxDelta) continue;

      // Test all spread widths
      for (const width of config.spreadWidths) {
        const longPutIndex = i + width;
        if (longPutIndex >= expiryPuts.length) continue;

        const longPut = expiryPuts[longPutIndex];

        const spreadWidth = shortPut.strike - longPut.strike;
        if (spreadWidth <= 0) continue;

        const entryMid = ((shortPut.bid + shortPut.ask) / 2) - ((longPut.bid + longPut.ask) / 2);
        if (entryMid <= 0) continue;

        // Apply credit filter
        if (config.minCredit && entryMid < config.minCredit) continue;

        const maxProfit = entryMid;
        const maxLoss = spreadWidth - entryMid;
        const riskReward = maxProfit / maxLoss;

        // Apply R:R filter
        if (config.minRiskReward && riskReward < config.minRiskReward) continue;

        const breakeven = shortPut.strike - entryMid;
        const estPop = shortPut.delta ? 1 - Math.abs(shortPut.delta) : 0.7;

        candidates.push({
          symbol,
          strategy: "put_credit_spread",
          dte,
          short_strike: shortPut.strike,
          long_strike: longPut.strike,
          spread_width: spreadWidth,
          expiry: expiry as string,
          short_delta: shortDelta,
          short_theta: shortPut.theta,
          short_vega: shortPut.vega,
          short_iv: shortPut.iv,
          long_delta: Math.abs(longPut.delta || 0),
          entry_mid: entryMid,
          max_profit: maxProfit,
          max_loss: maxLoss,
          breakeven,
          est_pop: estPop,
          risk_reward: riskReward,
        });
      }
    }
  }

  return candidates;
}

/**
 * Score all candidates using the same logic as the agent
 */
async function scoreAllCandidates(
  candidates: AuditCandidate[],
  ipsConfig: any,
  supabase: any
): Promise<AuditCandidate[]> {
  for (const candidate of candidates) {
    // Calculate yield score (risk-adjusted)
    const yieldScore = calculateYieldScore(candidate);
    candidate.yield_score = yieldScore;

    // Calculate IPS score
    const ipsScore = calculateIPSScore(candidate, ipsConfig);
    candidate.ips_score = ipsScore;

    // Calculate composite score (same weights as agent)
    // Without RAG: yield 40%, IPS 60%
    const compositeScore = (yieldScore * 0.4) + (ipsScore * 0.6);
    candidate.composite_score = compositeScore;
  }

  return candidates;
}

/**
 * Calculate yield score (risk-adjusted) for a candidate
 */
function calculateYieldScore(candidate: AuditCandidate): number {
  const riskAdjusted = calculateRiskAdjustedScore({
    max_profit: candidate.max_profit,
    max_loss: candidate.max_loss,
    entry_mid: candidate.entry_mid,
    est_pop: candidate.est_pop,
    dte: candidate.dte,
    delta: candidate.short_delta,
    theta: candidate.short_theta,
    vega: candidate.short_vega,
  });

  candidate.risk_adjusted_metrics = riskAdjusted;

  return riskAdjusted.risk_adjusted_score;
}

/**
 * Calculate IPS score for a candidate
 * Simplified version - just counts pass/fail
 */
function calculateIPSScore(candidate: AuditCandidate, ipsConfig: any): number {
  if (!ipsConfig || !ipsConfig.ips_factors) return 50;

  let totalWeight = 0;
  let weightedScore = 0;

  for (const factor of ipsConfig.ips_factors) {
    if (!factor.enabled) continue;

    totalWeight += factor.weight;

    // Simplified factor evaluation
    const passed = evaluateFactorSimplified(factor, candidate);
    const factorScore = passed ? 100 : 50;
    weightedScore += factorScore * factor.weight;
  }

  return totalWeight > 0 ? (weightedScore / totalWeight) : 50;
}

/**
 * Simplified factor evaluation
 */
function evaluateFactorSimplified(factor: any, candidate: AuditCandidate): boolean {
  // Map common factors to candidate properties
  switch (factor.factor_key) {
    case 'opt-delta':
      return candidate.short_delta <= (factor.threshold || 0.18);
    case 'opt-theta':
      return !candidate.short_theta || candidate.short_theta >= (factor.threshold || 0);
    case 'opt-vega':
      return !candidate.short_vega || Math.abs(candidate.short_vega) <= (factor.threshold || 1);
    case 'iv-rank':
      // Would need IV rank data
      return true;
    default:
      // Default to pass for factors we can't evaluate without full market data
      return true;
  }
}

/**
 * Calculate DTE from expiry date string
 */
function calculateDTE(expiry: string): number {
  const expiryDate = new Date(expiry);
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Get agent's actual selection from database
 */
async function getAgentSelection(symbol: string, supabase: any): Promise<AuditCandidate | null> {
  const { data } = await supabase
    .from("trades")
    .select("*")
    .eq("symbol", symbol)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    symbol: data.symbol,
    strategy: data.strategy_type,
    dte: data.dte || 0,
    short_strike: data.short_strike,
    long_strike: data.long_strike,
    spread_width: data.short_strike - data.long_strike,
    expiry: data.expiration_date,
    short_delta: data.delta || 0,
    long_delta: 0,
    entry_mid: data.entry_mid || 0,
    max_profit: data.max_profit || 0,
    max_loss: data.max_loss || 0,
    breakeven: data.breakeven || 0,
    est_pop: data.est_pop || 0,
    risk_reward: (data.max_profit || 0) / (data.max_loss || 1),
    ips_score: data.ips_score,
    composite_score: data.composite_score,
  };
}

/**
 * Calculate statistics across all candidates
 */
function calculateStatistics(candidates: AuditCandidate[]) {
  const compositeScores = candidates.map(c => c.composite_score || 0).sort((a, b) => a - b);
  const ipsScores = candidates.map(c => c.ips_score || 0).sort((a, b) => a - b);
  const yieldScores = candidates.map(c => c.yield_score || 0).sort((a, b) => a - b);

  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    composite: {
      min: compositeScores[0],
      max: compositeScores[compositeScores.length - 1],
      avg: avg(compositeScores),
      median: median(compositeScores),
    },
    ips: {
      min: ipsScores[0],
      max: ipsScores[ipsScores.length - 1],
      avg: avg(ipsScores),
      median: median(ipsScores),
    },
    yield: {
      min: yieldScores[0],
      max: yieldScores[yieldScores.length - 1],
      avg: avg(yieldScores),
      median: median(yieldScores),
    },
  };
}

/**
 * Print audit results
 */
function printResults(result: AuditResult) {
  console.log(`\n\n🎯 AUDIT RESULTS`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  console.log(`Symbol: ${result.symbol}`);
  console.log(`Total combinations tested: ${result.total_combinations_tested.toLocaleString()}`);
  console.log(`Expirations tested: ${result.expirations_tested}`);
  console.log(`Spread widths tested: ${result.spread_widths_tested.join(", ")}`);

  console.log(`\n📊 Score Distribution:`);
  console.log(`   Composite: ${result.score_distribution.composite.min.toFixed(1)} - ${result.score_distribution.composite.max.toFixed(1)} (avg: ${result.score_distribution.composite.avg.toFixed(1)}, median: ${result.score_distribution.composite.median.toFixed(1)})`);
  console.log(`   IPS:       ${result.score_distribution.ips.min.toFixed(1)} - ${result.score_distribution.ips.max.toFixed(1)} (avg: ${result.score_distribution.ips.avg.toFixed(1)}, median: ${result.score_distribution.ips.median.toFixed(1)})`);
  console.log(`   Yield:     ${result.score_distribution.yield.min.toFixed(1)} - ${result.score_distribution.yield.max.toFixed(1)} (avg: ${result.score_distribution.yield.avg.toFixed(1)}, median: ${result.score_distribution.yield.median.toFixed(1)})`);

  console.log(`\n🏆 Top 5 by Composite Score:`);
  result.top_by_composite.slice(0, 5).forEach((c, i) => {
    console.log(`   ${i + 1}. $${c.short_strike}/${c.long_strike} ${c.dte}d - Composite: ${c.composite_score?.toFixed(1)}, IPS: ${c.ips_score?.toFixed(1)}%, Yield: ${c.yield_score?.toFixed(1)}, Credit: $${c.entry_mid.toFixed(2)}, PoP: ${(c.est_pop * 100).toFixed(0)}%`);
  });

  console.log(`\n🎖️  Top 5 by IPS Score:`);
  result.top_by_ips.slice(0, 5).forEach((c, i) => {
    console.log(`   ${i + 1}. $${c.short_strike}/${c.long_strike} ${c.dte}d - IPS: ${c.ips_score?.toFixed(1)}%, Composite: ${c.composite_score?.toFixed(1)}, Yield: ${c.yield_score?.toFixed(1)}, Credit: $${c.entry_mid.toFixed(2)}`);
  });

  console.log(`\n💰 Top 5 by Expected Value (per dollar at risk):`);
  result.top_by_expected_value.slice(0, 5).forEach((c, i) => {
    const ev = c.risk_adjusted_metrics?.expected_value_per_dollar || 0;
    console.log(`   ${i + 1}. $${c.short_strike}/${c.long_strike} ${c.dte}d - EV/$ ${ev.toFixed(3)}, Composite: ${c.composite_score?.toFixed(1)}, Credit: $${c.entry_mid.toFixed(2)}, PoP: ${(c.est_pop * 100).toFixed(0)}%`);
  });

  if (result.agent_selected) {
    console.log(`\n🤖 Agent's Selection:`);
    console.log(`   $${result.agent_selected.short_strike}/${result.agent_selected.long_strike} ${result.agent_selected.dte}d`);
    console.log(`   Composite: ${result.agent_selected.composite_score?.toFixed(1)}, IPS: ${result.agent_selected.ips_score?.toFixed(1)}%, Credit: $${result.agent_selected.entry_mid.toFixed(2)}`);
    console.log(`   Rank in Composite: #${result.agent_rank_in_composite} of ${result.total_combinations_tested}`);
    console.log(`   Rank in IPS: #${result.agent_rank_in_ips} of ${result.total_combinations_tested}`);

    if (result.is_agent_optimal) {
      console.log(`\n   ✅ OPTIMAL - Agent selected the best trade!`);
    } else {
      console.log(`\n   ⚠️  NOT OPTIMAL - Better alternatives exist:`);
      result.better_alternatives?.slice(0, 3).forEach((c, i) => {
        console.log(`      ${i + 1}. $${c.short_strike}/${c.long_strike} ${c.dte}d - Composite: ${c.composite_score?.toFixed(1)} (vs ${result.agent_selected?.composite_score?.toFixed(1)})`);
        console.log(`         Improvement: +${((c.composite_score || 0) - (result.agent_selected?.composite_score || 0)).toFixed(1)} points`);
      });
    }
  } else {
    console.log(`\n🤖 Agent's Selection: Not found in database`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const symbolArg = args.find(a => a.startsWith("--symbol="));
  const ipsIdArg = args.find(a => a.startsWith("--ips-id="));

  if (!symbolArg) {
    console.error("Usage: npx tsx scripts/audit-agent-optimality.ts --symbol=AMZN [--ips-id=<uuid>]");
    process.exit(1);
  }

  const symbol = symbolArg.split("=")[1];
  const ipsId = ipsIdArg?.split("=")[1];

  const config: AuditConfig = {
    symbol,
    ipsId,
    maxExpirations: 999, // Test ALL expirations
    maxStrikesPerExpiration: 999, // Test ALL strikes
    spreadWidths: [1, 2, 3, 5, 10], // Test common spread widths
    minDTE: 1,
    maxDTE: 365,
    minDelta: 0.01,
    maxDelta: 0.50,
    minCredit: 0.05,
    minRiskReward: 0.05,
  };

  const result = await auditAgentOptimality(config);
  printResults(result);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
