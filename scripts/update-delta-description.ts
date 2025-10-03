import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function updateDelta() {
  console.log('Updating Delta description to clarify net position delta...\n');

  const { error } = await supabase
    .from('factor_definitions')
    .update({
      description: 'Net position delta - measures overall directional exposure of your position. For single options: 0 to 1 for calls, -1 to 0 for puts. For spreads: net delta of both legs combined (e.g., credit spread might be -0.20). Higher absolute delta = greater directional risk. Use for: position sizing, risk management, and delta-neutral strategies.'
    })
    .eq('id', 'opt-delta');

  if (error) {
    console.error('❌ Error:', error.message);
  } else {
    console.log('✓ Updated Delta description to clarify it\'s NET position delta');
    console.log('\nNew description covers:');
    console.log('  • Net position delta (not individual legs)');
    console.log('  • Single options vs spreads');
    console.log('  • Practical use cases');
  }
}

updateDelta();
