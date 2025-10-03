import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function findIDs() {
  const { data, error } = await supabase
    .from('factor_definitions')
    .select('id, name')
    .is('description', null)
    .eq('is_active', true);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Factors missing descriptions with their IDs:');
  console.log('='.repeat(80));
  data?.forEach(f => {
    console.log(`  { id: '${f.id}', description: '' },`);
  });
}

findIDs();
