import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ipsId, factorValues, tradeId } = body;
    
    if (!ipsId || !factorValues) {
      return NextResponse.json({ 
        error: 'Missing required fields: ipsId, factorValues' 
      }, { status: 400 });
    }

    // Get IPS configuration and factors from database (current schema)
    const { data: ips, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ips) {
      return NextResponse.json({ 
        error: 'IPS configuration not found' 
      }, { status: 404 });
    }

    // Get IPS factors with weights and targets
    const { data: ipsFactors, error: factorsError } = await supabase
      .from('ips_factors')
      .select(`
        factor_name,
        weight,
        target_value,
        target_operator,
        target_value_max,
        preference_direction,
        enabled,
        factor_definitions:factor_definitions(data_type, unit, category)
      `)
      .eq('ips_id', ipsId)
      .eq('enabled', true);

    if (factorsError) {
      throw new Error(`Failed to fetch IPS factors: ${factorsError.message}`);
    }

    // Calculate weighted score using actual IPS configuration
    const factorScores: Array<{
      factorName: string;
      value: number;
      weight: number;
      individualScore: number;
      weightedScore: number;
      targetMet: boolean;
    }> = [];

    let totalWeight = 0;
    let weightedSum = 0;

    for (const ipsFactor of ipsFactors || []) {
    const factorName = ipsFactor.factor_name;
    const factorValue = factorValues[factorName];
    
    if (factorValue === undefined || factorValue === null) {
        continue; // Skip missing factors
    }

    const value = typeof factorValue === 'object' ? factorValue.value : factorValue;
    const weight = ipsFactor.weight;
    
    // Fix the factors access - handle array or single object
    const factorInfo = Array.isArray((ipsFactor as any).factor_definitions)
      ? (ipsFactor as any).factor_definitions[0]
      : (ipsFactor as any).factor_definitions;
    
    // Operator-based target check with partial credit for closeness
    let individualScore = 0;
    let targetMet = false;

    const tv = Number(ipsFactor.target_value);
    const tvMax = Number(ipsFactor.target_value_max);
    const val = Number(value);

    switch (ipsFactor.target_operator) {
      case 'gte':
        targetMet = !Number.isNaN(tv) ? val >= tv : false;
        break;
      case 'lte':
        targetMet = !Number.isNaN(tv) ? val <= tv : false;
        break;
      case 'eq':
        targetMet = !Number.isNaN(tv) ? Math.abs(val - tv) < 1e-6 : false;
        break;
      case 'range':
        targetMet = !Number.isNaN(tv) && !Number.isNaN(tvMax) ? val >= tv && val <= tvMax : false;
        break;
      default:
        targetMet = true; // informational-only factor
        break;
    }

    const clamp = (n:number)=> Math.max(0, Math.min(100, n));
    if (targetMet) {
      individualScore = 100;
    } else {
      switch (ipsFactor.target_operator) {
        case 'gte':
          individualScore = Number.isFinite(tv) && tv !== 0 ? clamp((val / tv) * 100) : 0;
          break;
        case 'lte':
          individualScore = val !== 0 ? clamp((tv / val) * 100) : 0;
          break;
        case 'eq': {
          const denom = Math.abs(tv) > 0 ? Math.abs(tv) : (Math.abs(val) || 1);
          const relErr = Math.abs(val - tv) / denom;
          individualScore = clamp((1 - relErr) * 100);
          break;
        }
        case 'range':
          if (Number.isFinite(tv) && Number.isFinite(tvMax)) {
            if (val < tv) individualScore = tv !== 0 ? clamp((val / tv) * 100) : 0;
            else if (val > tvMax) individualScore = val !== 0 ? clamp((tvMax / val) * 100) : 0;
            else individualScore = 100;
          } else individualScore = 0;
          break;
        default:
          individualScore = 0;
      }
    }

    const weightedScore = (individualScore * weight) / 100;
    
    factorScores.push({
        factorName,
        value,
        weight,
        individualScore,
        weightedScore,
        targetMet
    });

    totalWeight += weight;
    weightedSum += weightedScore;
    }

    // Calculate final score
    const finalScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
    const targetsMetCount = factorScores.filter(f => f.targetMet).length;
    const targetPercentage = factorScores.length > 0 ? (targetsMetCount / factorScores.length) * 100 : 0;

    // Save score calculation to database
    const scoreData = {
      ips_id: ipsId,
      trade_id: tradeId || null,
      final_score: finalScore,
      total_weight: totalWeight,
      factors_used: factorScores.length,
      targets_met: targetsMetCount,
      target_percentage: targetPercentage,
      calculation_details: {
        factorScores,
        weightedSum,
        totalWeight
      },
      created_at: new Date().toISOString()
    };

    const { data: savedScore, error: scoreError } = await supabase
      .from('ips_score_calculations')
      .insert(scoreData)
      .select()
      .single();

    if (scoreError) {
      console.error('Failed to save score calculation:', scoreError);
    }

    // Also save individual factor scores
    const factorScoreInserts = factorScores.map(fs => ({
      ips_score_calculation_id: savedScore?.id,
      factor_name: fs.factorName,
      factor_value: fs.value,
      weight: fs.weight,
      individual_score: fs.individualScore,
      weighted_score: fs.weightedScore,
      target_met: fs.targetMet,
      created_at: new Date().toISOString()
    }));

    if (savedScore?.id && factorScoreInserts.length > 0) {
      const { error: factorScoreError } = await supabase
        .from('factor_score_details')
        .insert(factorScoreInserts);

      if (factorScoreError) {
        console.error('Failed to save factor score details:', factorScoreError);
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        score: finalScore,
        scoreId: savedScore?.id,
        breakdown: {
          totalWeight,
          weightedSum,
          factorScores,
          targetsMetCount,
          targetPercentage
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error calculating IPS score:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to calculate IPS score', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
