// Options Analysis Script for Put Credit Spreads
const https = require('https');

const API_KEY = 'XF0H4EC893MP2ATJ';
const tickers = ['MU', 'AMD', 'APP', 'TSLA'];
const currentPrices = {
  'MU': 187.83,
  'AMD': 164.67,
  'APP': 682.76,
  'TSLA': 429.83
};

function fetchOptions(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${symbol}&apikey=${API_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function analyzePutCreditSpread(symbol, price, optionsData) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${symbol} - Current Price: $${price}`);
  console.log(`${'='.repeat(80)}\n`);

  if (!optionsData.data || optionsData.data.length === 0) {
    console.log('❌ No options data available\n');
    return null;
  }

  // Filter for puts only
  const puts = optionsData.data.filter(opt => opt.type === 'put');

  // Group by expiration
  const byExpiration = {};
  puts.forEach(put => {
    if (!byExpiration[put.expiration]) {
      byExpiration[put.expiration] = [];
    }
    byExpiration[put.expiration].push(put);
  });

  // Analyze expirations between 7-45 DTE (ideal for put credit spreads)
  const today = new Date('2025-10-03');
  const results = [];

  Object.keys(byExpiration).forEach(expDate => {
    const exp = new Date(expDate);
    const dte = Math.round((exp - today) / (1000 * 60 * 60 * 24));

    if (dte < 7 || dte > 45) return; // Skip if outside ideal range

    const expirationPuts = byExpiration[expDate];

    // Find optimal strikes for put credit spread
    // Short put: ~15-25 delta (sell for credit)
    // Long put: 5-10 points below short (buy for protection)

    const shortPutCandidates = expirationPuts.filter(p =>
      Math.abs(parseFloat(p.delta)) >= 0.15 &&
      Math.abs(parseFloat(p.delta)) <= 0.30 &&
      parseFloat(p.strike) < price * 0.95 && // At least 5% OTM
      parseFloat(p.open_interest) > 100 && // Liquidity filter
      parseFloat(p.bid) > 0.10 // Minimum premium
    );

    shortPutCandidates.forEach(shortPut => {
      const shortStrike = parseFloat(shortPut.strike);

      // Find long put 5-10 points below
      const longPutCandidates = expirationPuts.filter(p =>
        parseFloat(p.strike) >= shortStrike - 10 &&
        parseFloat(p.strike) <= shortStrike - 5 &&
        parseFloat(p.strike) < shortStrike
      );

      longPutCandidates.forEach(longPut => {
        const longStrike = parseFloat(longPut.strike);
        const width = shortStrike - longStrike;
        const credit = parseFloat(shortPut.bid) - parseFloat(longPut.ask);
        const maxLoss = width - credit;
        const maxProfit = credit;
        const pop = 1 - Math.abs(parseFloat(shortPut.delta)); // Probability of profit
        const roi = (maxProfit / maxLoss) * 100;
        const rr = maxProfit / maxLoss;

        // Calculate IPS fit
        const bidAskSpreadShort = parseFloat(shortPut.ask) - parseFloat(shortPut.bid);
        const bidAskSpreadLong = parseFloat(longPut.ask) - parseFloat(longPut.bid);
        const avgBidAskSpread = (bidAskSpreadShort + bidAskSpreadLong) / 2;

        results.push({
          symbol,
          expiration: expDate,
          dte,
          shortStrike,
          longStrike,
          width,
          credit: credit.toFixed(2),
          maxProfit: maxProfit.toFixed(2),
          maxLoss: maxLoss.toFixed(2),
          pop: (pop * 100).toFixed(1),
          roi: roi.toFixed(1),
          rr: rr.toFixed(2),
          delta: shortPut.delta,
          iv: shortPut.implied_volatility,
          theta: shortPut.theta,
          vega: shortPut.vega,
          oi_short: shortPut.open_interest,
          oi_long: longPut.open_interest,
          bidAskSpread: avgBidAskSpread.toFixed(3),
          score: 0 // Will calculate
        });
      });
    });
  });

  // Score each spread against IPS criteria
  results.forEach(spread => {
    let score = 0;

    // Delta: prefer 15-25 delta (moderate risk)
    const delta = Math.abs(parseFloat(spread.delta));
    if (delta >= 0.15 && delta <= 0.25) score += 15;
    else if (delta < 0.15) score += 10;
    else score += 5;

    // POP: prefer > 70%
    const pop = parseFloat(spread.pop);
    if (pop >= 75) score += 20;
    else if (pop >= 70) score += 15;
    else if (pop >= 65) score += 10;
    else score += 5;

    // ROI: prefer > 10%
    const roi = parseFloat(spread.roi);
    if (roi >= 15) score += 15;
    else if (roi >= 10) score += 12;
    else if (roi >= 5) score += 8;
    else score += 4;

    // R:R: prefer > 0.20
    const rr = parseFloat(spread.rr);
    if (rr >= 0.25) score += 15;
    else if (rr >= 0.20) score += 12;
    else if (rr >= 0.15) score += 8;
    else score += 4;

    // DTE: prefer 21-30 days
    if (spread.dte >= 21 && spread.dte <= 30) score += 10;
    else if (spread.dte >= 14 && spread.dte <= 35) score += 7;
    else score += 4;

    // Liquidity (OI): prefer > 500
    const minOI = Math.min(spread.oi_short, spread.oi_long);
    if (minOI > 500) score += 10;
    else if (minOI > 200) score += 7;
    else if (minOI > 100) score += 5;
    else score += 2;

    // Bid-Ask Spread: prefer < 0.10
    const bidAsk = parseFloat(spread.bidAskSpread);
    if (bidAsk < 0.10) score += 10;
    else if (bidAsk < 0.20) score += 7;
    else if (bidAsk < 0.30) score += 4;
    else score += 2;

    // Theta decay: prefer more negative (faster decay)
    const theta = Math.abs(parseFloat(spread.theta));
    if (theta > 0.10) score += 5;
    else if (theta > 0.05) score += 3;
    else score += 1;

    spread.score = score;
  });

  // Sort by score and show top 3
  results.sort((a, b) => b.score - a.score);

  console.log('Top 3 Put Credit Spread Opportunities:\n');
  results.slice(0, 3).forEach((spread, i) => {
    console.log(`${i + 1}. SELL ${spread.shortStrike} PUT / BUY ${spread.longStrike} PUT`);
    console.log(`   Expiration: ${spread.expiration} (${spread.dte} DTE)`);
    console.log(`   Credit: $${spread.credit} | Max Profit: $${spread.maxProfit} | Max Loss: $${spread.maxLoss}`);
    console.log(`   POP: ${spread.pop}% | ROI: ${spread.roi}% | R:R: ${spread.rr}`);
    console.log(`   Delta: ${spread.delta} | IV: ${spread.iv}% | Theta: ${spread.theta}`);
    console.log(`   OI: ${spread.oi_short}/${spread.oi_long} | Bid-Ask: $${spread.bidAskSpread}`);
    console.log(`   ✅ IPS FIT SCORE: ${spread.score}/100\n`);
  });

  return results[0]; // Return best spread
}

async function main() {
  for (const ticker of tickers) {
    try {
      console.log(`Fetching options data for ${ticker}...`);
      const optionsData = await fetchOptions(ticker);
      await new Promise(resolve => setTimeout(resolve, 15000)); // Rate limit

      analyzePutCreditSpread(ticker, currentPrices[ticker], optionsData);
    } catch (error) {
      console.error(`Error analyzing ${ticker}:`, error.message);
    }
  }
}

main();
