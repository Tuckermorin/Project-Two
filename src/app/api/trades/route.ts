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
      strategyType,
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

    // Pre-compute safe numeric fields (avoid NaN inserts)
    const credit = typeof tradeData?.creditReceived === 'number' ? tradeData.creditReceived : null;
    const numC = typeof tradeData?.numberOfContracts === 'number' ? tradeData.numberOfContracts : null;
    const shortStrike = typeof tradeData?.shortStrike === 'number' ? tradeData.shortStrike : null;
    const longStrike = typeof tradeData?.longStrike === 'number' ? tradeData.longStrike : null;
    const spreadWidth = shortStrike != null && longStrike != null ? Math.abs(shortStrike - longStrike) : null;
    const maxGain = credit != null && numC != null ? credit * numC * 100 : null;
    const maxLoss = spreadWidth != null && credit != null && numC != null ? (spreadWidth - credit) * numC * 100 : null;

    // Start transaction
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id: userId,
        ips_id: ipsId,
        ips_score_calculation_id: scoreId,
        status: 'prospective',
        strategy_type: strategyType || tradeData?.contractType || 'unknown',
        name: tradeData.name,
        symbol: tradeData.symbol,
        contract_type: tradeData.contractType,
        current_price: tradeData.currentPrice,
        expiration_date: tradeData.expirationDate,
        number_of_contracts: tradeData.numberOfContracts,
        short_strike: shortStrike,
        long_strike: longStrike,
        credit_received: credit,
        ips_score: ipsScore,
        max_gain: maxGain,
        max_loss: maxLoss,
        spread_width: spreadWidth,
        entry_date: null, // not yet active
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

    // Update IPS performance statistics (write back to ips_configurations)
    const { data: ipsStats } = await supabase
      .from('trades')
      .select('status, ips_score')
      .eq('ips_id', ipsId);

    if (ipsStats) {
      const totalTrades = ipsStats.length;
      const avgScore = totalTrades > 0
        ? ipsStats.reduce((sum, trade) => sum + (trade.ips_score || 0), 0) / totalTrades
        : 0;

      await supabase
        .from('ips_configurations')
        .update({
          total_trades: totalTrades,
          last_modified: new Date().toISOString()
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
    const id = searchParams.get('id');
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing userId parameter' 
      }, { status: 400 });
    }

    let query = supabase
      .from('trades')
      .select(`
        *,
        ips_configurations(name, description),
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
      .order('created_at', { ascending: false });

    if (id) {
      query = query.eq('id', id);
    } else if (status) {
      query = query.eq('status', status);
    }

    const { data: trades, error } = await query;

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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, status, userId } = body as { ids: string[]; status: 'prospective'|'active'|'closed'|'expired'|'cancelled'; userId?: string };
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return NextResponse.json({ error: 'ids[] and status required' }, { status: 400 });
    }

    // When moving to active, stamp entry_date
    const updatePayload: any = { status };
    if (status === 'active') updatePayload.entry_date = new Date().toISOString();

    const { error } = await supabase
      .from('trades')
      .update(updatePayload)
      .in('id', ids);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error PATCH /api/trades:', err);
    return NextResponse.json({ error: 'Failed to update trades' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    }

    const { error } = await supabase.from('trades').delete().in('id', ids);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error DELETE /api/trades:', err);
    return NextResponse.json({ error: 'Failed to delete trades' }, { status: 500 });
  }
}
