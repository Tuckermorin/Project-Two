import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function verifyActualCoverage() {
  console.log('📊 Querying actual database coverage...\n');

  // Get total count
  const { count: totalCount } = await supabase
    .from('historical_options_data')
    .select('*', { count: 'exact', head: true });

  console.log(`Total records in historical_options_data: ${totalCount?.toLocaleString()}\n`);

  // Get per-symbol breakdown with actual date counts
  const { data: symbols } = await supabase
    .from('historical_options_data')
    .select('symbol')
    .order('symbol');

  if (!symbols) {
    console.log('No data found');
    return;
  }

  const uniqueSymbols = [...new Set(symbols.map(s => s.symbol))];

  console.log('Symbol-by-symbol breakdown:\n');
  console.log('Symbol    Total Contracts    Unique Dates    Date Range');
  console.log('─'.repeat(80));

  for (const symbol of uniqueSymbols.sort()) {
    const { count } = await supabase
      .from('historical_options_data')
      .select('*', { count: 'exact', head: true })
      .eq('symbol', symbol);

    const { data: dates } = await supabase
      .from('historical_options_data')
      .select('snapshot_date')
      .eq('symbol', symbol)
      .order('snapshot_date');

    const uniqueDates = dates ? [...new Set(dates.map(d => d.snapshot_date))].length : 0;
    const earliest = dates?.[0]?.snapshot_date || 'N/A';
    const latest = dates?.[dates.length - 1]?.snapshot_date || 'N/A';

    console.log(
      `${symbol.padEnd(10)}${String(count).padStart(15)}${String(uniqueDates).padStart(17)}    ${earliest} to ${latest}`
    );
  }

  console.log('─'.repeat(80));
  console.log(`\nTotal symbols: ${uniqueSymbols.length}`);
}

verifyActualCoverage().catch(console.error);
