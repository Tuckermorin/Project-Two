// ============================================
// src/lib/db/ips-helpers.ts
// Database helper functions for IPS operations
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ============================================
// IPS OPERATIONS
// ============================================

export async function createIPSWithFactors(
  name: string,
  description: string,
  factors: Array<{
    factor_id: string;
    weight: number;
    target_value?: number;
    target_operator?: string;
    preference_direction?: string;
    enabled?: boolean;
  }>
) {
  // Start a Supabase transaction-like operation
  try {
    // Create IPS configuration
    const { data: ips, error: ipsError } = await supabase
      .from('ips_configurations')
      .insert({
        user_id: 'default-user',
        name,
        description,
        total_factors: factors.length,
        active_factors: factors.filter(f => f.enabled !== false).length,
        total_weight: factors.reduce((sum, f) => sum + f.weight, 0),
        avg_weight: factors.length > 0 
          ? factors.reduce((sum, f) => sum + f.weight, 0) / factors.length 
          : 0
      })
      .select()
      .single();

    if (ipsError) throw ipsError;

    // Add factors
    const factorRows = factors.map(f => ({
      ips_id: ips.id,
      factor_id: f.factor_id,
      factor_name: f.factor_id, // You should map this from ALL_FACTORS
      weight: f.weight,
      target_value: f.target_value,
      target_operator: f.target_operator || 'gte',
      preference_direction: f.preference_direction || 'higher',
      enabled: true
    }));

    const { error: factorsError } = await supabase
      .from('ips_factors')
      .insert(factorRows);

    if (factorsError) {
      // Rollback by deleting the IPS
      await supabase.from('ips_configurations').delete().eq('id', ips.id);
      throw factorsError;
    }

    return { success: true, data: ips };
  } catch (error) {
    return { success: false, error };
  }
}

export async function getIPSWithFactors(ipsId: string) {
  const { data, error } = await supabase
    .from('ips_configurations')
    .select(`
      *,
      ips_factors (
        id,
        factor_id,
        factor_name,
        weight,
        target_value,
        target_operator,
        target_value_max,
        preference_direction,
        enabled
      )
    `)
    .eq('id', ipsId)
    .single();

  return { data, error };
}

export async function toggleIPSActive(ipsId: string) {
  // First get current state
  const { data: current } = await supabase
    .from('ips_configurations')
    .select('is_active')
    .eq('id', ipsId)
    .single();

  if (!current) return { error: 'IPS not found' };

  // Toggle the state
  const { data, error } = await supabase
    .from('ips_configurations')
    .update({ is_active: !current.is_active })
    .eq('id', ipsId)
    .select()
    .single();

  return { data, error };
}

// ============================================
// TRADE OPERATIONS
// ============================================

export async function createTrade(tradeData: {
  symbol: string;
  strategy_type: string;
  entry_date: string;
  ips_id?: string;
  expiration_date?: string;
  strike_price?: number;
  strike_price_short?: number;
  strike_price_long?: number;
  premium_collected?: number;
  contracts?: number;
}) {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: 'default-user',
      status: 'prospective',
      ...tradeData
    })
    .select()
    .single();

  return { data, error };
}

export async function evaluateTrade(
  tradeId: string,
  factorValues: Record<string, number>
) {
  // Get trade with IPS
  const { data: trade } = await supabase
    .from('trades')
    .select('*, ips_id')
    .eq('id', tradeId)
    .single();

  if (!trade || !trade.ips_id) {
    return { error: 'Trade or IPS not found' };
  }

  // Get IPS factors
  const { data: factors } = await supabase
    .from('ips_factors')
    .select('*')
    .eq('ips_id', trade.ips_id)
    .eq('enabled', true);

  if (!factors) {
    return { error: 'No factors found for IPS' };
  }

  // Calculate score
  let totalWeight = 0;
  let weightedScore = 0;
  let factorsMet = 0;
  const factorScores: Record<string, any> = {};

  for (const factor of factors) {
    const value = factorValues[factor.factor_id];
    if (value === undefined) continue;

    totalWeight += factor.weight;
    let met = false;
    let score = 0;

    // Check if target is met
    if (factor.target_operator && factor.target_value !== null) {
      switch (factor.target_operator) {
        case 'gte':
          met = value >= factor.target_value;
          break;
        case 'lte':
          met = value <= factor.target_value;
          break;
        case 'eq':
          met = Math.abs(value - factor.target_value) < 0.01;
          break;
        case 'range':
          met = value >= factor.target_value && 
                value <= (factor.target_value_max || factor.target_value);
          break;
      }
    }

    // Calculate score
    if (factor.preference_direction === 'higher') {
      score = Math.min(100, (value / (factor.target_value || 1)) * 100);
    } else if (factor.preference_direction === 'lower') {
      score = Math.min(100, ((factor.target_value || 1) / value) * 100);
    } else {
      score = met ? 100 : 50;
    }

    if (met) factorsMet++;
    weightedScore += score * factor.weight;

    factorScores[factor.factor_id] = {
      value,
      score,
      met,
      weight: factor.weight
    };
  }

  const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

  // Create evaluation
  const { data: evaluation, error } = await supabase
    .from('trade_evaluations')
    .insert({
      trade_id: tradeId,
      underlying_price: factorValues.current_price || 0,
      ips_score: finalScore,
      factor_scores: factorScores,
      factors_met: factorsMet,
      total_factors: factors.length
    })
    .select()
    .single();

  // Update trade
  await supabase
    .from('trades')
    .update({
      ips_score: finalScore,
      factors_met: factorsMet,
      total_factors: factors.length
    })
    .eq('id', tradeId);

  return { 
    data: evaluation, 
    error,
    score: finalScore,
    factorsMet,
    totalFactors: factors.length
  };
}

