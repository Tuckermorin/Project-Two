import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateDeltaFactorName() {
  console.log('Checking for Delta factor in database...');

  // First, check if the factor exists
  const { data: existing, error: fetchError } = await supabase
    .from('factor_definitions')
    .select('*')
    .eq('id', 'opt-delta');

  if (fetchError) {
    console.error('Error fetching Delta factor:', fetchError);
    process.exit(1);
  }

  console.log('Existing Delta factor:', existing);

  if (!existing || existing.length === 0) {
    console.log('⚠️  opt-delta factor not found in database. It may need to be seeded first.');
    process.exit(0);
  }

  console.log('Updating Delta factor name and description...');

  const { data, error } = await supabase
    .from('factor_definitions')
    .update({
      name: 'Delta (Short Leg)',
      description: 'Delta of the short leg - measures directional exposure of the sold option. For credit spreads, this is the delta of your short strike (the one you sold). Range: 0 to 1 for calls, -1 to 0 for puts (shown as absolute value). Lower absolute delta = further OTM = lower probability of ITM. Typical range for credit spreads: 0.10-0.20 delta.'
    })
    .eq('id', 'opt-delta')
    .select();

  if (error) {
    console.error('Error updating Delta factor:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️  Update executed but no rows returned. This may be due to RLS policies.');
    console.log('The update may have still succeeded. Verifying...');

    const { data: verified, error: verifyError } = await supabase
      .from('factor_definitions')
      .select('name, description')
      .eq('id', 'opt-delta');

    if (verifyError) {
      console.error('Error verifying update:', verifyError);
    } else {
      console.log('Current factor state:', verified);
    }
  } else {
    console.log('✅ Successfully updated Delta factor:', data);
  }
}

updateDeltaFactorName();
