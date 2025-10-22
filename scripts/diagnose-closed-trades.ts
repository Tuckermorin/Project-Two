// Script to diagnose why closed trades aren't being detected
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnose() {
  console.log('='.repeat(80));
  console.log('DIAGNOSING CLOSED TRADES DETECTION');
  console.log('='.repeat(80));
  console.log('');

  // Get current time and 2 hours ago
  const now = new Date();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  console.log(`Current time: ${now.toISOString()}`);
  console.log(`Two hours ago: ${twoHoursAgo.toISOString()}`);
  console.log('');

  // Query 1: All closed trades (no time filter)
  console.log('Query 1: All closed trades');
  const { data: allClosed, error: err1 } = await supabase
    .from('trades')
    .select('id, symbol, status, closed_at, updated_at, created_at')
    .eq('status', 'closed')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (err1) {
    console.error('Error:', err1);
  } else {
    console.log(`Found ${allClosed?.length || 0} closed trades:`);
    allClosed?.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} (${trade.id})`);
      console.log(`     closed_at: ${trade.closed_at || 'NULL'}`);
      console.log(`     updated_at: ${trade.updated_at}`);
      console.log(`     created_at: ${trade.created_at}`);

      if (trade.closed_at) {
        const closedDate = new Date(trade.closed_at);
        const hoursAgo = (now.getTime() - closedDate.getTime()) / (1000 * 60 * 60);
        console.log(`     Hours ago: ${hoursAgo.toFixed(2)}`);
      }
      console.log('');
    });
  }

  // Query 2: Closed trades from last 2 hours (OLD scheduler query - using closed_at)
  console.log('Query 2: Closed trades from last 2 hours (OLD scheduler query - using closed_at)');
  const { data: recentClosed, error: err2 } = await supabase
    .from('trades')
    .select('id, symbol, status, closed_at, realized_pl')
    .eq('status', 'closed')
    .gte('closed_at', twoHoursAgo.toISOString());

  if (err2) {
    console.error('Error:', err2);
  } else {
    console.log(`Found ${recentClosed?.length || 0} trades in last 2 hours:`);
    recentClosed?.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} - closed_at: ${trade.closed_at}, realized_pl: ${trade.realized_pl}`);
    });
  }
  console.log('');

  // Query 3: Closed trades from last 2 hours (NEW scheduler query - using updated_at)
  console.log('Query 3: Closed trades from last 2 hours (NEW scheduler query - using updated_at)');
  const { data: recentClosedNew, error: err3 } = await supabase
    .from('trades')
    .select('id, symbol, status, closed_at, updated_at, realized_pl')
    .eq('status', 'closed')
    .gte('updated_at', twoHoursAgo.toISOString());

  if (err3) {
    console.error('Error:', err3);
  } else {
    console.log(`Found ${recentClosedNew?.length || 0} trades in last 2 hours:`);
    recentClosedNew?.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} - updated_at: ${trade.updated_at}, closed_at: ${trade.closed_at}, realized_pl: ${trade.realized_pl}`);
    });
  }
  console.log('');

  // Query 4: Check for existing post-mortems
  console.log('Query 3: Checking for post-mortems on closed trades');
  if (allClosed && allClosed.length > 0) {
    const tradeIds = allClosed.map(t => t.id);
    const { data: postmortems } = await supabase
      .from('trade_postmortems')
      .select('id, trade_id')
      .in('trade_id', tradeIds);

    console.log(`Found ${postmortems?.length || 0} existing post-mortems`);
    const tradesWithoutPM = allClosed.filter(
      t => !postmortems?.some(pm => pm.trade_id === t.id)
    );
    console.log(`Trades without post-mortem: ${tradesWithoutPM.length}`);
    tradesWithoutPM.forEach(t => {
      console.log(`  - ${t.symbol} (${t.id}) closed_at: ${t.closed_at || 'NULL'}`);
    });
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('DIAGNOSIS COMPLETE');
  console.log('='.repeat(80));
}

diagnose().catch(console.error);
