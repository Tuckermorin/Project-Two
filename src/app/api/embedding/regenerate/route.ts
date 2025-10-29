// API endpoint to regenerate all embeddings with new 2000-dimension model
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import {
  embedTradeOutcome,
  embedClosedTradeSnapshots,
} from '@/lib/agent/rag-embeddings';
import { getEmbeddingProvider, getEmbeddingModel } from '@/lib/services/embedding-service';

export const maxDuration = 300; // 5 minutes max execution

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Get request options
    const body = await request.json();
    const {
      regenerate_trades = false,
      regenerate_snapshots = false,
      regenerate_rationales = false,
      regenerate_postmortems = false,
      regenerate_journal = false,
      limit = null, // Optional limit for testing
    } = body;

    console.log('[Embedding Regeneration] Starting regeneration...');
    console.log(`[Embedding Regeneration] Provider: ${getEmbeddingProvider()}`);
    console.log(`[Embedding Regeneration] Model: ${getEmbeddingModel()}`);
    console.log(`[Embedding Regeneration] User: ${userId}`);

    const results: any = {
      provider: getEmbeddingProvider(),
      model: getEmbeddingModel(),
      dimensions: 2000,
      trades: { requested: regenerate_trades, count: 0 },
      snapshots: { requested: regenerate_snapshots, count: 0 },
      rationales: { requested: regenerate_rationales, count: 0 },
      postmortems: { requested: regenerate_postmortems, count: 0 },
      journal: { requested: regenerate_journal, count: 0 },
    };

    // 1. Regenerate Trade Embeddings
    if (regenerate_trades) {
      console.log('[Embedding Regeneration] Regenerating trade embeddings...');

      // Get closed trades without embeddings
      let query = supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'closed')
        .not('realized_pnl', 'is', null);

      if (limit) {
        query = query.limit(limit);
      }

      const { data: trades, error: tradesError } = await query;

      if (tradesError) {
        throw new Error(`Failed to fetch trades: ${tradesError.message}`);
      }

      if (trades && trades.length > 0) {
        for (const trade of trades) {
          try {
            // Delete existing embedding if any
            await supabase.from('trade_embeddings').delete().eq('trade_id', trade.id);

            // Create new embedding
            await embedTradeOutcome(trade);
            results.trades.count++;

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error: any) {
            console.error(`[Embedding Regeneration] Failed for trade ${trade.id}:`, error.message);
          }
        }
      }
    }

    // 2. Regenerate Snapshot Embeddings
    if (regenerate_snapshots) {
      console.log('[Embedding Regeneration] Regenerating snapshot embeddings...');

      const count = await embedClosedTradeSnapshots(userId);
      results.snapshots.count = count;
    }

    // 3. Regenerate Rationale Embeddings
    if (regenerate_rationales) {
      console.log('[Embedding Regeneration] Regenerating rationale embeddings...');

      // This would require regenerating all AI evaluations
      // For now, we'll just clear them and they'll be regenerated on next evaluation
      const { error: deleteError } = await supabase
        .from('trade_rationale_embeddings')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('[Embedding Regeneration] Error deleting rationales:', deleteError);
      } else {
        results.rationales.count = 0; // Cleared, will be regenerated on demand
      }
    }

    // 4. Regenerate Postmortem Embeddings
    if (regenerate_postmortems) {
      console.log('[Embedding Regeneration] Regenerating postmortem embeddings...');

      const { error: deleteError } = await supabase
        .from('trade_postmortem_analysis')
        .update({ postmortem_embedding: null })
        .eq('user_id', userId);

      if (deleteError) {
        console.error('[Embedding Regeneration] Error clearing postmortems:', deleteError);
      } else {
        results.postmortems.count = 0; // Cleared, will be regenerated on demand
      }
    }

    // 5. Regenerate Journal Embeddings
    if (regenerate_journal) {
      console.log('[Embedding Regeneration] Regenerating journal embeddings...');

      let query = supabase
        .from('journal_entries')
        .select('id, title, content')
        .eq('user_id', userId);

      if (limit) {
        query = query.limit(limit);
      }

      const { data: entries, error: journalError } = await query;

      if (journalError) {
        throw new Error(`Failed to fetch journal entries: ${journalError.message}`);
      }

      if (entries && entries.length > 0) {
        for (const entry of entries) {
          try {
            const { generateEmbedding } = await import('@/lib/services/embedding-service');
            const textToEmbed = `${entry.title}\n\n${entry.content}`;
            const embedding = await generateEmbedding(textToEmbed);

            await supabase
              .from('journal_entries')
              .update({ content_embedding: embedding })
              .eq('id', entry.id);

            results.journal.count++;

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error: any) {
            console.error(
              `[Embedding Regeneration] Failed for journal ${entry.id}:`,
              error.message
            );
          }
        }
      }
    }

    console.log('[Embedding Regeneration] Complete!', results);

    return NextResponse.json({
      success: true,
      message: 'Embeddings regenerated successfully',
      results,
    });
  } catch (error: any) {
    console.error('[Embedding Regeneration] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
