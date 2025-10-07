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
 * Schedule spread price updates every 5 minutes during market hours
 * Runs Monday-Friday from 9:30 AM to 4:00 PM EST
 */
export function startSpreadPriceScheduler() {
  // Check if we're in a server environment
  if (typeof window !== 'undefined') {
    console.log('[Spread Updater] Not starting scheduler in browser environment')
    return
  }

  console.log('[Spread Updater] Starting scheduler...')

  // Every 5 minutes during market hours (9:30 AM - 4:00 PM EST)
  // Cron: */5 * * * 1-5 runs every 5 minutes, Mon-Fri
  // We'll check inside the function if we're within market hours
  const everyFiveMinutes = new CronJob(
    '*/5 * * * 1-5', // Every 5 minutes, Mon-Fri
    async () => {
      const now = new Date()
      const hour = now.getHours()
      const minute = now.getMinutes()

      // Market hours: 9:30 AM (9:30) to 4:00 PM (16:00) EST
      // Convert to 24-hour format: 9:30 = 9*60+30 = 570 minutes, 16:00 = 960 minutes
      const currentMinutes = hour * 60 + minute
      const marketOpen = 9 * 60 + 30  // 9:30 AM = 570 minutes
      const marketClose = 16 * 60      // 4:00 PM = 960 minutes

      if (currentMinutes >= marketOpen && currentMinutes <= marketClose) {
        console.log(`[Spread Updater] Running scheduled update at ${now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST`)
        await updateAllSpreadPrices()
      } else {
        console.log(`[Spread Updater] Skipping update outside market hours (${now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST)`)
      }
    },
    null,
    true,
    'America/New_York'
  )

  console.log('[Spread Updater] Scheduled updates:')
  console.log('  - Every 5 minutes during market hours')
  console.log('  - Monday-Friday, 9:30 AM - 4:00 PM EST')
  console.log('  - Approximately 78 updates per day')

  // Return job for cleanup if needed
  return {
    everyFiveMinutes,
    stopAll: () => {
      everyFiveMinutes.stop()
      console.log('[Spread Updater] Scheduler stopped')
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
