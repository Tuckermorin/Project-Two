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
    
    // Calculate individual factor score based on type and targets
    let individualScore = 0;
    let targetMet = false;

    if (factorInfo?.data_type === 'rating') {
        // Qualitative factors (1-5 scale)
        individualScore = ((value - 1) / 4) * 100; // Convert 1-5 to 0-100
        
        if (ipsFactor.target_value) {
        switch (ipsFactor.target_operator) {
            case 'gte':
            targetMet = value >= ipsFactor.target_value;
            break;
            case 'lte':
            targetMet = value <= ipsFactor.target_value;
            break;
            case 'eq':
            targetMet = value === ipsFactor.target_value;
            break;
            case 'range':
            targetMet = value >= ipsFactor.target_value && 
                        value <= (ipsFactor.target_value_max || ipsFactor.target_value);
            break;
        }
        }
    } else {
        // Rest of your quantitative factors logic stays the same...
        switch (factorName) {
        case 'P/E Ratio':
            // Optimal range around 15-25
            if (value <= 15) individualScore = 100;
            else if (value <= 25) individualScore = 100 - ((value - 15) * 3);
            else individualScore = Math.max(0, 70 - ((value - 25) * 2));
            break;
            
        case 'Beta':
            // Depends on strategy preference
            if (ipsFactor.preference_direction === 'lower') {
            individualScore = Math.max(0, 100 - (value * 50)); // Prefer lower beta
            } else if (ipsFactor.preference_direction === 'higher') {
            individualScore = Math.min(100, value * 50); // Prefer higher beta
            } else {
            individualScore = Math.max(0, 100 - Math.abs(value - 1.0) * 50); // Prefer beta around 1.0
            }
            break;
            
        case 'Return on Equity TTM':
            // Higher is better, but cap at reasonable levels
            individualScore = Math.min(100, Math.max(0, (value / 25) * 100));
            break;
            
        case 'Quarterly Revenue Growth YoY':
            // Positive growth is good, but excessive growth might be unsustainable
            if (value < 0) individualScore = Math.max(0, 50 + (value * 2));
            else if (value <= 20) individualScore = 50 + (value * 2.5);
            else individualScore = Math.max(70, 100 - ((value - 20) * 1.5));
            break;
            
        case 'Dividend Yield':
            // Moderate dividend yields are often preferred
            if (value <= 0) individualScore = 20;
            else if (value <= 3) individualScore = 50 + (value * 16.7);
            else if (value <= 6) individualScore = 100 - ((value - 3) * 10);
            else individualScore = Math.max(0, 70 - ((value - 6) * 5));
            break;
            
        default:
            // Generic scoring based on preference direction
            if (ipsFactor.preference_direction === 'higher') {
            individualScore = Math.min(100, Math.max(0, value * 2 + 30));
            } else if (ipsFactor.preference_direction === 'lower') {
            individualScore = Math.min(100, Math.max(0, 100 - (value * 2)));
            } else {
            // Target-based scoring
            if (ipsFactor.target_value) {
                const distance = Math.abs(value - ipsFactor.target_value);
                individualScore = Math.max(0, 100 - (distance * 10));
            } else {
                individualScore = 50; // Neutral score if no clear preference
            }
            }
        }

        // Check if target is met for quantitative factors
        if (ipsFactor.target_value) {
        switch (ipsFactor.target_operator) {
            case 'gte':
            targetMet = value >= ipsFactor.target_value;
            break;
            case 'lte':
            targetMet = value <= ipsFactor.target_value;
            break;
            case 'eq':
            targetMet = Math.abs(value - ipsFactor.target_value) < 0.01;
            break;
            case 'range':
            targetMet = value >= ipsFactor.target_value && 
                        value <= (ipsFactor.target_value_max || ipsFactor.target_value);
            break;
        }
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
