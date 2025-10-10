// src/app/api/debug/trigger-postmortems/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analyzeTradePostMortem } from '@/lib/agent/trade-postmortem';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tradeIds, embedToRAG = true } = body;

    // If specific trade IDs provided, process those
    if (tradeIds && Array.isArray(tradeIds)) {
      const results = [];
      for (const tradeId of tradeIds) {
        try {
          console.log(`[Debug] Generating post-mortem for trade ${tradeId}...`);
          const result = await analyzeTradePostMortem(tradeId, { embedToRAG });
          results.push({ tradeId, success: true, result });
        } catch (error: any) {
          console.error(`[Debug] Failed to generate post-mortem for ${tradeId}:`, error);
          results.push({ tradeId, success: false, error: error.message });
        }
      }

      return NextResponse.json({
        success: true,
        processed: results.length,
        results,
      });
    }

    // Otherwise, process all closed trades without post-mortems
    const { data: closedTrades, error } = await supabase
      .from('trades')
      .select('id, symbol, status, closed_at, realized_pnl')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!closedTrades || closedTrades.length === 0) {
      return NextResponse.json({ message: 'No closed trades found' });
    }

    const results = [];
    let processed = 0;
    let skipped = 0;

    for (const trade of closedTrades) {
      // Check if post-mortem already exists
      const { data: existingPM } = await supabase
        .from('trade_postmortems')
        .select('id')
        .eq('trade_id', trade.id)
        .single();

      if (existingPM) {
        console.log(`[Debug] Skipping ${trade.symbol} - post-mortem already exists`);
        skipped++;
        continue;
      }

      try {
        console.log(`[Debug] Generating post-mortem for ${trade.symbol} (${trade.id})...`);
        const result = await analyzeTradePostMortem(trade.id, { embedToRAG });
        results.push({
          tradeId: trade.id,
          symbol: trade.symbol,
          success: true,
          creditsUsed: result.credits_used
        });
        processed++;
      } catch (error: any) {
        console.error(`[Debug] Failed to generate post-mortem for ${trade.symbol}:`, error);
        results.push({
          tradeId: trade.id,
          symbol: trade.symbol,
          success: false,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total_closed: closedTrades.length,
        processed,
        skipped,
        failed: results.filter(r => !r.success).length,
      },
      results,
    });
  } catch (error: any) {
    console.error('[Debug] Error triggering post-mortems:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to check status
export async function GET() {
  try {
    const { data: closedTrades, error } = await supabase
      .from('trades')
      .select('id, symbol, status, closed_at, realized_pnl')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const withPM = [];
    const withoutPM = [];

    if (closedTrades) {
      for (const trade of closedTrades) {
        const { data: pm } = await supabase
          .from('trade_postmortems')
          .select('id, created_at')
          .eq('trade_id', trade.id)
          .single();

        if (pm) {
          withPM.push({ ...trade, postmortem_id: pm.id });
        } else {
          withoutPM.push(trade);
        }
      }
    }

    return NextResponse.json({
      summary: {
        total_closed: closedTrades?.length || 0,
        with_postmortem: withPM.length,
        without_postmortem: withoutPM.length,
      },
      trades_without_postmortem: withoutPM,
      trades_with_postmortem: withPM,
    });
  } catch (error: any) {
    console.error('[Debug] Error checking post-mortem status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
