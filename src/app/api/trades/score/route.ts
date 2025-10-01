import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { computeIpsScore } from '@/lib/services/trade-scoring-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ipsId, factorValues, tradeId } = body;

    if (!ipsId || !factorValues) {
      return NextResponse.json({
        error: 'Missing required fields: ipsId, factorValues'
      }, { status: 400 });
    }

    // RLS automatically enforces user ownership
    const { data: ips, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ips) {
      return NextResponse.json({
        error: 'IPS configuration not found or unauthorized'
      }, { status: 404 });
    }

    const scoreResult = await computeIpsScore(supabase, ipsId, factorValues);
    const factorScores = scoreResult.factorScores;
    const totalWeight = scoreResult.totalWeight;
    const weightedSum = scoreResult.weightedSum;
    const finalScore = scoreResult.finalScore;
    const targetsMetCount = scoreResult.targetsMetCount;
    const targetPercentage = scoreResult.targetPercentage;

    // Save score calculation to database
    const scoreData = {
      user_id: user.id,
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
      factor_value:
        fs.value === null || fs.value === undefined || fs.value === ''
          ? null
          : Number.isFinite(Number(fs.value))
            ? Number(fs.value)
            : null,
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

