// Script to link orphaned trades (with null ips_id) to an IPS configuration
// Run with: npx tsx scripts/link-orphaned-trades.ts

import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function main() {
  console.log('🔍 Finding orphaned trades (active trades with null ips_id)...\n')

  // Find active trades without IPS
  const { data: orphanedTrades, error: tradesError } = await supabase
    .from('trades')
    .select('id, symbol, entry_date, status, credit_received, ips_score')
    .eq('status', 'active')
    .is('ips_id', null)

  if (tradesError) {
    console.error('❌ Error fetching orphaned trades:', tradesError.message)
    process.exit(1)
  }

  if (!orphanedTrades || orphanedTrades.length === 0) {
    console.log('✅ No orphaned trades found! All active trades are linked to an IPS.')
    rl.close()
    return
  }

  console.log(`Found ${orphanedTrades.length} orphaned trade(s):\n`)
  orphanedTrades.forEach((trade, idx) => {
    console.log(`  ${idx + 1}. ${trade.symbol} - Entry: ${trade.entry_date}, Credit: $${trade.credit_received}, IPS Score: ${trade.ips_score}`)
  })

  console.log('\n📋 Available IPS configurations:\n')

  // Fetch available IPS configurations
  const { data: ipsConfigs, error: ipsError } = await supabase
    .from('ips_configurations')
    .select('id, name, description, is_active, exit_strategies')
    .order('created_at', { ascending: false })

  if (ipsError) {
    console.error('❌ Error fetching IPS configurations:', ipsError.message)
    rl.close()
    process.exit(1)
  }

  if (!ipsConfigs || ipsConfigs.length === 0) {
    console.log('⚠️  No IPS configurations found. You need to create one first.')
    rl.close()
    return
  }

  ipsConfigs.forEach((ips, idx) => {
    const profitTarget = ips.exit_strategies?.profit?.value || 'N/A'
    const lossLimit = ips.exit_strategies?.loss?.value || 'N/A'
    console.log(`  ${idx + 1}. ${ips.name} (${ips.is_active ? 'Active' : 'Inactive'})`)
    console.log(`     ID: ${ips.id}`)
    console.log(`     Description: ${ips.description || 'None'}`)
    console.log(`     Exit Strategy: ${profitTarget}% profit, ${lossLimit}% loss`)
    console.log('')
  })

  // Ask user which IPS to link to
  const answer = await question('Enter the number of the IPS to link these trades to (or "q" to quit): ')

  if (answer.toLowerCase() === 'q') {
    console.log('👋 Exiting without making changes.')
    rl.close()
    return
  }

  const selectedIndex = parseInt(answer) - 1
  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= ipsConfigs.length) {
    console.log('❌ Invalid selection.')
    rl.close()
    return
  }

  const selectedIPS = ipsConfigs[selectedIndex]

  // Confirm
  const confirm = await question(`\n⚠️  Link ${orphanedTrades.length} trade(s) to "${selectedIPS.name}"? (y/n): `)

  if (confirm.toLowerCase() !== 'y') {
    console.log('👋 Cancelled.')
    rl.close()
    return
  }

  // Update trades
  const tradeIds = orphanedTrades.map(t => t.id)
  const { error: updateError } = await supabase
    .from('trades')
    .update({
      ips_id: selectedIPS.id,
      ips_name: selectedIPS.name
    })
    .in('id', tradeIds)

  if (updateError) {
    console.error('❌ Error updating trades:', updateError.message)
    rl.close()
    process.exit(1)
  }

  console.log(`\n✅ Successfully linked ${orphanedTrades.length} trade(s) to IPS "${selectedIPS.name}"`)
  console.log('\n📊 Updated trades:')
  orphanedTrades.forEach(trade => {
    console.log(`  - ${trade.symbol}`)
  })

  console.log('\n💡 Refresh your dashboard to see the exit/watch triggers!')

  rl.close()
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  rl.close()
  process.exit(1)
})
