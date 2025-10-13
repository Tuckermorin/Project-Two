// Rate limit aware Alpha Vantage test
import 'dotenv/config';
import { getAlphaVantageClient } from '../../src/lib/api/alpha-vantage';

async function testAlphaVantageWithRateLimit() {
  console.log('=== Alpha Vantage API Test (Rate Limit Aware) ===');

  // Check environment variables
  console.log('\n1. Checking Alpha Vantage API key...');
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey || apiKey === 'your-alpha-vantage-key-here') {
    console.log('❌ ALPHA_VANTAGE_API_KEY not set or is placeholder');
    console.log('   Get your free key at: https://www.alphavantage.co/support/#api-key');
    console.log('   Then update your .env file');
    return;
  }

  console.log('✅ Alpha Vantage API key is set');
  console.log(`   Key: ${apiKey.slice(0, 8)}...`);

  try {
    console.log('\n2. Creating Alpha Vantage client...');
    const alphaVantage = getAlphaVantageClient();
    console.log('✅ Client created successfully');

    console.log('\n3. Testing API connection with rate limit detection...');
    
    // Test with a simple call first
    try {
      const quote = await alphaVantage.getQuote('AAPL');
      
      if (quote && quote['01. symbol']) {
        console.log('✅ API connection successful! Quote data received:');
        console.log(`   Symbol: ${quote['01. symbol']}`);
        console.log(`   Price: $${quote['05. price']}`);
        console.log(`   Change: ${quote['09. change']} (${quote['10. change percent']})`);
        console.log(`   Volume: ${parseInt(quote['06. volume']).toLocaleString()}`);
        
        console.log('\n🎉 Alpha Vantage API is working and you have remaining quota!');
        console.log('   You can proceed with using the API for your application.');
        
      } else {
        console.log('⚠️ API connected but returned unexpected data format');
        console.log('   This might indicate a rate limit or API issue');
      }
      
    } catch (error: any) {
      if (error.message?.includes('rate limit') || error.message?.includes('25 requests')) {
        console.log('⚠️ Rate limit detected (25 requests/day exceeded)');
        console.log('   Your API key is working, but you\'ve hit the daily limit');
        console.log('   Solutions:');
        console.log('   1. Wait until midnight UTC for limit reset');
        console.log('   2. Upgrade to a premium plan at https://www.alphavantage.co/premium/');
        console.log('   3. Use demo/mock data for development');
        
        console.log('\n✅ Connection Status: API key valid, rate limited');
        return;
      }
      
      throw error; // Re-throw if it's a different error
    }

  } catch (error) {
    console.log('❌ Alpha Vantage test failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        console.log('   This is a rate limit issue (25 calls/day on free tier)');
        console.log('   Wait until tomorrow or upgrade your plan');
      } else {
        console.log('   This appears to be a different API or network issue');
      }
    }
  }
}

// Run the test
testAlphaVantageWithRateLimit();