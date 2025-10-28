import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tradeId = params.id

    // Fetch trade with all related data
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select(`
        *,
        ai_trade_evaluations (*),
        trade_snapshots (*),
        trade_postmortem_analysis (*)
      `)
      .eq('id', tradeId)
      .single()

    if (tradeError || !trade) {
      return NextResponse.json(
        { error: 'Trade not found' },
        { status: 404 }
      )
    }

    // Fetch closure data if exists
    const { data: closure } = await supabase
      .from('trade_closures')
      .select('*')
      .eq('trade_id', tradeId)
      .single()

    // Fetch postmortem from trade_postmortems if exists
    const { data: postmortem } = await supabase
      .from('trade_postmortems')
      .select('*')
      .eq('trade_id', tradeId)
      .single()

    // Enrich trade data
    const enrichedTrade = {
      ...trade,
      snapshots: trade.trade_snapshots || [],
      postmortem: postmortem?.post_mortem_data || trade.trade_postmortem_analysis?.[0] || null,
      closure_data: closure,
      exit_price: closure?.cost_to_close_per_spread || trade.exit_price || 0,
      realized_pl: closure?.realized_pl || trade.realized_pnl || 0,
      realized_pl_percent: closure?.realized_pl_percent || trade.realized_pl_percent || 0,
    }

    // Remove the nested arrays to clean up response
    delete enrichedTrade.ai_trade_evaluations
    delete enrichedTrade.trade_snapshots
    delete enrichedTrade.trade_postmortem_analysis

    return NextResponse.json({
      success: true,
      data: enrichedTrade,
    })
  } catch (error: any) {
    console.error('Error fetching trade detail:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch trade detail' },
      { status: 500 }
    )
  }
}
