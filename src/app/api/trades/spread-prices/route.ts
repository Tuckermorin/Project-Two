// src/app/api/trades/spread-prices/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateSpreadPrice, calculateSpreadPL } from '@/lib/utils/spread-pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Allow long-running requests (up to 5 minutes for updating all trades)
export const maxDuration = 300

/**
 * GET: Fetch spread prices (and optionally update them)
 * POST: Manually trigger spread price update
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const tradeId = searchParams.get('tradeId')

    if (tradeId) {
      // Get spread price for a single trade
      const { data: trade, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .eq('status', 'active')
        .single()

      if (error || !trade) {
        return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
      }

      const result = await calculateAndUpdateSpreadPrice(trade)
      return NextResponse.json(result)
    } else {
      // Get spread prices for all active trades
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('status', 'active')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const results = await Promise.all(
        (trades || []).map(trade => calculateAndUpdateSpreadPrice(trade))
      )

      const successful = results.filter(r => r.success)
      const failed = results.filter(r => !r.success)

      return NextResponse.json({
        success: true,
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        results
      })
    }
  } catch (error) {
    console.error('[Spread Prices API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST: Manual trigger for spread price updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const tradeId = body.tradeId
    const tradeIds = body.tradeIds

    if (tradeId) {
      // Update a specific trade
      const { data: trade, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .eq('status', 'active')
        .single()

      if (error || !trade) {
        return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
      }

      const result = await calculateAndUpdateSpreadPrice(trade)
      return NextResponse.json(result)
    } else if (tradeIds && Array.isArray(tradeIds) && tradeIds.length > 0) {
      // Update specific trades by IDs
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .in('id', tradeIds)
        .eq('status', 'active')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Add a small delay between each update to respect rate limits
      const results = []
      for (const trade of trades || []) {
        const result = await calculateAndUpdateSpreadPrice(trade)
        results.push(result)
        // 100ms delay = 600 calls per minute (within Alpha Vantage limit)
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const successful = results.filter(r => r.success)
      const failed = results.filter(r => !r.success)

      return NextResponse.json({
        success: true,
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        results,
        updatedAt: new Date().toISOString()
      })
    } else {
      // Update all active trades
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('status', 'active')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Add a small delay between each update to respect rate limits
      const results = []
      for (const trade of trades || []) {
        const result = await calculateAndUpdateSpreadPrice(trade)
        results.push(result)
        // 100ms delay = 600 calls per minute (within Alpha Vantage limit)
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const successful = results.filter(r => r.success)
      const failed = results.filter(r => !r.success)

      return NextResponse.json({
        success: true,
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        results,
        updatedAt: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('[Spread Prices API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function calculateAndUpdateSpreadPrice(trade: any) {
  try {
    // Only calculate for credit spreads
    if (!trade.short_strike || !trade.long_strike || !trade.expiration_date) {
      return {
        success: false,
        tradeId: trade.id,
        symbol: trade.symbol,
        error: 'Missing required spread data'
      }
    }

    // Determine contract type from strategy
    let contractType: 'put' | 'call' = 'put'
    const strategy = String(trade.strategy_type || '').toLowerCase()
    if (strategy.includes('call')) {
      contractType = 'call'
    }

    const spreadPrice = await calculateSpreadPrice(
      trade.symbol,
      Number(trade.short_strike),
      Number(trade.long_strike),
      contractType,
      trade.expiration_date
    )

    if (!spreadPrice) {
      return {
        success: false,
        tradeId: trade.id,
        symbol: trade.symbol,
        error: 'Could not calculate spread price'
      }
    }

    // Calculate P/L
    const creditReceived = Number(trade.credit_received || 0)
    const contracts = Number(trade.number_of_contracts || trade.contracts || 1)
    const { plDollar, plPercent } = calculateSpreadPL(
      creditReceived,
      spreadPrice.mid,
      contracts
    )

    // Update the trade in database
    const { error: updateError } = await supabase
      .from('trades')
      .update({
        current_spread_price: spreadPrice.mid,
        current_spread_bid: spreadPrice.bid,
        current_spread_ask: spreadPrice.ask,
        spread_price_updated_at: spreadPrice.updatedAt
      })
      .eq('id', trade.id)

    if (updateError) {
      console.error(`[Spread Prices] Failed to update ${trade.symbol}:`, updateError)
    }

    return {
      success: true,
      tradeId: trade.id,
      symbol: trade.symbol,
      spreadPrice: spreadPrice.mid,
      spreadBid: spreadPrice.bid,
      spreadAsk: spreadPrice.ask,
      currentPL: plDollar,
      currentPLPercent: plPercent,
      updatedAt: spreadPrice.updatedAt
    }
  } catch (error) {
    console.error(`[Spread Prices] Error for trade ${trade.id}:`, error)
    return {
      success: false,
      tradeId: trade.id,
      symbol: trade.symbol,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
