// src/lib/jobs/spread-price-updater.ts

import { CronJob } from 'cron'
import { createClient } from '@supabase/supabase-js'
import { calculateSpreadPrice, calculateSpreadPL } from '@/lib/utils/spread-pricing'

// Get Supabase client (lazy initialization to allow env vars to load)
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, key)
}

/**
 * Update spread prices for all active trades
 */
async function updateAllSpreadPrices() {
  const startTime = new Date()
  console.log(`[Spread Updater] Starting update at ${startTime.toISOString()}`)

  try {
    const supabase = getSupabaseClient()

    // Fetch all active trades
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'active')

    if (error) {
      console.error('[Spread Updater] Error fetching trades:', error)
      return
    }

    if (!trades || trades.length === 0) {
      console.log('[Spread Updater] No active trades to update')
      return
    }

    console.log(`[Spread Updater] Found ${trades.length} active trades`)

    let successCount = 0
    let failureCount = 0

    // Process each trade with rate limiting
    for (const trade of trades) {
      try {
        // Only process trades with spread data
        if (!trade.short_strike || !trade.long_strike || !trade.expiration_date) {
          console.log(`[Spread Updater] Skipping ${trade.symbol} - missing spread data`)
          continue
        }

        // Determine contract type from strategy
        let contractType: 'put' | 'call' = 'put'
        const strategy = String(trade.strategy_type || '').toLowerCase()
        if (strategy.includes('call')) {
          contractType = 'call'
        }

        // Calculate spread price
        const spreadPrice = await calculateSpreadPrice(
          trade.symbol,
          Number(trade.short_strike),
          Number(trade.long_strike),
          contractType,
          trade.expiration_date
        )

        if (!spreadPrice) {
          console.log(`[Spread Updater] Failed to calculate price for ${trade.symbol}`)
          failureCount++
          continue
        }

        // Calculate P/L
        const creditReceived = Number(trade.credit_received || 0)
        const contracts = Number(trade.number_of_contracts || trade.contracts || 1)
        const { plDollar, plPercent } = calculateSpreadPL(
          creditReceived,
          spreadPrice.mid,
          contracts
        )

        // Update the trade
        const { error: updateError } = await supabase
          .from('trades')
          .update({
            current_spread_price: spreadPrice.mid,
            current_spread_bid: spreadPrice.bid,
            current_spread_ask: spreadPrice.ask,
            spread_price_updated_at: spreadPrice.updatedAt
          })
          .eq('id', trade.id)

        if (updateError) {
          console.error(`[Spread Updater] Failed to update ${trade.symbol}:`, updateError)
          failureCount++
        } else {
          console.log(`[Spread Updater] Updated ${trade.symbol}: price=$${spreadPrice.mid.toFixed(2)}, P/L=$${plDollar.toFixed(2)} (${plPercent.toFixed(1)}%)`)
          successCount++
        }

        // Rate limiting: 100ms between API calls (600 calls/minute)
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`[Spread Updater] Error processing trade ${trade.symbol}:`, error)
        failureCount++
      }
    }

    const endTime = new Date()
    const duration = (endTime.getTime() - startTime.getTime()) / 1000
    console.log(`[Spread Updater] Completed in ${duration.toFixed(1)}s - Success: ${successCount}, Failed: ${failureCount}`)

  } catch (error) {
    console.error('[Spread Updater] Fatal error:', error)
  }
}

/**
 * Schedule spread price updates at market hours
 * - 9:30 AM EST (Market Open)
 * - 10:00 AM EST
 * - 12:00 PM EST (Midday)
 * - 2:00 PM EST
 * - 4:00 PM EST (Market Close)
 */
export function startSpreadPriceScheduler() {
  // Check if we're in a server environment
  if (typeof window !== 'undefined') {
    console.log('[Spread Updater] Not starting scheduler in browser environment')
    return
  }

  console.log('[Spread Updater] Starting scheduler...')

  // Market Open: 9:30 AM EST (14:30 UTC)
  const marketOpen = new CronJob(
    '30 14 * * 1-5', // Mon-Fri at 9:30 AM EST
    updateAllSpreadPrices,
    null,
    true,
    'America/New_York'
  )

  // 10:00 AM EST (15:00 UTC)
  const morning = new CronJob(
    '0 15 * * 1-5', // Mon-Fri at 10:00 AM EST
    updateAllSpreadPrices,
    null,
    true,
    'America/New_York'
  )

  // 12:00 PM EST (17:00 UTC)
  const midday = new CronJob(
    '0 17 * * 1-5', // Mon-Fri at 12:00 PM EST
    updateAllSpreadPrices,
    null,
    true,
    'America/New_York'
  )

  // 2:00 PM EST (19:00 UTC)
  const afternoon = new CronJob(
    '0 19 * * 1-5', // Mon-Fri at 2:00 PM EST
    updateAllSpreadPrices,
    null,
    true,
    'America/New_York'
  )

  // Market Close: 4:00 PM EST (21:00 UTC)
  const marketClose = new CronJob(
    '0 21 * * 1-5', // Mon-Fri at 4:00 PM EST
    updateAllSpreadPrices,
    null,
    true,
    'America/New_York'
  )

  console.log('[Spread Updater] Scheduled updates:')
  console.log('  - 9:30 AM EST (Market Open)')
  console.log('  - 10:00 AM EST')
  console.log('  - 12:00 PM EST (Midday)')
  console.log('  - 2:00 PM EST')
  console.log('  - 4:00 PM EST (Market Close)')

  // Return jobs for cleanup if needed
  return {
    marketOpen,
    morning,
    midday,
    afternoon,
    marketClose,
    stopAll: () => {
      marketOpen.stop()
      morning.stop()
      midday.stop()
      afternoon.stop()
      marketClose.stop()
      console.log('[Spread Updater] All schedulers stopped')
    }
  }
}

/**
 * Manual trigger for testing or immediate updates
 */
export async function triggerSpreadPriceUpdate() {
  console.log('[Spread Updater] Manual trigger initiated')
  await updateAllSpreadPrices()
}
