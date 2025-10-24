// Debug script to check trade statuses and figure out why monitoring found no trades
// Usage: npx tsx scripts/debug-trades-status.ts

import dotenv from 'dotenv';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

dotenv.config();

async function debugTradeStatus() {
  console.log('='.repeat(80));
  console.log('DEBUGGING TRADE STATUS');
  console.log('='.repeat(80));
  console.log('');

  const supabase = getSupabaseServer();
  const userId = process.env.NEXT_PUBLIC_DEFAULT_USER_ID;

  console.log(`Checking trades for user: ${userId}`);
  console.log('');

  // Get ALL trades (not filtered by status)
  const { data: allTrades, error: allError } = await supabase
    .from('trades')
    .select('id, symbol, status, entry_date, expiration_date, user_id')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false });

  if (allError) {
    console.error('Error fetching trades:', allError);
    return;
  }

  if (!allTrades || allTrades.length === 0) {
    console.log('❌ NO TRADES FOUND FOR THIS USER');
    console.log('');
    console.log('Possible issues:');
    console.log('  1. Wrong user ID in NEXT_PUBLIC_DEFAULT_USER_ID');
    console.log('  2. Trades belong to a different user');
    console.log('  3. Database connection issue');
    console.log('');

    // Check if there are ANY trades in the system
    const { count: totalTrades } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true });

    console.log(`Total trades in system (all users): ${totalTrades || 0}`);
    console.log('');

    // Get unique user IDs
    const { data: uniqueUsers } = await supabase
      .from('trades')
      .select('user_id')
      .limit(10);

    if (uniqueUsers && uniqueUsers.length > 0) {
      console.log('User IDs found in trades table:');
      const userIds = [...new Set(uniqueUsers.map(u => u.user_id))];
      userIds.forEach(id => console.log(`  - ${id}`));
    }

    return;
  }

  console.log(`✅ FOUND ${allTrades.length} TOTAL TRADES FOR THIS USER`);
  console.log('');

  // Group by status
  const byStatus = allTrades.reduce((acc: any, trade) => {
    const status = trade.status || 'unknown';
    if (!acc[status]) acc[status] = [];
    acc[status].push(trade);
    return acc;
  }, {});

  console.log('TRADES BY STATUS:');
  Object.keys(byStatus).forEach(status => {
    console.log(`  ${status}: ${byStatus[status].length}`);
  });
  console.log('');

  // Show active trades details
  if (byStatus['active']) {
    console.log('='.repeat(80));
    console.log('ACTIVE TRADES DETAILS:');
    console.log('');

    for (const trade of byStatus['active']) {
      const expirationDate = new Date(trade.expiration_date);
      const daysToExpiration = Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const isExpired = daysToExpiration < 0;

      console.log(`📊 ${trade.symbol}`);
      console.log(`   Trade ID: ${trade.id}`);
      console.log(`   Status: ${trade.status}`);
      console.log(`   Entry: ${trade.entry_date}`);
      console.log(`   Expiration: ${trade.expiration_date}`);
      console.log(`   DTE: ${daysToExpiration} days ${isExpired ? '⚠️ EXPIRED!' : ''}`);
      console.log('');
    }
  } else {
    console.log('❌ NO ACTIVE TRADES FOUND');
    console.log('');

    // Check snapshots table to see which trades have recent snapshots
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: recentSnapshots } = await supabase
      .from('trade_snapshots')
      .select('trade_id, trades!inner(symbol, status)')
      .gte('snapshot_time', today.toISOString())
      .limit(50);

    if (recentSnapshots && recentSnapshots.length > 0) {
      console.log('⚠️  PROBLEM DETECTED:');
      console.log(`   Found ${recentSnapshots.length} snapshots from today,`);
      console.log('   but trades are NOT marked as "active" in the database!');
      console.log('');
      console.log('Trades with snapshots today but not marked active:');

      const snapshotTrades = recentSnapshots.map(s => ({
        trade_id: s.trade_id,
        symbol: (s.trades as any).symbol,
        status: (s.trades as any).status
      }));

      const uniqueSnapshotTrades = snapshotTrades.reduce((acc: any[], t) => {
        if (!acc.find(x => x.trade_id === t.trade_id)) {
          acc.push(t);
        }
        return acc;
      }, []);

      uniqueSnapshotTrades.forEach(t => {
        console.log(`  ${t.symbol}: status="${t.status}" (should be "active")`);
      });

      console.log('');
      console.log('SUGGESTED FIX:');
      console.log('Update these trades to status="active":');
      console.log('');
      uniqueSnapshotTrades.forEach(t => {
        console.log(`UPDATE trades SET status = 'active' WHERE id = '${t.trade_id}';`);
      });
    }
  }

  console.log('');
  console.log('='.repeat(80));

  // Check if any closed trades
  if (byStatus['closed']) {
    console.log('');
    console.log(`CLOSED TRADES: ${byStatus['closed'].length}`);
    console.log('Recent closures:');
    const recentClosed = byStatus['closed'].slice(0, 5);
    recentClosed.forEach(trade => {
      console.log(`  ${trade.symbol} - Expired: ${trade.expiration_date}`);
    });
  }

  console.log('');
}

debugTradeStatus()
  .then(() => {
    console.log('Debug complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