// ============================================
// DAILY EVALUATION JOB
// ============================================

export async function runDailyEvaluations() {
  // Get all active trades
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'active');

  if (!trades) return;

  for (const trade of trades) {
    // Here you would fetch current market data
    // For now, using placeholder values
    const factorValues = {
      current_price: trade.entry_price * (1 + Math.random() * 0.1 - 0.05),
      // Add other factor values from your market data service
    };

    await evaluateTrade(trade.id, factorValues);
  }
}

// ============================================
// COMMON QUERIES
// ============================================

// Get all IPS configurations with their performance
export async function getAllIPSWithPerformance() {
  const { data, error } = await supabase
    .from('ips_configurations')
    .select(`
      *,
      trades (
        id,
        status,
        ips_score
      )
    `)
    .order('created_at', { ascending: false });

  // Calculate performance metrics
  const ipsWithMetrics = data?.map(ips => {
    const closedTrades = ips.trades?.filter((t: any) => t.status === 'closed') || [];
    const winningTrades = closedTrades.filter((t: any) => t.ips_score && t.ips_score >= 70);
    
    return {
      ...ips,
      performance: {
        totalTrades: ips.trades?.length || 0,
        closedTrades: closedTrades.length,
        winRate: closedTrades.length > 0 
          ? (winningTrades.length / closedTrades.length) * 100 
          : 0,
        avgScore: ips.trades?.reduce((sum: number, t: any) => sum + (t.ips_score || 0), 0) / (ips.trades?.length || 1)
      }
    };
  });

  return { data: ipsWithMetrics, error };
}

// Get trades with evaluations for a specific date range
export async function getTradesWithEvaluations(
  startDate: string,
  endDate: string,
  status?: string
) {
  let query = supabase
    .from('trades')
    .select(`
      *,
      ips_configurations (
        name,
        description
      ),
      trade_evaluations (
        id,
        evaluation_date,
        ips_score,
        factors_met,
        total_factors,
        unrealized_pnl,
        unrealized_pnl_percent
      )
    `)
    .gte('entry_date', startDate)
    .lte('entry_date', endDate);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  return { data, error };
}

// Get today's trades that need evaluation
export async function getTradesToEvaluate() {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      ips_configurations (
        id,
        name
      )
    `)
    .in('status', ['active', 'prospective'])
    .not('ips_id', 'is', null);

  // Filter out trades already evaluated today
  const tradesWithTodayCheck = [];
  for (const trade of data || []) {
    const { data: todayEval } = await supabase
      .from('trade_evaluations')
      .select('id')
      .eq('trade_id', trade.id)
      .eq('evaluation_date', today)
      .single();
    
    if (!todayEval) {
      tradesWithTodayCheck.push(trade);
    }
  }

  return { data: tradesWithTodayCheck, error };
}

// Get factor performance across all trades
export async function getFactorPerformance(factorId: string) {
  const { data: evaluations, error } = await supabase
    .from('trade_evaluations')
    .select('factor_scores')
    .not('factor_scores', 'is', null);

  if (error || !evaluations) return { data: null, error };

  let totalScore = 0;
  let totalWeight = 0;
  let timesMet = 0;
  let timesUsed = 0;

  evaluations.forEach(evaluation => {
    const factorData = evaluation.factor_scores[factorId];
    if (factorData) {
      totalScore += factorData.score * factorData.weight;
      totalWeight += factorData.weight;
      if (factorData.met) timesMet++;
      timesUsed++;
    }
  });

  return {
    data: {
      factor_id: factorId,
      avg_score: totalWeight > 0 ? totalScore / totalWeight : 0,
      success_rate: timesUsed > 0 ? (timesMet / timesUsed) * 100 : 0,
      times_used: timesUsed,
      times_met: timesMet
    },
    error: null
  };
}

// ============================================
// SAMPLE USAGE EXAMPLES
// ============================================

/*
// Example 1: Create a new IPS with factors
const newIPS = await createIPSWithFactors(
  'Conservative Put Credit Spread',
  'Focus on high probability trades with strong support',
  [
    { factor_id: 'av-pe-ratio', weight: 7, target_value: 25, target_operator: 'lte' },
    { factor_id: 'opt-delta', weight: 9, target_value: 0.30, target_operator: 'lte' },
    { factor_id: 'opt-iv', weight: 8, target_value: 30, target_operator: 'gte' },
    { factor_id: 'qual-economic-moat', weight: 6, target_value: 4, target_operator: 'gte' }
  ]
);

// Example 2: Create a trade
const newTrade = await createTrade({
  symbol: 'AAPL',
  strategy_type: 'put_credit',
  entry_date: '2024-01-15',
  expiration_date: '2024-02-16',
  ips_id: 'your-ips-id-here',
  strike_price_short: 180,
  strike_price_long: 175,
  premium_collected: 1.25,
  contracts: 2
});

// Example 3: Evaluate a trade
const evaluation = await evaluateTrade(
  'trade-id-here',
  {
    'av-pe-ratio': 24.5,
    'opt-delta': 0.25,
    'opt-iv': 35,
    'qual-economic-moat': 5,
    current_price: 185.50
  }
);

// Example 4: Get all IPS with performance metrics
const allIPS = await getAllIPSWithPerformance();
console.log('IPS Configurations:', allIPS.data);

// Example 5: Run daily evaluations (could be in a cron job)
await runDailyEvaluations();
*/