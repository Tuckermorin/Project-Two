import 'dotenv/config';
import { getSupabaseServer } from '../src/lib/utils/supabase-server';

const supabase = getSupabaseServer();

async function checkAMDDates() {
  console.log('Checking AMD snapshot dates...\n');

  // Get total AMD records
  const { count: totalCount } = await supabase
    .from('historical_options_data')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', 'AMD');

  console.log(`Total AMD records: ${totalCount?.toLocaleString()}\n`);

  // Try to get ALL dates with pagination
  let allDates: string[] = [];
  let page = 0;
  const pageSize = 10000;

  while (true) {
    const { data } = await supabase
      .from('historical_options_data')
      .select('snapshot_date')
      .eq('symbol', 'AMD')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (!data || data.length === 0) break;

    allDates = allDates.concat(data.map(d => d.snapshot_date));

    console.log(`Fetched page ${page + 1}: ${data.length} records`);

    if (data.length < pageSize) break;
    page++;
  }

  const uniqueDates = [...new Set(allDates)].sort();

  console.log(`\nTotal dates fetched: ${allDates.length.toLocaleString()}`);
  console.log(`Unique snapshot dates: ${uniqueDates.length}`);
  console.log(`\nFirst 10 dates:`, uniqueDates.slice(0, 10));
  console.log(`Last 10 dates:`, uniqueDates.slice(-10));
}

checkAMDDates().catch(console.error);
