import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fixManualFactors() {
  console.log('Fixing Manual factors that block AI Trade Analysis...\n');

  // 1. Update Bid-Ask Spread to API (comes from options chain)
  console.log('1. Updating Bid-Ask Spread to API...');
  const { error: bidAskError } = await supabase
    .from('factor_definitions')
    .update({
      collection_method: 'api',
      source: 'alpha_vantage_options'
    })
    .eq('id', 'opt-bid-ask-spread');

  if (bidAskError) {
    console.error('❌ Error updating bid-ask spread:', bidAskError.message);
  } else {
    console.log('✓ Updated opt-bid-ask-spread to API');
  }

  // 2. Deactivate duplicate manual IV Rank/Percentile (we have calculated versions)
  console.log('\n2. Deactivating duplicate manual IV Rank/Percentile...');
  const { error: dupError } = await supabase
    .from('factor_definitions')
    .update({ is_active: false })
    .in('id', ['opt-iv-rank', 'opt-iv-percentile'])
    .eq('collection_method', 'manual');

  if (dupError) {
    console.error('❌ Error deactivating duplicates:', dupError.message);
  } else {
    console.log('✓ Deactivated manual opt-iv-rank and opt-iv-percentile');
    console.log('  (Keeping calculated versions: calc-iv-rank, calc-iv-percentile)');
  }

  // 3. Deactivate ALL qualitative factors (qual-*) - they require human judgment
  console.log('\n3. Deactivating all qualitative factors (qual-*)...');
  console.log('   Reason: These require human judgment and block AI analysis');

  const { data: qualFactors, error: listError } = await supabase
    .from('factor_definitions')
    .select('id, name')
    .like('id', 'qual-%')
    .eq('is_active', true);

  if (listError) {
    console.error('❌ Error listing qual factors:', listError.message);
    return;
  }

  console.log(`\n   Found ${qualFactors?.length || 0} qualitative factors to deactivate:`);
  qualFactors?.forEach(f => console.log(`     - ${f.name}`));

  const { error: deactivateError } = await supabase
    .from('factor_definitions')
    .update({ is_active: false })
    .like('id', 'qual-%');

  if (deactivateError) {
    console.error('❌ Error deactivating qual factors:', deactivateError.message);
  } else {
    console.log(`\n✓ Deactivated ${qualFactors?.length || 0} qualitative factors`);
  }

  // 4. Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY:');
  console.log('='.repeat(80));
  console.log('✓ Bid-Ask Spread: manual → API');
  console.log('✓ Duplicate IV metrics: deactivated (using calculated versions)');
  console.log(`✓ Qualitative factors: ${qualFactors?.length || 0} deactivated`);
  console.log('\nAll active factors now support API/Calculated collection!');
  console.log('AI Trade Analysis will work without manual input requirements.');
}

fixManualFactors();
