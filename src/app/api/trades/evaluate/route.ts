import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trade_id, factor_values } = body;

    if (!trade_id || !factor_values) {
      return NextResponse.json(
        { error: 'Trade ID and factor values are required' },
        { status: 400 }
      );
    }

    // Get trade with IPS configuration
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select(`
        *,
        ips_configurations (
          id,
          name
        )
      `)
      .eq('id', trade_id)
      .single();

    if (tradeError || !trade) {
      return NextResponse.json(
        { error: 'Trade not found' },
        { status: 404 }
      );
    }

    if (!trade.ips_id) {
      return NextResponse.json(
        { error: 'Trade has no associated IPS' },
        { status: 400 }
      );
    }

    // Get IPS factors
    const { data: ipsFactors, error: factorsError } = await supabase
      .from('ips_factors')
      .select('*')
      .eq('ips_id', trade.ips_id)
      .eq('enabled', true);

    if (factorsError) {
      throw new Error(`Failed to fetch IPS factors: ${factorsError.message}`);
    }

    // Calculate scores
    let totalWeight = 0;
    let weightedScore = 0;
    let factorsMet = 0;
    const factorScores: any = {};

    for (const factor of ipsFactors || []) {
      const value = factor_values[factor.factor_id];
      if (value === undefined || value === null) continue;

      totalWeight += factor.weight;
      let score = 0;
      let met = false;

      // Calculate if target is met
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

      // Calculate score based on preference direction
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

    // Get current market data (you'd fetch this from your market data service)
    const currentPrice = factor_values.current_price || trade.entry_price;

    // Create evaluation record
    const { data: evaluation, error: evalError } = await supabase
      .from('trade_evaluations')
      .insert({
        trade_id,
        underlying_price: currentPrice,
        ips_score: finalScore,
        factor_scores: factorScores,
        factors_met: factorsMet,
        total_factors: ipsFactors?.length || 0
      })
      .select()
      .single();

    if (evalError) {
      throw new Error(`Failed to create evaluation: ${evalError.message}`);
    }

    // Update trade with latest score
    await supabase
      .from('trades')
      .update({
        ips_score: finalScore,
        factors_met: factorsMet,
        total_factors: ipsFactors?.length || 0
      })
      .eq('id', trade_id);

    return NextResponse.json({
      success: true,
      data: {
        evaluation,
        score: finalScore,
        factors_met: factorsMet,
        total_factors: ipsFactors?.length || 0,
        factor_scores: factorScores
      }
    });

  } catch (error) {
    console.error('Error evaluating trade:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to evaluate trade' },
      { status: 500 }
    );
  }
}