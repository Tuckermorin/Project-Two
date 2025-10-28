import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { getEnhancedRationaleGenerator } from '@/lib/services/enhanced-rationale-generator';

/**
 * POST /api/trades/rationale
 * Handles saving rationale embeddings when trade is activated
 * and recording outcomes when trade is closed
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
    const { action, tradeId, tradeIds } = body;

    // OPTIMIZATION: Support both single trade and batch operations
    const idsToProcess = tradeIds || (tradeId ? [tradeId] : []);

    if (!action || idsToProcess.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: action, and either tradeId or tradeIds' },
        { status: 400 }
      );
    }

    // Get all trades with their AI evaluation data in a single query
    const { data: trades, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .in('id', idsToProcess)
      .eq('user_id', user.id);

    if (tradeError || !trades || trades.length === 0) {
      return NextResponse.json({ error: 'Trades not found' }, { status: 404 });
    }

    const rationaleGenerator = getEnhancedRationaleGenerator();
    const results: any[] = [];

    // Handle different actions
    switch (action) {
      case 'save_embedding':
        // OPTIMIZATION: Process all trades in batch
        for (const trade of trades) {
          try {
            // Save rationale embedding when trade is activated
            if (!trade.ai_evaluation_id || !trade.structured_rationale) {
              console.log(`[Rationale API] Trade ${trade.id} has no AI evaluation to embed`);
              results.push({ tradeId: trade.id, success: true, message: 'No AI evaluation to embed' });
              continue;
            }

            // Check if embedding already exists
            const { data: existingEmbedding } = await supabase
              .from('trade_rationale_embeddings')
              .select('id')
              .eq('trade_evaluation_id', trade.ai_evaluation_id)
              .maybeSingle();

            if (existingEmbedding) {
              console.log(`[Rationale API] Embedding already exists for evaluation ${trade.ai_evaluation_id}`);
              results.push({
                tradeId: trade.id,
                success: true,
                message: 'Embedding already exists',
                embedding_id: existingEmbedding.id
              });
              continue;
            }

            // Create the embedding
            console.log(`[Rationale API] Creating rationale embedding for trade ${trade.id}`);

            // Build minimal context for embedding
            const context = {
              candidate: {
                symbol: trade.symbol,
                strategy_type: trade.strategy_type,
                dte: calculateDTE(trade.expiration_date),
                delta: trade.delta_short_leg,
                iv_rank: trade.iv_at_entry
              }
            };

            const embeddingId = await rationaleGenerator.createRationaleEmbedding(
              trade.structured_rationale,
              context,
              trade.ai_evaluation_id,
              user.id
            );

            console.log(`[Rationale API] Created embedding ${embeddingId} for trade ${trade.id}`);
            results.push({ tradeId: trade.id, success: true, embedding_id: embeddingId });
          } catch (error: any) {
            console.error(`[Rationale API] Error processing trade ${trade.id}:`, error);
            results.push({ tradeId: trade.id, success: false, error: error.message });
          }
        }

        return NextResponse.json({
          success: true,
          processed: results.length,
          results
        });

      case 'record_outcome':
        // OPTIMIZATION: Process all trades in batch
        for (const trade of trades) {
          try {
            // Record outcome when trade is closed
            if (!trade.ai_evaluation_id) {
              console.log(`[Rationale API] Trade ${trade.id} has no AI evaluation to record outcome for`);
              results.push({ tradeId: trade.id, success: true, message: 'No AI evaluation to record outcome for' });
              continue;
            }

            if (trade.status !== 'closed') {
              results.push({
                tradeId: trade.id,
                success: false,
                error: 'Trade must be closed to record outcome'
              });
              continue;
            }

            // Calculate outcome
            const realized_pl_percent = trade.realized_pl_percent || 0;
            const actual_outcome: 'win' | 'loss' | 'break_even' =
              realized_pl_percent > 0.5 ? 'win' :
              realized_pl_percent < -0.5 ? 'loss' :
              'break_even';

            const days_held = trade.closed_at && trade.entry_date
              ? Math.floor(
                  (new Date(trade.closed_at).getTime() - new Date(trade.entry_date).getTime()) /
                  (1000 * 60 * 60 * 24)
                )
              : 0;

            const exit_reason = trade.exit_notes || 'Normal exit';

            console.log(`[Rationale API] Recording outcome for trade ${trade.id}: ${actual_outcome} (${realized_pl_percent.toFixed(2)}%)`);

            await rationaleGenerator.recordTradeOutcome(trade.ai_evaluation_id, {
              actual_outcome,
              actual_roi: realized_pl_percent,
              days_held,
              exit_reason
            });

            results.push({
              tradeId: trade.id,
              success: true,
              outcome: {
                actual_outcome,
                actual_roi: realized_pl_percent,
                days_held,
                exit_reason
              }
            });
          } catch (error: any) {
            console.error(`[Rationale API] Error processing trade ${trade.id}:`, error);
            results.push({ tradeId: trade.id, success: false, error: error.message });
          }
        }

        return NextResponse.json({
          success: true,
          processed: results.length,
          results
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[Rationale API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process rationale request',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate days to expiration from expiration date string
 */
function calculateDTE(expirationDate: string | null): number {
  if (!expirationDate) return 0;

  const expiry = new Date(expirationDate);
  const now = new Date();
  const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return Math.max(0, dte);
}
