import 'dotenv/config';
import { getAlphaVantageClient } from '../src/lib/api/alpha-vantage';

const avClient = getAlphaVantageClient();

async function testHistoricalAPI() {
  console.log('Testing Alpha Vantage HISTORICAL_OPTIONS endpoint...\n');

  // Test with 3 different dates
  const dates = ['2022-10-18', '2023-06-15', '2024-09-01'];

  for (const date of dates) {
    console.log(`\nFetching AMD options for date: ${date}`);

    try {
      const contracts = await avClient.getHistoricalOptions('AMD', { date });

      if (contracts.length > 0) {
        console.log(`  Received: ${contracts.length} contracts`);
        console.log(`  Sample contract:`, {
          contractId: contracts[0].contractId,
          expiration: contracts[0].expiration,
          strike: contracts[0].strike,
          type: contracts[0].type,
          bid: contracts[0].bid,
          ask: contracts[0].ask,
          delta: contracts[0].delta,
          iv: contracts[0].impliedVolatility
        });
      } else {
        console.log(`  No contracts returned`);
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`  ERROR:`, error.message);
    }
  }

  console.log('\n--- Conclusion ---');
  console.log('If all three dates return the SAME contract IDs and strikes,');
  console.log('then Alpha Vantage is not actually providing historical snapshots.');
  console.log('Instead, it may only return the current options chain regardless of date.');
}

testHistoricalAPI().catch(console.error);
