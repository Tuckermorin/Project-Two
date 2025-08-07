// Load environment variables from .env file
import 'dotenv/config';
import { getAlphaVantageClient } from './src/lib/api/alpha-vantage';
import { getTradierClient } from './src/lib/api/tradier';

async function testAPIConnections() {
  console.log('=== API Connections Test ===');

  // Check environment variables
  console.log('\n1. Checking API keys...');
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  const tradierKey = process.env.TRADIER_ACCESS_TOKEN;

  if (!alphaVantageKey || alphaVantageKey === 'your-alpha-vantage-key-here') {
    console.log('⚠️  ALPHA_VANTAGE_API_KEY not set or is placeholder');
  } else {
    console.log('✅ Alpha Vantage API key is set');
  }

  if (!tradierKey || tradierKey === 'your-tradier-token-here') {
    console.log('⚠️  TRADIER_ACCESS_TOKEN not set or is placeholder');
  } else {
    console.log('✅ Tradier API key is set');
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

  // Test Tradier (if key is set)
  if (tradierKey && tradierKey !== 'your-tradier-token-here') {
    console.log('\n3. Testing Tradier connection...');
    try {
      const tradier = getTradierClient();
      const quote = await tradier.getQuote('AAPL');
      console.log('✅ Tradier connection successful!');
      console.log(`   AAPL last: $${quote.last}, volume: ${quote.volume.toLocaleString()}`);
    } catch (error) {
      console.log('❌ Tradier test failed:', error);
    }
  }

  if (!alphaVantageKey || !tradierKey || 
      alphaVantageKey === 'your-alpha-vantage-key-here' || 
      tradierKey === 'your-tradier-token-here') {
    console.log('\n⚠️  To complete setup, get your API keys:');
    console.log('   - Alpha Vantage: https://www.alphavantage.co/support/#api-key');
    console.log('   - Tradier: https://tradier.com/products/market-data');
    console.log('   Then update your .env file with the real keys.');
  } else {
    console.log('\n🎉 All API connections are ready!');
  }
}

// Run the tests
testAPIConnections();