// scripts/spread-price-scheduler.ts
// Run this script to start the spread price update scheduler
// Usage: npx tsx scripts/spread-price-scheduler.ts

import dotenv from 'dotenv'
import { startSpreadPriceScheduler } from '../src/lib/jobs/spread-price-updater'

// Load environment variables
dotenv.config()

console.log('='.repeat(60))
console.log('SPREAD PRICE SCHEDULER')
console.log('='.repeat(60))
console.log()
console.log('Starting scheduled spread price updates...')
console.log('Timezone: America/New_York (EST/EDT)')
console.log()

// Start the scheduler
const scheduler = startSpreadPriceScheduler()

// Keep the process running
process.on('SIGINT', () => {
  console.log('\n\nShutting down scheduler...')
  if (scheduler) {
    scheduler.stopAll()
  }
  process.exit(0)
})

console.log('Scheduler is running. Press Ctrl+C to stop.')
console.log()

// Log that we're ready
console.log('Ready and waiting for scheduled times...')
