// Script to link orphaned trades to a specific IPS configuration
// Run with: npx tsx scripts/link-trades-to-ips.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Target IPS: "20 - 45 DTE PCS Strategy"
const TARGET_IPS_ID = 'f6b1f402-2c5c-49a3-8af3-848f2e4ee638'
const TARGET_IPS_NAME = '20 - 45 DTE PCS Strategy'

async function main() {
  console.log('🔍 Finding orphaned trades (active trades with null ips_id)...\n')

  // Find active trades without IPS
  const { data: orphanedTrades, error: tradesError } = await supabase
    .from('trades')
    .select('id, symbol, entry_date, status, credit_received, ips_score, expiration_date')
    .eq('status', 'active')
    .is('ips_id', null)

  if (tradesError) {
    console.error('❌ Error fetching orphaned trades:', tradesError.message)
    process.exit(1)
  }

  if (!orphanedTrades || orphanedTrades.length === 0) {
    console.log('✅ No orphaned trades found! All active trades are linked to an IPS.')
    return
  }

  console.log(`Found ${orphanedTrades.length} orphaned trade(s):\n`)
  orphanedTrades.forEach((trade, idx) => {
    console.log(`  ${idx + 1}. ${trade.symbol} - Entry: ${trade.entry_date}, Exp: ${trade.expiration_date}, Credit: $${trade.credit_received}`)
  })

  console.log(`\n📝 Linking all trades to: "${TARGET_IPS_NAME}"`)
  console.log(`   IPS ID: ${TARGET_IPS_ID}`)
  console.log(`   Exit Strategy: 50% profit, 250% loss\n`)

  // Update trades
  const tradeIds = orphanedTrades.map(t => t.id)
  const { error: updateError } = await supabase
    .from('trades')
    .update({
      ips_id: TARGET_IPS_ID,
      ips_name: TARGET_IPS_NAME
    })
    .in('id', tradeIds)

  if (updateError) {
    console.error('❌ Error updating trades:', updateError.message)
    process.exit(1)
  }

  console.log(`✅ Successfully linked ${orphanedTrades.length} trade(s) to IPS "${TARGET_IPS_NAME}"\n`)
  console.log('📊 Updated trades:')
  orphanedTrades.forEach(trade => {
    console.log(`  ✓ ${trade.symbol}`)
  })

  console.log('\n💡 Refresh your dashboard to see the exit/watch triggers!')
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
