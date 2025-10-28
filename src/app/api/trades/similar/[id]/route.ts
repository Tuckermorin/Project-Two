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
    const limit = 10 // Number of similar trades to return

    // Get the source trade
    const { data: sourceTrade, error: sourceError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()

    if (sourceError || !sourceTrade) {
      return NextResponse.json(
        { error: 'Trade not found' },
        { status: 404 }
      )
    }

    // Try to find similar trades using trade_rationale_embeddings
    const { data: sourceEmbedding } = await supabase
      .from('trade_rationale_embeddings')
      .select('rationale_embedding')
      .eq('trade_id', tradeId)
      .single()

    let similarTrades: any[] = []

    if (sourceEmbedding?.rationale_embedding) {
      // Use vector similarity search if embeddings exist
      const { data: similarEmbeddings, error: embeddingError } = await supabase.rpc(
        'match_trade_rationales',
        {
          query_embedding: sourceEmbedding.rationale_embedding,
          match_threshold: 0.5,
          match_count: limit + 1, // +1 to exclude self
        }
      )

      if (!embeddingError && similarEmbeddings) {
        // Get trade details for similar embeddings
        const tradeIds = similarEmbeddings
          .filter((e: any) => e.trade_id !== tradeId) // Exclude self
          .map((e: any) => e.trade_id)
          .slice(0, limit)

        if (tradeIds.length > 0) {
          const { data: trades } = await supabase
            .from('trades')
            .select('id, symbol, strategy_type, entry_date, realized_pnl, realized_pl_percent, delta_short_leg, iv_at_entry, ips_score')
            .in('id', tradeIds)
            .eq('status', 'closed')

          if (trades) {
            // Add similarity scores
            similarTrades = trades.map((trade: any) => {
              const embedding = similarEmbeddings.find((e: any) => e.trade_id === trade.id)
              return {
                ...trade,
                similarity_score: embedding?.similarity || 0,
                realized_pl: trade.realized_pnl || 0,
              }
            })
          }
        }
      }
    }

    // Fallback to manual similarity if no embeddings or few results
    if (similarTrades.length < 3) {
      const { data: manualSimilar } = await supabase
        .from('trades')
        .select('id, symbol, strategy_type, entry_date, realized_pnl, realized_pl_percent, delta_short_leg, iv_at_entry, ips_score')
        .eq('status', 'closed')
        .neq('id', tradeId)
        .limit(limit * 2) // Get more to filter

      if (manualSimilar) {
        // Calculate manual similarity based on strategy, delta, IV
        const scoredTrades = manualSimilar
          .map((trade: any) => {
            let score = 0

            // Strategy match (40%)
            if (trade.strategy_type === sourceTrade.strategy_type) score += 0.4

            // Delta similarity (30%)
            const sourceDelta = Math.abs(sourceTrade.delta_short_leg || 0)
            const tradeDelta = Math.abs(trade.delta_short_leg || 0)
            const deltaDistance = Math.abs(sourceDelta - tradeDelta)
            if (deltaDistance < 0.02) score += 0.3
            else if (deltaDistance < 0.05) score += 0.2
            else if (deltaDistance < 0.1) score += 0.1

            // IV similarity (20%)
            const sourceIV = sourceTrade.iv_at_entry || 0
            const tradeIV = trade.iv_at_entry || 0
            const ivDistance = Math.abs(sourceIV - tradeIV)
            if (ivDistance < 10) score += 0.2
            else if (ivDistance < 20) score += 0.1

            // Symbol match (10%)
            if (trade.symbol === sourceTrade.symbol) score += 0.1

            return {
              ...trade,
              similarity_score: score,
              realized_pl: trade.realized_pnl || 0,
            }
          })
          .filter((t: any) => t.similarity_score >= 0.3)
          .sort((a: any, b: any) => b.similarity_score - a.similarity_score)
          .slice(0, limit)

        // Merge with embedding-based results if any
        const existingIds = new Set(similarTrades.map(t => t.id))
        const newTrades = scoredTrades.filter((t: any) => !existingIds.has(t.id))
        similarTrades = [...similarTrades, ...newTrades].slice(0, limit)
      }
    }

    return NextResponse.json({
      success: true,
      data: similarTrades,
    })
  } catch (error: any) {
    console.error('Error finding similar trades:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to find similar trades' },
      { status: 500 }
    )
  }
}
