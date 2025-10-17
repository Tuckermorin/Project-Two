// API Route: Backfill IPS Scores for Existing Trades
// POST /api/trades/backfill-ips - Copies IPS scores from ips_score_calculations to trades table

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Backfill IPS] Starting backfill for user ${user.id}`);

    // Fetch all active trades that are missing IPS scores but have a score calculation ID
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .or('ips_score.is.null,ips_score.eq.0')
      .not('ips_score_calculation_id', 'is', null);

    if (tradesError) {
      throw new Error(`Failed to fetch trades: ${tradesError.message}`);
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No trades need IPS score backfill',
        results: [],
        summary: {
          total: 0,
          updated: 0,
          skipped: 0,
          failed: 0
        }
      });
    }

    console.log(`[Backfill IPS] Found ${trades.length} trades needing IPS scores`);

    const results: any[] = [];
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const trade of trades) {
      try {
        // Check if trade has a linked score calculation from the agent
        if (!trade.ips_score_calculation_id) {
          console.log(`[Backfill IPS] Skipping trade ${trade.id} - no score calculation ID`);
          results.push({
            tradeId: trade.id,
            symbol: trade.symbol,
            status: 'skipped',
            reason: 'No IPS score calculation found (trade may not have been created by agent)'
          });
          skipped++;
          continue;
        }

        // Fetch the score calculation separately
        const { data: scoreCalc, error: scoreError } = await supabase
          .from('ips_score_calculations')
          .select('id, final_score, calculation_details')
          .eq('id', trade.ips_score_calculation_id)
          .single();

        if (scoreError || !scoreCalc) {
          throw new Error(`Score calculation not found: ${scoreError?.message || 'Unknown error'}`);
        }

        if (typeof scoreCalc.final_score !== 'number') {
          throw new Error('Score calculation has invalid final_score');
        }

        const ipsScore = scoreCalc.final_score;

        console.log(`[Backfill IPS] Found existing score for trade ${trade.id} (${trade.symbol}): ${ipsScore.toFixed(1)}/100`);

        // Update the trade with the calculated IPS score
        const { error: updateError } = await supabase
          .from('trades')
          .update({
            ips_score: ipsScore,
            updated_at: new Date().toISOString()
          })
          .eq('id', trade.id);

        if (updateError) {
          throw new Error(`Failed to update trade: ${updateError.message}`);
        }

        console.log(`[Backfill IPS] Updated trade ${trade.id} with IPS score ${ipsScore.toFixed(1)}`);

        results.push({
          tradeId: trade.id,
          symbol: trade.symbol,
          status: 'updated',
          ipsScore: ipsScore,
          factorCount: Object.keys(factorValues).length
        });
        updated++;

      } catch (error) {
        console.error(`[Backfill IPS] Failed to process trade ${trade.id}:`, error);
        results.push({
          tradeId: trade.id,
          symbol: trade.symbol,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failed++;
      }
    }

    const summary = {
      total: trades.length,
      updated,
      skipped,
      failed
    };

    console.log(`[Backfill IPS] Complete:`, summary);

    return NextResponse.json({
      success: true,
      message: `Backfilled IPS scores for ${updated} of ${trades.length} trades`,
      results,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Backfill IPS] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to backfill IPS scores'
      },
      { status: 500 }
    );
  }
}
