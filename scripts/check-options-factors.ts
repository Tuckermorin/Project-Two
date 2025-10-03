import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkFactors() {
  const { data, error } = await supabase
    .from('factor_definitions')
    .select('id, name, category, collection_method, source, is_active')
    .in('category', ['Options Greeks', 'Options Metrics'])
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('\nOptions Greeks & Metrics Factors:');
    console.log('='.repeat(100));
    console.log('NAME'.padEnd(45) + 'COLLECTION'.padEnd(15) + 'SOURCE'.padEnd(25) + 'ACTIVE');
    console.log('-'.repeat(100));
    data?.forEach(f => {
      console.log(
        f.name.padEnd(45) +
        (f.collection_method || 'null').padEnd(15) +
        (f.source || 'null').padEnd(25) +
        f.is_active
      );
    });
    console.log('='.repeat(100));
    console.log(`\nTotal: ${data?.length} factors`);

    // Count by collection method
    const bycollection = data?.reduce((acc: any, f) => {
      const method = f.collection_method || 'null';
      acc[method] = (acc[method] || 0) + 1;
      return acc;
    }, {});
    console.log('\nBy Collection Method:');
    Object.entries(bycollection || {}).forEach(([method, count]) => {
      console.log(`  ${method}: ${count}`);
    });
  }
}

checkFactors();
