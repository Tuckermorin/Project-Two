// scripts/start-all-schedulers.ts
// Master scheduler that starts ALL automated jobs
// Usage: npx tsx scripts/start-all-schedulers.ts

import dotenv from 'dotenv';
import { startSpreadPriceScheduler } from '../src/lib/jobs/spread-price-updater';
import { startTavilyJobs } from '../src/lib/jobs/tavily-jobs';
import { getJobScheduler } from '../src/lib/utils/scheduler';

// Load environment variables
dotenv.config();

console.log('='.repeat(80));
console.log('TENXIV AUTOMATED JOB SCHEDULER');
console.log('='.repeat(80));
console.log('');
console.log('Starting all automated jobs...');
console.log('Timezone: America/New_York (EST/EDT)');
console.log('');
console.log('='.repeat(80));
console.log('');

// 1. Start Spread Price Updater
console.log('📊 SPREAD PRICE UPDATES');
console.log('-'.repeat(80));
const spreadScheduler = startSpreadPriceScheduler();
console.log('');

// 2. Start Tavily-Powered Jobs
console.log('🔍 TAVILY RESEARCH JOBS');
console.log('-'.repeat(80));
const tavilyScheduler = startTavilyJobs();
console.log('');

// 3. Start Market Data Jobs (if you want to enable these)
console.log('📈 MARKET DATA SYNC JOBS');
console.log('-'.repeat(80));
try {
  const jobScheduler = getJobScheduler();
  jobScheduler.scheduleMarketJobs();
  console.log('');
} catch (error) {
  console.log('⚠️  Market data jobs not configured (optional)');
  console.log('');
}

console.log('='.repeat(80));
console.log('');
console.log('✅ ALL SCHEDULERS RUNNING');
console.log('');
console.log('Active Jobs:');
console.log('  1. Spread Price Updates    - Every 5 min during market hours');
console.log('  2. Daily Trade Monitoring  - 9:00 AM EST (Mon-Fri)');
console.log('  3. Midday Trade Check      - 12:00 PM EST (Mon-Fri)');
console.log('  4. Auto Post-Mortems       - Every hour (24/7)');
console.log('  5. Weekly RAG Enrichment   - 2:00 AM EST (Sunday)');
console.log('  6. Market Data Syncs       - Multiple times (Mon-Fri) [if enabled]');
console.log('');
console.log('Press Ctrl+C to stop all jobs');
console.log('');
console.log('='.repeat(80));
console.log('');
console.log('Scheduler ready. Waiting for scheduled times...');
console.log('');

// Keep the process running
process.on('SIGINT', () => {
  console.log('');
  console.log('='.repeat(80));
  console.log('Shutting down all schedulers...');
  console.log('='.repeat(80));
  console.log('');

  if (spreadScheduler) {
    console.log('Stopping spread price updates...');
    spreadScheduler.stopAll();
  }

  if (tavilyScheduler) {
    console.log('Stopping Tavily jobs...');
    tavilyScheduler.stopAll();
  }

  console.log('');
  console.log('✅ All schedulers stopped');
  console.log('');
  process.exit(0);
});

// Log current time for reference
setInterval(() => {
  const now = new Date();
  const estTime = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  console.log(`[${estTime} EST] Scheduler active...`);
}, 60000); // Log every minute
