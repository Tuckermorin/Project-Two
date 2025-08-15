import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET - Fetch trades
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default-user';
    const status = searchParams.get('status');
    const ipsId = searchParams.get('ipsId');

    let query = supabase
      .from('trades')
      .select(`
        *,
        ips_configurations (
          name,
          description
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (ipsId) {
      query = query.eq('ips_id', ipsId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch trades: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: data || []
    });

  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}

// POST - Create new trade
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id = 'default-user',
      ips_id,
      symbol,
      strategy_type,
      entry_date,
      expiration_date,
      quantity,
      entry_price,
      strike_price,
      strike_price_short,
      strike_price_long,
      premium_collected,
      premium_paid,
      contracts,
      notes,
      ips_score,
      factors_met,
      total_factors
    } = body;

    if (!symbol || !strategy_type || !entry_date) {
      return NextResponse.json(
        { error: 'Symbol, strategy type, and entry date are required' },
        { status: 400 }
      );
    }

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        user_id,
        ips_id,
        symbol,
        strategy_type,
        entry_date,
        expiration_date,
        status: 'prospective',
        quantity,
        entry_price,
        strike_price,
        strike_price_short,
        strike_price_long,
        premium_collected,
        premium_paid,
        contracts,
        notes,
        ips_score,
        factors_met,
        total_factors
      })
      .select()
      .single();

    if (tradeError) {
      throw new Error(`Failed to create trade: ${tradeError.message}`);
    }

    // If IPS score was calculated, update IPS stats
    if (ips_id && ips_score !== null) {
      await updateIPSStats(ips_id);
    }

    return NextResponse.json({
      success: true,
      data: trade
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating trade:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create trade' },
      { status: 500 }
    );
  }
}

// Helper function to update IPS statistics
async function updateIPSStats(ipsId: string) {
  try {
    // Get all trades for this IPS
    const { data: trades } = await supabase
      .from('trades')
      .select('ips_score, status')
      .eq('ips_id', ipsId);

    if (!trades || trades.length === 0) return;

    // Calculate statistics
    const totalTrades = trades.length;
    const closedTrades = trades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => t.ips_score && t.ips_score >= 70);
    const winRate = closedTrades.length > 0 
      ? (winningTrades.length / closedTrades.length) * 100 
      : null;

    // Update IPS configuration
    await supabase
      .from('ips_configurations')
      .update({
        total_trades: totalTrades,
        win_rate: winRate
      })
      .eq('id', ipsId);

  } catch (error) {
    console.error('Error updating IPS stats:', error);
  }
}