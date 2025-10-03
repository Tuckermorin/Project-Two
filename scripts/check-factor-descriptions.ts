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
    .select('id, name, category, collection_method, source, description, is_active')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Check specific categories from the image
  const categories = [
    'Options Greeks',
    'Options Metrics',
    'Management & Governance',
    'Efficiency',
    'Financial Health',
    'Liquidity',
    'Interest Rates'
  ];

  categories.forEach(cat => {
    console.log(`\n${cat}:`);
    console.log('='.repeat(100));
    const factors = data?.filter(f => f.category === cat) || [];

    if (factors.length === 0) {
      console.log('  No factors found');
      return;
    }

    factors.forEach(f => {
      const hasDesc = f.description ? '✓' : '✗';
      const method = f.collection_method || 'null';
      console.log(`${hasDesc} ${f.name.padEnd(40)} | ${method.padEnd(12)} | ${f.description ? f.description.substring(0, 50) : 'NO DESCRIPTION'}`);
    });
  });

  // Find all factors missing descriptions
  console.log('\n\n=== FACTORS MISSING DESCRIPTIONS ===');
  const missingDesc = data?.filter(f => !f.description) || [];
  console.log(`Total: ${missingDesc.length}`);
  missingDesc.forEach(f => {
    console.log(`  - ${f.name} (${f.category})`);
  });
}

checkFactors();
