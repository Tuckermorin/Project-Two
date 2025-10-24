import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkManualFactors() {
  const { data, error } = await supabase
    .from('factor_definitions')
    .select('id, name, category, collection_method, source, is_active')
    .eq('collection_method', 'manual')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  console.log('\n=== MANUAL FACTORS (Blocking AI Trade Analysis) ===\n');
  console.log(`Total: ${data?.length || 0} factors\n`);

  // Group by category
  const byCategory = data?.reduce((acc: any, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});

  Object.entries(byCategory || {}).forEach(([category, factors]: [string, any]) => {
    console.log(`\n${category}:`);
    console.log('-'.repeat(80));
    factors.forEach((f: any) => {
      console.log(`  ${f.name.padEnd(45)} | ${f.id}`);
    });
  });

  console.log('\n\nRECOMMENDATION:');
  console.log('These factors should either:');
  console.log('1. Be updated to API if available from Alpha Vantage/Tavily');
  console.log('2. Be marked as is_active = false to not block AI analysis');
}

checkManualFactors();
