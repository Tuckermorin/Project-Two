import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      ipsId,
      ipsName,
      strategyType,
      tradeData,
      factorValues,
      ipsScore,
      scoreId
    } = body;

    if (!ipsId || !tradeData) {
      return NextResponse.json({
        error: 'Missing required fields: ipsId, tradeData'
      }, { status: 400 });
    }

    const userId = user.id;

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
        ips_name: ipsName || tradeData?.ipsName || null,
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
    await updateTradeAnalytics(supabase, userId, ipsId);

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

async function updateTradeAnalytics(supabase: any, userId: string, ipsId: string) {
  try {
    // RLS automatically filters by user_id
    const { data: userStats } = await supabase
      .from('trades')
      .select('status, ips_score');

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
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'prospective';
    const id = searchParams.get('id');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;
    const userId = user.id;

    console.log('[Trades API GET] Fetching trades for userId:', userId, 'status:', status, 'limit:', limit, 'offset:', offset);

    // RLS automatically filters by user_id
    let query = supabase
      .from('trades')
      .select(`
        *,
        ips_configurations!ips_id(name, description),
        trade_factors(
          factor_name,
          factor_value,
          source,
          confidence
        ),
        trade_closures(
          close_method,
          close_date,
          cost_to_close_per_spread,
          realized_pl,
          realized_pl_percent,
          ips_name
        )
      `)
      .order('created_at', { ascending: false });

    if (id) {
      query = query.eq('id', id);
    } else if (status) {
      query = query.eq('status', status);
    }

    // Add pagination (default limit: 100, can be overridden)
    query = query.range(offset, offset + limit - 1);

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
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, status } = body as { ids: string[]; status: 'prospective'|'active'|'pending'|'closed'|'expired'|'cancelled'|'action_needed' };
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return NextResponse.json({ error: 'ids[] and status required' }, { status: 400 });
    }

    const targetStatus = status === 'action_needed' ? 'pending' : status;

    // When moving to active, stamp entry_date
    const updatePayload: any = { status: targetStatus };
    if (targetStatus === 'active') updatePayload.entry_date = new Date().toISOString();
    if (targetStatus === 'closed') updatePayload.closed_at = new Date().toISOString();

    // RLS automatically enforces user ownership
    const { error } = await supabase
      .from('trades')
      .update(updatePayload)
      .in('id', ids);

    if (error) throw new Error(error.message);

    // Background tasks (don't await - fire and forget)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // OPTIMIZATION: Batch background updates instead of N separate requests
    if (targetStatus === 'active' && ids.length > 0) {
      // Trigger spread price calculation (already batched)
      fetch(`${baseUrl}/api/trades/spread-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeIds: ids })
      }).catch(err => console.error('Failed to trigger spread price update:', err));

      // OPTIMIZATION: Batch save rationale embeddings for all activated trades in one request
      fetch(`${baseUrl}/api/trades/rationale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_embedding', tradeIds: ids })
      }).catch(err => console.error(`Failed to save rationale embeddings:`, err));
    }

    // OPTIMIZATION: Batch record outcomes for AI learning in one request
    if (targetStatus === 'closed' && ids.length > 0) {
      fetch(`${baseUrl}/api/trades/rationale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_outcome', tradeIds: ids })
      }).catch(err => console.error(`Failed to record outcomes:`, err));

      // Embed snapshots for closed trades (for temporal pattern learning)
      fetch(`${baseUrl}/api/trades/snapshots/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeIds: ids })
      }).catch(err => console.error(`Failed to embed snapshots:`, err));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error PATCH /api/trades:', err);
    return NextResponse.json({ error: 'Failed to update trades' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids } = body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    }

    // RLS automatically enforces user ownership
    const { error } = await supabase
      .from('trades')
      .delete()
      .in('id', ids);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error DELETE /api/trades:', err);
    return NextResponse.json({ error: 'Failed to delete trades' }, { status: 500 });
  }
}
