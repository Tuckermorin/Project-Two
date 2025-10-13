// Load environment variables from .env file
import 'dotenv/config';
import { getAlphaVantageClient } from '../../src/lib/api/alpha-vantage';

async function testAPIConnections() {
  console.log('=== API Connections Test ===');

  // Check environment variables
  console.log('\n1. Checking API keys...');
  const alphaVantageKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;

  if (!alphaVantageKey || alphaVantageKey === 'your-alpha-vantage-key-here') {
    console.log('⚠️  NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY not set or is placeholder');
  } else {
    console.log('✅ Alpha Vantage API key is set');
  }

  // Test Alpha Vantage (if key is set)
  if (alphaVantageKey && alphaVantageKey !== 'your-alpha-vantage-key-here') {
    console.log('\n2. Testing Alpha Vantage connection...');
    try {
      const alphaVantage = getAlphaVantageClient();
      const quote = await alphaVantage.getQuote('AAPL');
      console.log('✅ Alpha Vantage connection successful!');
      console.log(`   AAPL price: $${quote.price}`);
    } catch (error) {
      console.log('❌ Alpha Vantage test failed:', error);
    }
  }

  if (!alphaVantageKey || alphaVantageKey === 'your-alpha-vantage-key-here') {
    console.log('\n⚠️  To complete setup, get your API key:');
    console.log('   - Alpha Vantage: https://www.alphavantage.co/support/#api-key');
    console.log('   Then update your .env file with the real key.');
  } else {
    console.log('\n🎉 API connection is ready!');
  }
}

// Run the tests
testAPIConnections();