#!/usr/bin/env tsx
/**
 * Seed RAG embeddings for closed trades
 * Run: npx tsx scripts/seed-rag-embeddings.ts
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { seedTradeEmbeddings } from '../src/lib/agent/rag-embeddings';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🚀 Starting RAG embedding seed...\n');

  // Get all users with closed trades
  const { data: users, error: usersError } = await supabase
    .from('trades')
    .select('user_id')
    .eq('status', 'closed')
    .not('realized_pnl', 'is', null);

  if (usersError) {
    console.error('❌ Failed to fetch users:', usersError.message);
    process.exit(1);
  }

  const uniqueUserIds = [...new Set(users?.map((u: any) => u.user_id) || [])];

  if (uniqueUserIds.length === 0) {
    console.log('ℹ️  No users with closed trades found');
    process.exit(0);
  }

  console.log(`📊 Found ${uniqueUserIds.length} user(s) with closed trades\n`);

  let totalEmbedded = 0;

  for (const userId of uniqueUserIds) {
    try {
      console.log(`\n👤 Processing user: ${userId}`);
      const embeddedCount = await seedTradeEmbeddings(userId as string);
      totalEmbedded += embeddedCount;
      console.log(`✅ Embedded ${embeddedCount} trades for user ${userId}`);
    } catch (err: any) {
      console.error(`❌ Failed for user ${userId}:`, err.message);
    }
  }

  console.log(`\n✨ Complete! Embedded ${totalEmbedded} total trades`);

  // Show summary
  const { data: stats } = await supabase
    .from('trade_embeddings')
    .select('id', { count: 'exact' });

  console.log(`\n📈 Total embeddings in database: ${stats?.length || 0}`);
}

main().catch(console.error);
