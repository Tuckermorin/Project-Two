/**
 * Script to regenerate all embeddings with new 2000-dimension model
 *
 * Usage:
 *   npx tsx src/scripts/regenerate-embeddings.ts
 *
 * Options:
 *   --user-id=<uuid>  - Regenerate for specific user (default: from .env)
 *   --limit=<number>  - Limit number of items per type (for testing)
 *   --trades          - Regenerate trade embeddings only
 *   --snapshots       - Regenerate snapshot embeddings only
 *   --journal         - Regenerate journal embeddings only
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { embedTradeOutcome, embedClosedTradeSnapshots } from '../lib/agent/rag-embeddings';
import { generateEmbedding, getEmbeddingProvider, getEmbeddingModel } from '../lib/services/embedding-service';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  userId: process.env.NEXT_PUBLIC_DEFAULT_USER_ID,
  limit: null as number | null,
  tradesOnly: args.includes('--trades'),
  snapshotsOnly: args.includes('--snapshots'),
  journalOnly: args.includes('--journal'),
};

// Parse user-id and limit from args
args.forEach(arg => {
  if (arg.startsWith('--user-id=')) {
    options.userId = arg.split('=')[1];
  }
  if (arg.startsWith('--limit=')) {
    options.limit = parseInt(arg.split('=')[1]);
  }
});

// If no specific type selected, regenerate all
const regenerateAll = !options.tradesOnly && !options.snapshotsOnly && !options.journalOnly;

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env');
  console.error(`   SUPABASE_URL: ${supabaseUrl ? '✓' : '✗'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? '✓' : '✗'}`);
  process.exit(1);
}

if (!options.userId) {
  console.error('❌ Missing user ID. Set NEXT_PUBLIC_DEFAULT_USER_ID in .env or use --user-id=<uuid>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🚀 Starting Embedding Regeneration');
  console.log('====================================');
  console.log(`Provider: ${getEmbeddingProvider()}`);
  console.log(`Model: ${getEmbeddingModel()}`);
  console.log(`Dimensions: 2000`);
  console.log(`User ID: ${options.userId}`);
  if (options.limit) {
    console.log(`⚠️  Limit: ${options.limit} items per type (testing mode)`);
  }
  console.log('====================================\n');

  const results = {
    trades: 0,
    snapshots: 0,
    journal: 0,
    errors: [] as string[],
  };

  // 1. Regenerate Trade Embeddings
  if (regenerateAll || options.tradesOnly) {
    console.log('📊 Regenerating trade embeddings...');
    try {
      // Find closed trades that don't have embeddings yet
      const { data: tradesWithoutEmbeddings } = await supabase
        .from('trades')
        .select('id')
        .eq('user_id', options.userId)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });

      const tradeIds = tradesWithoutEmbeddings?.map(t => t.id) || [];

      // Filter out trades that already have embeddings
      const { data: existingEmbeddings } = await supabase
        .from('trade_embeddings')
        .select('trade_id')
        .in('trade_id', tradeIds);

      const existingIds = new Set(existingEmbeddings?.map(e => e.trade_id) || []);
      const missingIds = tradeIds.filter(id => !existingIds.has(id));

      console.log(`   Found ${tradeIds.length} closed trades, ${existingIds.size} with embeddings`);
      console.log(`   Need to generate embeddings for ${missingIds.length} trades`);

      // Fetch full trade data for missing trades
      const idsToFetch = options.limit ? missingIds.slice(0, options.limit) : missingIds;

      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .in('id', idsToFetch);

      if (tradesError) {
        throw new Error(`Failed to fetch trades: ${tradesError.message}`);
      }

      if (trades && trades.length > 0) {
        console.log(`   Found ${trades.length} closed trades`);

        for (let i = 0; i < trades.length; i++) {
          const trade = trades[i];
          try {
            // Delete existing embedding if any
            await supabase.from('trade_embeddings').delete().eq('trade_id', trade.id);

            // Create new embedding
            await embedTradeOutcome(trade);
            results.trades++;

            // Progress indicator
            if ((i + 1) % 10 === 0 || i === trades.length - 1) {
              console.log(`   Progress: ${i + 1}/${trades.length} trades`);
            }

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error: any) {
            const errMsg = `Trade ${trade.id}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            results.errors.push(errMsg);
          }
        }

        console.log(`   ✅ Regenerated ${results.trades} trade embeddings\n`);
      } else {
        console.log('   No closed trades found\n');
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}\n`);
      results.errors.push(`Trades: ${error.message}`);
    }
  }

  // 2. Regenerate Snapshot Embeddings
  if (regenerateAll || options.snapshotsOnly) {
    console.log('📸 Regenerating snapshot embeddings...');
    try {
      // Delete existing snapshot embeddings first
      const { error: deleteError } = await supabase
        .from('trade_snapshot_embeddings')
        .delete()
        .eq('user_id', options.userId!);

      if (deleteError) {
        throw new Error(`Failed to delete old snapshots: ${deleteError.message}`);
      }

      const count = await embedClosedTradeSnapshots(options.userId!);
      results.snapshots = count;
      console.log(`   ✅ Regenerated ${results.snapshots} snapshot embeddings\n`);
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}\n`);
      results.errors.push(`Snapshots: ${error.message}`);
    }
  }

  // 3. Regenerate Journal Embeddings
  if (regenerateAll || options.journalOnly) {
    console.log('📝 Regenerating journal embeddings...');
    try {
      let query = supabase
        .from('journal_entries')
        .select('id, title, content')
        .eq('user_id', options.userId)
        .order('created_at', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data: entries, error: journalError } = await query;

      if (journalError) {
        throw new Error(`Failed to fetch journal entries: ${journalError.message}`);
      }

      if (entries && entries.length > 0) {
        console.log(`   Found ${entries.length} journal entries`);

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          try {
            const textToEmbed = `${entry.title}\n\n${entry.content}`;
            const embedding = await generateEmbedding(textToEmbed);

            await supabase
              .from('journal_entries')
              .update({ content_embedding: embedding })
              .eq('id', entry.id);

            results.journal++;

            // Progress indicator
            if ((i + 1) % 10 === 0 || i === entries.length - 1) {
              console.log(`   Progress: ${i + 1}/${entries.length} entries`);
            }

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error: any) {
            const errMsg = `Journal ${entry.id}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            results.errors.push(errMsg);
          }
        }

        console.log(`   ✅ Regenerated ${results.journal} journal embeddings\n`);
      } else {
        console.log('   No journal entries found\n');
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}\n`);
      results.errors.push(`Journal: ${error.message}`);
    }
  }

  // Summary
  console.log('====================================');
  console.log('✨ Regeneration Complete!');
  console.log('====================================');
  console.log(`✅ Trades: ${results.trades}`);
  console.log(`✅ Snapshots: ${results.snapshots}`);
  console.log(`✅ Journal: ${results.journal}`);
  console.log(`❌ Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(err => console.log(`  - ${err}`));
  }

  console.log('\n🎉 Done!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
