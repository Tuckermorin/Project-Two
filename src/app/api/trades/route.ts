import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      userId, 
      ipsId, 
      tradeData, 
      factorValues, 
      ipsScore,
      scoreId 
    } = body;
    
    if (!userId || !ipsId || !tradeData) {
      return NextResponse.json({ 
        error: 'Missing required fields: userId, ipsId, tradeData' 
      }, { status: 400 });
    }

    // Start transaction
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: userId,
        ips_id: ipsId,
        ips_score_calculation_id: scoreId,
        status: 'prospective',
        name: tradeData.name,
        symbol: tradeData.symbol,
        contract_type: tradeData.contractType,
        current_price: tradeData.currentPrice,
        expiration_date: tradeData.expirationDate,
        number_of_contracts: tradeData.numberOfContracts,
        short_strike: tradeData.shortStrike,
        long_strike: tradeData.longStrike,
        credit_received: tradeData.creditReceived,
        ips_score: ipsScore,
        max_gain: (tradeData.creditReceived * tradeData.numberOfContracts * 100),
        max_loss: ((Math.abs(tradeData.shortStrike - tradeData.longStrike) - tradeData.creditReceived) * tradeData.numberOfContracts * 100),
        spread_width: Math.abs(tradeData.shortStrike - tradeData.longStrike),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (tradeError) {
      throw new Error(`Failed to create trade: ${tradeError.message}`);
    }

    // Save all factor values used in this trade
    if (factorValues && Object.keys(factorValues).length > 0) {
      const factorInserts = Object.entries(factorValues).map(([factorName, factorData]: [string, any]) => {
        const value = typeof factorData === 'object' ? factorData.value : factorData;
        const source = typeof factorData === 'object' ? factorData.source : 'manual';
        const confidence = typeof factorData === 'object' ? factorData.confidence : (source === 'manual' ? 0.7 : 0.95);
        
        return {
          trade_id: trade.id,
          factor_name: factorName,
          factor_value: value,
          source,
          confidence,
          created_at: new Date().toISOString()
        };
      });

      const { error: factorsError } = await supabase
        .from('trade_factors')
        .insert(factorInserts);

      if (factorsError) {
        console.error('Error saving trade factors:', factorsError);
        // Don't fail the entire request, just log the error
      }
    }

    // Update trade analytics
    await updateTradeAnalytics(userId, ipsId);
    
    return NextResponse.json({
      success: true,
      data: {
        tradeId: trade.id,
        status: trade.status,
        ipsScore: trade.ips_score,
        maxGain: trade.max_gain,
        maxLoss: trade.max_loss
      }
    });

  } catch (error) {
    console.error('Error creating trade:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to create trade', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

async function updateTradeAnalytics(userId: string, ipsId: string) {
  try {
    // Update user trade statistics
    const { data: userStats } = await supabase
      .from('trades')
      .select('status, ips_score')
      .eq('user_id', userId);

    if (userStats) {
      const totalTrades = userStats.length;
      const avgScore = userStats.reduce((sum, trade) => sum + (trade.ips_score || 0), 0) / totalTrades;
      
      await supabase
        .from('user_statistics')
        .upsert({
          user_id: userId,
          total_trades: totalTrades,
          avg_ips_score: avgScore,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });
    }

    // Update IPS performance statistics
    const { data: ipsStats } = await supabase
      .from('trades')
      .select('status, ips_score')
      .eq('ips_id', ipsId);

    if (ipsStats) {
      const totalTrades = ipsStats.length;
      const avgScore = ipsStats.reduce((sum, trade) => sum + (trade.ips_score || 0), 0) / totalTrades;
      
      await supabase
        .from('investment_performance_systems')
        .update({
          total_trades: totalTrades,
          avg_score: avgScore,
          last_used: new Date().toISOString()
        })
        .eq('id', ipsId);
    }
  } catch (error) {
    console.error('Error updating analytics:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status') || 'prospective';
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing userId parameter' 
      }, { status: 400 });
    }

    const { data: trades, error } = await supabase
      .from('trades')
      .select(`
        *,
        investment_performance_systems(name, description),
        trade_factors(
          factor_name,
          factor_value,
          source,
          confidence
        ),
        ips_score_calculations(
          final_score,
          factors_used,
          targets_met,
          target_percentage
        )
      `)
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch trades: ${error.message}`);
    }
    
    return NextResponse.json({
      success: true,
      data: trades || []
    });

  } catch (error) {
    console.error('Error fetching trades:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch trades', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}