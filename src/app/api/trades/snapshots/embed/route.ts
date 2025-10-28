import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { embedTradeSnapshot } from '@/lib/agent/rag-embeddings';

/**
 * POST /api/trades/snapshots/embed
 * Embeds snapshots for closed trades to enable temporal pattern learning
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tradeIds } = body;

    if (!tradeIds || !Array.isArray(tradeIds) || tradeIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid tradeIds array' },
        { status: 400 }
      );
    }

    console.log(`[Snapshot Embeddings] Processing ${tradeIds.length} closed trades`);

    // Get all snapshots for the closed trades
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('trade_snapshots')
      .select(`
        *,
        trades!inner(
          id,
          user_id,
          symbol,
          strategy_type,
          status,
          realized_pnl,
          realized_pl_percent
        )
      `)
      .in('trade_id', tradeIds)
      .eq('trades.user_id', user.id)
      .eq('trades.status', 'closed');

    if (snapshotsError) {
      console.error('[Snapshot Embeddings] Error fetching snapshots:', snapshotsError);
      return NextResponse.json(
        { error: 'Failed to fetch snapshots' },
        { status: 500 }
      );
    }

    if (!snapshots || snapshots.length === 0) {
      console.log('[Snapshot Embeddings] No snapshots found for these trades');
      return NextResponse.json({
        success: true,
        embedded: 0,
        message: 'No snapshots found'
      });
    }

    console.log(`[Snapshot Embeddings] Found ${snapshots.length} snapshots to process`);

    const results: any[] = [];
    let embedded = 0;
    let skipped = 0;
    let errors = 0;

    for (const snapshot of snapshots) {
      try {
        // Check if already embedded
        const { data: existing } = await supabase
          .from('trade_snapshot_embeddings')
          .select('id')
          .eq('snapshot_id', snapshot.id)
          .maybeSingle();

        if (existing) {
          console.log(`[Snapshot Embeddings] Skipping ${snapshot.id} - already embedded`);
          skipped++;
          results.push({
            snapshotId: snapshot.id,
            success: true,
            message: 'Already embedded',
            embeddingId: existing.id
          });
          continue;
        }

        // Extract trade data from joined relationship
        const trade = Array.isArray(snapshot.trades) ? snapshot.trades[0] : snapshot.trades;

        if (!trade || !trade.user_id) {
          console.error(`[Snapshot Embeddings] Snapshot ${snapshot.id} missing trade data or user_id`);
          errors++;
          results.push({
            snapshotId: snapshot.id,
            success: false,
            error: 'Missing trade data'
          });
          continue;
        }

        // Embed the snapshot with outcome included (since trade is closed)
        await embedTradeSnapshot(snapshot, trade, { includeOutcome: true });
        embedded++;
        results.push({
          snapshotId: snapshot.id,
          success: true,
          message: 'Embedded successfully'
        });

        console.log(`[Snapshot Embeddings] ✓ Embedded snapshot ${snapshot.id}`);
      } catch (error: any) {
        console.error(`[Snapshot Embeddings] Error processing snapshot ${snapshot.id}:`, error);
        errors++;
        results.push({
          snapshotId: snapshot.id,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`[Snapshot Embeddings] Complete: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);

    return NextResponse.json({
      success: true,
      embedded,
      skipped,
      errors,
      total: snapshots.length,
      results
    });
  } catch (err: any) {
    console.error('[Snapshot Embeddings] Error:', err);
    return NextResponse.json(
      { error: 'Failed to embed snapshots', details: err.message },
      { status: 500 }
    );
  }
}
