// Options Analysis Script - Matching Actual IPS Criteria (1-14 DTE PCS)
const https = require('https');

const API_KEY = 'XF0H4EC893MP2ATJ';
const tickers = ['MU', 'AMD', 'APP', 'TSLA'];
const currentPrices = {
  'MU': 187.83,
  'AMD': 164.67,
  'APP': 682.76,
  'TSLA': 429.83
};

// IPS CRITERIA WEIGHTS (Total = 100)
const IPS_WEIGHTS = {
  delta: 10,              // Short leg ≤ 0.15 (prefer 0.08-0.18)
  ivRank: 9,              // ≥ 35 and ≤ 80
  atmIV: 6,               // ≥ 25%
  bidAskSpread: 8,        // ≤ $0.10 or ≤ 0.5% of price
  openInterest: 7,        // ≥ 500 each leg, volume ≥ 100
  putCallRatio: 4,        // ≤ 1.0 (prefer ≤ 0.8)
  putCallOI: 3,           // ≤ 1.0
  ivPercentile: 6,        // ≥ 50
  vega: 4,                // ≤ 0 (net short vega)
  theta: 4,               // ≥ 0.01 per share
  momentum: 7,            // Price > 50-DMA & 20-DMA; 5-day ≥ 0
  price50dma: 3,          // ≥ 1.00
  price200dma: 3,         // ≥ 1.00
  rangePosition: 3,       // ≥ 40%
  distFrom52wHigh: 2,     // ≤ 15%
  newsSentiment: 4,       // ≥ +0.2
  newsVolume: 2,          // ≤ +2.0
  socialSentiment: 2,     // ≥ 0
  analystRating: 2,       // ≥ 3.5/5
  analystCoverage: 2,     // ≥ 10 analysts
  marketCap: 3            // ≥ $2B (prefer large-cap)
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

function scoreAgainstIPS(spread, ticker) {
  let score = 0;
  const breakdown = {};

  // 1. Delta (short leg) - Weight: 10
  const delta = Math.abs(parseFloat(spread.delta));
  if (delta >= 0.08 && delta <= 0.15) {
    score += 10;
    breakdown.delta = { score: 10, status: '✅', value: delta.toFixed(2) };
  } else if (delta <= 0.18) {
    score += 7;
    breakdown.delta = { score: 7, status: '⚠️', value: delta.toFixed(2) };
  } else {
    score += 3;
    breakdown.delta = { score: 3, status: '❌', value: delta.toFixed(2) };
  }

  // 2. IV Rank - Weight: 9 (using IV as proxy since we don't have historical IV)
  const iv = parseFloat(spread.iv);
  if (iv >= 35 && iv <= 80) {
    score += 9;
    breakdown.ivRank = { score: 9, status: '✅', value: `${iv.toFixed(1)}%` };
  } else if (iv >= 25 && iv < 35) {
    score += 5;
    breakdown.ivRank = { score: 5, status: '⚠️', value: `${iv.toFixed(1)}%` };
  } else {
    score += 2;
    breakdown.ivRank = { score: 2, status: '❌', value: `${iv.toFixed(1)}%` };
  }

  // 3. ATM IV - Weight: 6
  if (iv >= 25) {
    score += 6;
    breakdown.atmIV = { score: 6, status: '✅', value: `${iv.toFixed(1)}%` };
  } else if (iv >= 20) {
    score += 4;
    breakdown.atmIV = { score: 4, status: '⚠️', value: `${iv.toFixed(1)}%` };
  } else {
    score += 1;
    breakdown.atmIV = { score: 1, status: '❌', value: `${iv.toFixed(1)}%` };
  }

  // 4. Bid-Ask Spread - Weight: 8
  const bidAsk = parseFloat(spread.bidAskSpread);
  const optionPrice = parseFloat(spread.credit);
  const bidAskPct = (bidAsk / optionPrice) * 100;
  if (bidAsk <= 0.10 || bidAskPct <= 0.5) {
    score += 8;
    breakdown.bidAskSpread = { score: 8, status: '✅', value: `$${bidAsk.toFixed(2)}` };
  } else if (bidAsk <= 0.20) {
    score += 5;
    breakdown.bidAskSpread = { score: 5, status: '⚠️', value: `$${bidAsk.toFixed(2)}` };
  } else {
    score += 2;
    breakdown.bidAskSpread = { score: 2, status: '❌', value: `$${bidAsk.toFixed(2)}` };
  }

  // 5. Open Interest - Weight: 7
  const minOI = Math.min(spread.oi_short, spread.oi_long);
  if (minOI >= 500) {
    score += 7;
    breakdown.openInterest = { score: 7, status: '✅', value: `${minOI}` };
  } else if (minOI >= 200) {
    score += 4;
    breakdown.openInterest = { score: 4, status: '⚠️', value: `${minOI}` };
  } else {
    score += 1;
    breakdown.openInterest = { score: 1, status: '❌', value: `${minOI}` };
  }

  // 6. Vega - Weight: 4 (should be negative/short vega)
  const vega = parseFloat(spread.vega);
  if (vega <= 0) {
    score += 4;
    breakdown.vega = { score: 4, status: '✅', value: vega.toFixed(2) };
  } else if (vega <= 0.05) {
    score += 2;
    breakdown.vega = { score: 2, status: '⚠️', value: vega.toFixed(2) };
  } else {
    score += 0;
    breakdown.vega = { score: 0, status: '❌', value: vega.toFixed(2) };
  }

  // 7. Theta - Weight: 4 (should be ≥ 0.01 per share)
  const theta = parseFloat(spread.theta);
  if (theta >= 0.01) {
    score += 4;
    breakdown.theta = { score: 4, status: '✅', value: theta.toFixed(2) };
  } else if (theta >= 0.005) {
    score += 2;
    breakdown.theta = { score: 2, status: '⚠️', value: theta.toFixed(2) };
  } else {
    score += 0;
    breakdown.theta = { score: 0, status: '❌', value: theta.toFixed(2) };
  }

  // 8. DTE Check (must be 1-14 for this IPS)
  if (spread.dte >= 1 && spread.dte <= 14) {
    breakdown.dte = { score: '✅', status: '✅', value: `${spread.dte} days` };
  } else {
    breakdown.dte = { score: '❌', status: '❌', value: `${spread.dte} days (OUT OF RANGE)` };
    score = score * 0.5; // Penalize heavily if outside DTE window
  }

  // Note: We don't have access to momentum, sentiment, analyst data via Alpha Vantage
  // Those would need Tavily/other APIs (7+7+3+3+3+2+4+2+2+2+2+3 = 40 points missing)

  breakdown.missingFactors = {
    note: '40 points from factors requiring Tavily/fundamental APIs',
    factors: ['momentum', 'price50dma', 'price200dma', 'rangePosition', 'distFrom52wHigh',
              'newsSentiment', 'newsVolume', 'socialSentiment', 'analystRating',
              'analystCoverage', 'marketCap', 'putCallRatio', 'putCallOI', 'ivPercentile']
  };

  return { score, breakdown, maxPossibleScore: 60 }; // Max from available data
}

function analyzePutCreditSpread(symbol, price, optionsData) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${symbol} - Current Price: $${price}`);
  console.log(`${'='.repeat(80)}\n`);

  if (!optionsData.data || optionsData.data.length === 0) {
    console.log('❌ No options data available\n');
    return null;
  }

  const puts = optionsData.data.filter(opt => opt.type === 'put');
  const byExpiration = {};
  puts.forEach(put => {
    if (!byExpiration[put.expiration]) {
      byExpiration[put.expiration] = [];
    }
    byExpiration[put.expiration].push(put);
  });

  const today = new Date('2025-10-03');
  const results = [];

  Object.keys(byExpiration).forEach(expDate => {
    const exp = new Date(expDate);
    const dte = Math.round((exp - today) / (1000 * 60 * 60 * 24));

    // **KEY CHANGE: 1-14 DTE ONLY** per IPS
    if (dte < 1 || dte > 14) return;

    const expirationPuts = byExpiration[expDate];

    // Find short puts with delta ≤ 0.15 (ideally 0.08-0.15)
    const shortPutCandidates = expirationPuts.filter(p =>
      Math.abs(parseFloat(p.delta)) >= 0.08 &&
      Math.abs(parseFloat(p.delta)) <= 0.18 && // Slightly wider for candidates
      parseFloat(p.strike) < price * 0.95 &&
      parseFloat(p.open_interest) > 100 &&
      parseFloat(p.bid) > 0.10
    );

    shortPutCandidates.forEach(shortPut => {
      const shortStrike = parseFloat(shortPut.strike);

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
        const pop = 1 - Math.abs(parseFloat(shortPut.delta));
        const roi = (maxProfit / maxLoss) * 100;

        const bidAskSpreadShort = parseFloat(shortPut.ask) - parseFloat(shortPut.bid);
        const bidAskSpreadLong = parseFloat(longPut.ask) - parseFloat(longPut.bid);
        const avgBidAskSpread = (bidAskSpreadShort + bidAskSpreadLong) / 2;

        const spread = {
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
          delta: shortPut.delta,
          iv: shortPut.implied_volatility,
          theta: shortPut.theta,
          vega: shortPut.vega,
          oi_short: shortPut.open_interest,
          oi_long: longPut.open_interest,
          bidAskSpread: avgBidAskSpread.toFixed(2)
        };

        const { score, breakdown, maxPossibleScore } = scoreAgainstIPS(spread, symbol);
        spread.ipsScore = score;
        spread.ipsBreakdown = breakdown;
        spread.maxScore = maxPossibleScore;

        results.push(spread);
      });
    });
  });

  results.sort((a, b) => b.ipsScore - a.ipsScore);

  if (results.length === 0) {
    console.log('❌ No spreads found matching 1-14 DTE criteria\n');
    return null;
  }

  console.log('🎯 Top Put Credit Spread Opportunities (1-14 DTE):\n');
  results.slice(0, 3).forEach((spread, i) => {
    console.log(`${i + 1}. SELL $${spread.shortStrike} PUT / BUY $${spread.longStrike} PUT`);
    console.log(`   Exp: ${spread.expiration} (${spread.dte} DTE) | Width: $${spread.width}`);
    console.log(`   💰 Credit: $${spread.credit} | Max Profit: $${spread.maxProfit} | Max Loss: $${spread.maxLoss}`);
    console.log(`   📊 POP: ${spread.pop}% | ROI: ${spread.roi}%`);
    console.log(`   📈 Delta: ${spread.delta} | IV: ${spread.iv}% | Theta: ${spread.theta} | Vega: ${spread.vega}`);
    console.log(`   🔄 OI: ${spread.oi_short}/${spread.oi_long} | Bid-Ask: $${spread.bidAskSpread}`);
    console.log(`   ⭐ IPS FIT: ${spread.ipsScore}/${spread.maxScore} (${((spread.ipsScore/spread.maxScore)*100).toFixed(0)}%)\n`);

    console.log(`   📋 FACTOR BREAKDOWN:`);
    Object.keys(spread.ipsBreakdown).forEach(factor => {
      if (factor === 'missingFactors') return;
      const fb = spread.ipsBreakdown[factor];
      console.log(`      ${fb.status} ${factor}: ${fb.value} (${fb.score} pts)`);
    });
    console.log(`      ⚠️  ${spread.ipsBreakdown.missingFactors.note}`);
    console.log('');
  });

  return results[0];
}

async function main() {
  console.log('\n🎯 PUT CREDIT SPREAD ANALYSIS (1-14 DTE IPS)\n');
  console.log('Target: Delta ≤0.15, IV ≥25%, DTE 1-14 days, Tight Spreads, High Liquidity\n');

  for (const ticker of tickers) {
    try {
      console.log(`Fetching options data for ${ticker}...`);
      const optionsData = await fetchOptions(ticker);
      await new Promise(resolve => setTimeout(resolve, 15000));

      analyzePutCreditSpread(ticker, currentPrices[ticker], optionsData);
    } catch (error) {
      console.error(`Error analyzing ${ticker}:`, error.message);
    }
  }
}

main();
