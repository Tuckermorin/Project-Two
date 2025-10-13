import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Update existing Options Greeks and Metrics to API collection
const optionsFactorsToUpdate = [
  { id: 'delta', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'gamma', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'theta', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'vega', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'rho', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'implied-volatility', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'open-interest', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'option-volume', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'intrinsic-value', source: 'alpha_vantage_options', collection_method: 'api' },
  { id: 'time-value', source: 'alpha_vantage_options', collection_method: 'api' },
];

async function updateOptionsFactors() {
  console.log('Updating Options Greeks and Metrics to API collection...\n');

  for (const factor of optionsFactorsToUpdate) {
    const { data, error } = await supabase
      .from('factor_definitions')
      .update({
        source: factor.source,
        collection_method: factor.collection_method
      })
      .eq('id', factor.id);

    if (error) {
      console.error(`❌ Error updating ${factor.id}:`, error.message);
    } else {
      console.log(`✓ Updated ${factor.id} → source: ${factor.source}, method: ${factor.collection_method}`);
    }
  }

  console.log('\n✅ Options factors updated to API collection!');
  console.log('\nNote: Alpha Vantage OPTIONS API provides:');
  console.log('  - Greeks: Delta, Gamma, Theta, Vega, Rho');
  console.log('  - Implied Volatility (IV)');
  console.log('  - Open Interest (OI)');
  console.log('  - Volume');
  console.log('  - Intrinsic & Time Value');
  console.log('  - Bid/Ask prices');
}

updateOptionsFactors().catch(console.error);
