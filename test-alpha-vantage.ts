// Load environment variables from .env file
import 'dotenv/config';
import { getAlphaVantageClient } from './src/lib/api/alpha-vantage';

async function testAlphaVantage() {
  console.log('=== Alpha Vantage API Test ===');

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

    console.log('\n3. Testing basic quote...');
    const quote = await alphaVantage.getQuote('AAPL');
    console.log('✅ Quote fetch successful!');
    console.log(`   Symbol: ${quote['01. symbol']}`);
    console.log(`   Price: ${quote['05. price']}`);
    console.log(`   Change: ${quote['09. change']} (${quote['10. change percent']})`);
    console.log(`   Volume: ${parseInt(quote['06. volume']).toLocaleString()}`);

    console.log('\n4. Testing company overview...');
    const overview = await alphaVantage.getCompanyOverview('AAPL');
    console.log('✅ Company overview successful!');
    console.log(`   Name: ${overview.Name}`);
    console.log(`   Sector: ${overview.Sector}`);
    console.log(`   Market Cap: $${parseInt(overview.MarketCapitalization).toLocaleString()}`);
    console.log(`   P/E Ratio: ${overview.PERatio}`);
    console.log(`   Beta: ${overview.Beta}`);

    console.log('\n5. Testing fundamental data (comprehensive)...');
    const fundamentals = await alphaVantage.getCompleteFundamentalData('MSFT');
    console.log('✅ Complete fundamental data successful!');
    console.log(`   Symbol: ${fundamentals.symbol}`);
    console.log(`   Overview available: ${!!fundamentals.overview}`);
    console.log(`   Income statement available: ${!!fundamentals.incomeStatement}`);
    console.log(`   Balance sheet available: ${!!fundamentals.balanceSheet}`);
    console.log(`   Cash flow available: ${!!fundamentals.cashFlow}`);
    console.log(`   Earnings available: ${!!fundamentals.earnings}`);

    if (fundamentals.overview) {
      console.log(`   Company: ${fundamentals.overview.Name}`);
      console.log(`   Revenue TTM: $${parseInt(fundamentals.overview.RevenueTTM).toLocaleString()}`);
    }

    console.log('\n🎉 Alpha Vantage API is fully functional!');
    console.log('   You can now use it for stock quotes, fundamentals, and financial data.');

  } catch (error) {
    console.log('❌ Alpha Vantage test failed:', error);
    
    if (error instanceof Error && error.message.includes('rate limit')) {
      console.log('   This is likely due to API rate limits (5 calls/minute on free tier)');
      console.log('   Wait a minute and try again, or consider upgrading your plan');
    }
  }
}

// Run the test
testAlphaVantage();