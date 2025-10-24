import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Create a FRESH client instance (not the cached singleton)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function freshQuery() {
  console.log('Creating fresh Supabase connection...\n');

  // Query with explicit ordering and limiting
  const { data, error } = await supabase
    .from('historical_options_data')
    .select('symbol, snapshot_date, contract_id, strike')
    .eq('symbol', 'AMD')
    .order('snapshot_date', { ascending: true })
    .order('contract_id', { ascending: true })
    .limit(20);

  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log('First 20 AMD records (ordered by snapshot_date):');
  console.table(data);

  // Get distinct dates count with raw SQL-like approach
  const { data: allDates } = await supabase
    .from('historical_options_data')
    .select('snapshot_date')
    .eq('symbol', 'AMD')
    .limit(100000); // Get a LOT of records

  if (allDates) {
    const uniqueDates = [...new Set(allDates.map(d => d.snapshot_date))].sort();
    console.log(`\nTotal records fetched: ${allDates.length.toLocaleString()}`);
    console.log(`Unique dates: ${uniqueDates.length}`);
    console.log(`\nFirst 10 dates:`, uniqueDates.slice(0, 10));
    console.log(`Last 10 dates:`, uniqueDates.slice(-10));
  }
}

freshQuery().catch(console.error).finally(() => process.exit(0));
