import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getIDs() {
  const { data, error } = await supabase
    .from('factor_definitions')
    .select('id, name, category, collection_method')
    .or('category.eq.Options Greeks,category.eq.Options Metrics');

  if (error) {
    console.error(error);
    return;
  }

  console.log('Options Greeks & Metrics IDs:');
  data?.forEach(f => {
    console.log(`${f.id.padEnd(25)} => ${f.name.padEnd(30)} | ${f.collection_method}`);
  });
}

getIDs();
