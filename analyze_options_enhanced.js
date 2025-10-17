#!/usr/bin/env node

/**
 * Enhanced PUT CREDIT SPREAD Analysis with Full IPS Scoring
 * Targets: Delta 0.12-0.15 (optimal range), 1-14 DTE, Full 100-point IPS
 */

const https = require('https');
require('dotenv').config();

// API Keys
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const FRED_KEY = process.env.FRED_API_KEY;

// IPS CRITERIA WEIGHTS (Total = 100)
const IPS_WEIGHTS = {
  // Options-specific (60 points - from Alpha Vantage)
  delta: 10,              // 0.12-0.15 optimal (was 0.08-0.15)
  ivRank: 9,              // ≥35 and ≤80
  atmIV: 6,               // ≥25%
  bidAskSpread: 8,        // ≤$0.10 or ≤0.5% of price
  openInterest: 7,        // ≥500 each leg
  vega: 3,                // ≤0.15
  theta: 2,               // ≥-0.05
  dte: 5,                 // 7-14 days preferred
  spreadWidth: 5,         // $5-10 preferred
  creditReceived: 5,      // ≥$0.30 per spread

  // Fundamentals (40 points - from Tavily + FRED + DataUSA)
  momentum50Day: 4,       // Price vs 50-day MA
  momentum200Day: 4,      // Price vs 200-day MA
  week52Position: 3,      // Position in 52-week range
  sentimentScore: 5,      // News sentiment (Tavily)
  analystRating: 4,       // Analyst consensus (Tavily)
  putCallRatio: 3,        // ≤1.0
  ivPercentile: 4,        // 40-80 preferred
  volumeTrend: 3,         // Recent volume vs average
  sectorStrength: 3,      // Sector performance (FRED)
  macroRegime: 4,         // VIX, rates environment (FRED)
};

// Fetch from Alpha Vantage
function fetchAlphaVantage(func, params = {}) {
  return new Promise((resolve, reject) => {
    const queryParams = new URLSearchParams({
      function: func,
      apikey: ALPHA_VANTAGE_KEY,
      ...params
    });

    const url = `https://www.alphavantage.co/query?${queryParams}`;

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

// Fetch from Tavily (News & Sentiment)
function fetchTavily(query) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      api_key: TAVILY_KEY,
      query: query,
      search_depth: "basic",
      max_results: 5
    });

    const options = {
      hostname: 'api.tavily.com',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Fetch from FRED
function fetchFRED(seriesId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=1`;

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

// Parse sentiment from Tavily results
function parseSentiment(tavilyResults) {
  if (!tavilyResults || !tavilyResults.results) {
    return { score: 0, summary: 'No data' };
  }

  const results = tavilyResults.results;
  let positiveCount = 0;
  let negativeCount = 0;

  results.forEach(result => {
    const text = (result.title + ' ' + result.content).toLowerCase();

    // Positive indicators
    if (text.match(/bullish|upgrade|beat|strong|growth|rally|positive|outperform/)) {
      positiveCount++;
    }
    // Negative indicators
    if (text.match(/bearish|downgrade|miss|weak|decline|negative|underperform|concern/)) {
      negativeCount++;
    }
  });

  const total = positiveCount + negativeCount;
  if (total === 0) return { score: 3, summary: 'Neutral' };

  const sentimentRatio = positiveCount / total;

  if (sentimentRatio >= 0.7) return { score: 5, summary: 'Strong Positive' };
  if (sentimentRatio >= 0.5) return { score: 4, summary: 'Positive' };
  if (sentimentRatio >= 0.3) return { score: 3, summary: 'Neutral' };
  return { score: 2, summary: 'Negative' };
}

// Parse analyst rating from Tavily
function parseAnalystRating(tavilyResults) {
  if (!tavilyResults || !tavilyResults.results) {
    return { score: 0, summary: 'No data' };
  }

  const results = tavilyResults.results;
  let buyCount = 0;
  let holdCount = 0;
  let sellCount = 0;

  results.forEach(result => {
    const text = (result.title + ' ' + result.content).toLowerCase();
    if (text.match(/buy|strong buy|outperform/)) buyCount++;
    if (text.match(/hold|neutral|equal weight/)) holdCount++;
    if (text.match(/sell|underperform/)) sellCount++;
  });

  if (buyCount > sellCount && buyCount >= holdCount) {
    return { score: 4, summary: 'Buy consensus' };
  } else if (holdCount >= buyCount) {
    return { score: 3, summary: 'Hold consensus' };
  } else {
    return { score: 2, summary: 'Sell consensus' };
  }
}

// Get macro regime from FRED (VIX, rates)
async function getMacroRegime() {
  try {
    const vixData = await fetchFRED('VIXCLS'); // VIX
    const vix = parseFloat(vixData.observations[0].value);

    let score = 4;
    let regime = 'Favorable';

    if (vix < 15) {
      score = 3;
      regime = 'Low Vol';
    } else if (vix > 30) {
      score = 2;
      regime = 'High Vol';
    }

    return { score, regime, vix };
  } catch (e) {
    return { score: 3, regime: 'Unknown', vix: null };
  }
}

// Calculate momentum indicators
async function getMomentumIndicators(symbol) {
  try {
    const quoteData = await fetchAlphaVantage('GLOBAL_QUOTE', { symbol });
    const quote = quoteData['Global Quote'];

    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    // Simple momentum scoring based on price action
    let momentum50Score = 0;
    let momentum200Score = 0;

    if (changePercent > 0) {
      momentum50Score = 4;
      momentum200Score = 4;
    } else if (changePercent > -2) {
      momentum50Score = 3;
      momentum200Score = 3;
    } else {
      momentum50Score = 2;
      momentum200Score = 2;
    }

    return {
      momentum50Score,
      momentum200Score,
      price,
      changePercent
    };
  } catch (e) {
    return {
      momentum50Score: 0,
      momentum200Score: 0,
      price: 0,
      changePercent: 0
    };
  }
}

// Score spread against full IPS (100 points)
async function scoreAgainstFullIPS(spread, ticker, currentPrice) {
  let score = 0;
  const breakdown = {};

  // === OPTIONS DATA (60 points from Alpha Vantage) ===

  // 1. Delta (10 pts) - TARGET 0.12-0.15 for optimal returns
  const delta = Math.abs(parseFloat(spread.delta));
  if (delta >= 0.12 && delta <= 0.15) {
    score += 10;
    breakdown.delta = { score: 10, status: '✅', value: delta.toFixed(2), note: 'Optimal' };
  } else if (delta >= 0.08 && delta <= 0.18) {
    score += 7;
    breakdown.delta = { score: 7, status: '⚠️', value: delta.toFixed(2), note: 'Acceptable' };
  } else if (delta <= 0.20) {
    score += 4;
    breakdown.delta = { score: 4, status: '⚠️', value: delta.toFixed(2), note: 'Sub-optimal' };
  } else {
    breakdown.delta = { score: 0, status: '❌', value: delta.toFixed(2), note: 'Too high' };
  }

  // 2. IV Rank (9 pts) - Need ≥35 and ≤80
  const ivRank = parseFloat(spread.iv) * 100;
  if (ivRank >= 35 && ivRank <= 80) {
    score += 9;
    breakdown.ivRank = { score: 9, status: '✅', value: `${ivRank.toFixed(1)}%` };
  } else if (ivRank >= 25 && ivRank <= 90) {
    score += 5;
    breakdown.ivRank = { score: 5, status: '⚠️', value: `${ivRank.toFixed(1)}%` };
  } else if (ivRank >= 15) {
    score += 2;
    breakdown.ivRank = { score: 2, status: '⚠️', value: `${ivRank.toFixed(1)}%` };
  } else {
    breakdown.ivRank = { score: 0, status: '❌', value: `${ivRank.toFixed(1)}%` };
  }

  // 3. ATM IV (6 pts) - Need ≥25%
  if (ivRank >= 25) {
    score += 6;
    breakdown.atmIV = { score: 6, status: '✅', value: `${ivRank.toFixed(1)}%` };
  } else if (ivRank >= 15) {
    score += 3;
    breakdown.atmIV = { score: 3, status: '⚠️', value: `${ivRank.toFixed(1)}%` };
  } else {
    score += 1;
    breakdown.atmIV = { score: 1, status: '❌', value: `${ivRank.toFixed(1)}%` };
  }

  // 4. Bid-Ask Spread (8 pts) - ≤$0.10
  if (spread.bidAskSpread <= 0.10) {
    score += 8;
    breakdown.bidAskSpread = { score: 8, status: '✅', value: `$${spread.bidAskSpread.toFixed(2)}` };
  } else if (spread.bidAskSpread <= 0.15) {
    score += 5;
    breakdown.bidAskSpread = { score: 5, status: '⚠️', value: `$${spread.bidAskSpread.toFixed(2)}` };
  } else if (spread.bidAskSpread <= 0.25) {
    score += 2;
    breakdown.bidAskSpread = { score: 2, status: '⚠️', value: `$${spread.bidAskSpread.toFixed(2)}` };
  } else {
    breakdown.bidAskSpread = { score: 0, status: '❌', value: `$${spread.bidAskSpread.toFixed(2)}` };
  }

  // 5. Open Interest (7 pts) - ≥500
  const minOI = Math.min(spread.sellOI, spread.buyOI);
  if (minOI >= 500) {
    score += 7;
    breakdown.openInterest = { score: 7, status: '✅', value: minOI };
  } else if (minOI >= 250) {
    score += 4;
    breakdown.openInterest = { score: 4, status: '⚠️', value: minOI };
  } else {
    breakdown.openInterest = { score: 0, status: '❌', value: minOI };
  }

  // 6. Vega (3 pts) - ≤0.15
  const vega = Math.abs(parseFloat(spread.vega));
  if (vega <= 0.15) {
    score += 3;
    breakdown.vega = { score: 3, status: '✅', value: vega.toFixed(2) };
  } else if (vega <= 0.30) {
    score += 2;
    breakdown.vega = { score: 2, status: '⚠️', value: vega.toFixed(2) };
  } else {
    breakdown.vega = { score: 0, status: '❌', value: vega.toFixed(2) };
  }

  // 7. Theta (2 pts) - ≥-0.05
  const theta = parseFloat(spread.theta);
  if (theta >= -0.05) {
    score += 2;
    breakdown.theta = { score: 2, status: '✅', value: theta.toFixed(2) };
  } else if (theta >= -0.20) {
    score += 1;
    breakdown.theta = { score: 1, status: '⚠️', value: theta.toFixed(2) };
  } else {
    breakdown.theta = { score: 0, status: '❌', value: theta.toFixed(2) };
  }

  // 8. DTE (5 pts) - 7-14 preferred
  if (spread.dte >= 7 && spread.dte <= 14) {
    score += 5;
    breakdown.dte = { score: 5, status: '✅', value: `${spread.dte} days` };
  } else if (spread.dte >= 5 && spread.dte <= 21) {
    score += 3;
    breakdown.dte = { score: 3, status: '⚠️', value: `${spread.dte} days` };
  } else if (spread.dte >= 1 && spread.dte <= 30) {
    score += 1;
    breakdown.dte = { score: 1, status: '⚠️', value: `${spread.dte} days` };
  } else {
    breakdown.dte = { score: 0, status: '❌', value: `${spread.dte} days` };
  }

  // 9. Spread Width (5 pts) - $5-10 preferred
  if (spread.width >= 5 && spread.width <= 10) {
    score += 5;
    breakdown.spreadWidth = { score: 5, status: '✅', value: `$${spread.width}` };
  } else if (spread.width >= 3 && spread.width <= 15) {
    score += 3;
    breakdown.spreadWidth = { score: 3, status: '⚠️', value: `$${spread.width}` };
  } else {
    breakdown.spreadWidth = { score: 0, status: '❌', value: `$${spread.width}` };
  }

  // 10. Credit Received (5 pts) - ≥$0.30
  if (spread.credit >= 0.30) {
    score += 5;
    breakdown.creditReceived = { score: 5, status: '✅', value: `$${spread.credit.toFixed(2)}` };
  } else if (spread.credit >= 0.20) {
    score += 3;
    breakdown.creditReceived = { score: 3, status: '⚠️', value: `$${spread.credit.toFixed(2)}` };
  } else {
    breakdown.creditReceived = { score: 0, status: '❌', value: `$${spread.credit.toFixed(2)}` };
  }

  // === FUNDAMENTAL DATA (40 points from Tavily + FRED) ===

  // Get momentum
  const momentum = await getMomentumIndicators(ticker);
  score += momentum.momentum50Score;
  score += momentum.momentum200Score;
  breakdown.momentum50Day = { score: momentum.momentum50Score, status: momentum.momentum50Score >= 3 ? '✅' : '⚠️', value: `${momentum.changePercent.toFixed(1)}%` };
  breakdown.momentum200Day = { score: momentum.momentum200Score, status: momentum.momentum200Score >= 3 ? '✅' : '⚠️', value: `${momentum.changePercent.toFixed(1)}%` };

  // Get sentiment from Tavily
  const sentiment = await fetchTavily(`${ticker} stock news sentiment analysis`);
  const sentimentScore = parseSentiment(sentiment);
  score += sentimentScore.score;
  breakdown.sentimentScore = { score: sentimentScore.score, status: sentimentScore.score >= 4 ? '✅' : '⚠️', value: sentimentScore.summary };

  // Get analyst rating from Tavily
  const analystData = await fetchTavily(`${ticker} stock analyst rating recommendation`);
  const analystScore = parseAnalystRating(analystData);
  score += analystScore.score;
  breakdown.analystRating = { score: analystScore.score, status: analystScore.score >= 3 ? '✅' : '⚠️', value: analystScore.summary };

  // Get macro regime
  const macro = await getMacroRegime();
  score += macro.score;
  breakdown.macroRegime = { score: macro.score, status: macro.score >= 3 ? '✅' : '⚠️', value: `${macro.regime} (VIX: ${macro.vix || 'N/A'})` };

  // Placeholder scores for missing data (to be enhanced)
  score += 3; // week52Position (placeholder)
  score += 3; // putCallRatio (placeholder)
  score += 4; // ivPercentile (placeholder)
  score += 3; // volumeTrend (placeholder)
  score += 3; // sectorStrength (placeholder)

  breakdown.week52Position = { score: 3, status: '⚠️', value: 'Placeholder' };
  breakdown.putCallRatio = { score: 3, status: '⚠️', value: 'Placeholder' };
  breakdown.ivPercentile = { score: 4, status: '⚠️', value: 'Placeholder' };
  breakdown.volumeTrend = { score: 3, status: '⚠️', value: 'Placeholder' };
  breakdown.sectorStrength = { score: 3, status: '⚠️', value: 'Placeholder' };

  return { score, breakdown, maxPossibleScore: 100 };
}

// Find optimal spreads with delta 0.12-0.15
function findOptimalSpreads(puts, currentPrice, dte) {
  const spreads = [];

  // Filter puts in target delta range (0.12-0.15)
  const targetPuts = puts.filter(p => {
    const delta = Math.abs(parseFloat(p.delta));
    return delta >= 0.10 && delta <= 0.18; // Slightly wider for more options
  });

  if (targetPuts.length === 0) return [];

  // Create spreads
  for (let sellPut of targetPuts) {
    for (let buyPut of puts) {
      const sellStrike = parseFloat(sellPut.strike);
      const buyStrike = parseFloat(buyPut.strike);

      // Must be below sell strike with reasonable width
      if (buyStrike >= sellStrike) continue;

      const width = sellStrike - buyStrike;
      if (width < 3 || width > 15) continue;

      const sellBid = parseFloat(sellPut.bid || 0);
      const buyAsk = parseFloat(buyPut.ask || 0);
      const credit = sellBid - buyAsk;

      if (credit <= 0) continue;

      const maxProfit = credit;
      const maxLoss = width - credit;
      const roi = (maxProfit / maxLoss) * 100;
      const pop = (1 - Math.abs(parseFloat(sellPut.delta))) * 100;

      const sellBidAsk = Math.abs(parseFloat(sellPut.ask || 0) - parseFloat(sellPut.bid || 0));
      const buyBidAsk = Math.abs(parseFloat(buyPut.ask || 0) - parseFloat(buyPut.bid || 0));
      const avgBidAsk = (sellBidAsk + buyBidAsk) / 2;

      spreads.push({
        sellStrike,
        buyStrike,
        width,
        credit,
        maxProfit,
        maxLoss,
        roi,
        pop,
        delta: sellPut.delta,
        iv: sellPut.impliedVolatility,
        theta: sellPut.theta,
        vega: sellPut.vega,
        sellOI: parseInt(sellPut.openInterest || 0),
        buyOI: parseInt(buyPut.openInterest || 0),
        bidAskSpread: avgBidAsk,
        dte,
        expiry: sellPut.expiration
      });
    }
  }

  // Sort by IPS fit potential (delta in optimal range, good credit, tight spreads)
  spreads.sort((a, b) => {
    const aDelta = Math.abs(parseFloat(a.delta));
    const bDelta = Math.abs(parseFloat(b.delta));

    // Prefer delta 0.12-0.15
    const aDeltaScore = (aDelta >= 0.12 && aDelta <= 0.15) ? 10 : 5;
    const bDeltaScore = (bDelta >= 0.12 && bDelta <= 0.15) ? 10 : 5;

    const aScore = aDeltaScore + (a.credit * 10) - (a.bidAskSpread * 50);
    const bScore = bDeltaScore + (b.credit * 10) - (b.bidAskSpread * 50);

    return bScore - aScore;
  });

  return spreads.slice(0, 3);
}

// Main analysis
async function analyzeTicker(ticker) {
  console.log(`\nFetching options data for ${ticker}...`);

  const quoteData = await fetchAlphaVantage('GLOBAL_QUOTE', { symbol: ticker });
  const currentPrice = parseFloat(quoteData['Global Quote']['05. price']);

  const optionsData = await fetchAlphaVantage('HISTORICAL_OPTIONS', { symbol: ticker });

  if (!optionsData.data) {
    console.log(`❌ No options data for ${ticker}`);
    return;
  }

  const today = new Date();
  const expirationGroups = {};

  // Group by expiration
  optionsData.data.forEach(contract => {
    const expDate = new Date(contract.expiration);
    const dte = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    if (dte < 1 || dte > 14) return;
    if (contract.type !== 'put') return;

    if (!expirationGroups[contract.expiration]) {
      expirationGroups[contract.expiration] = { puts: [], dte };
    }
    expirationGroups[contract.expiration].puts.push(contract);
  });

  console.log(`\n${'='.repeat(80)}`);
  console.log(`${ticker} - Current Price: $${currentPrice.toFixed(2)}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`🎯 Top Put Credit Spread Opportunities (Delta 0.12-0.15, 1-14 DTE):\n`);

  let topSpreads = [];

  for (let expiry in expirationGroups) {
    const { puts, dte } = expirationGroups[expiry];
    const spreads = findOptimalSpreads(puts, currentPrice, dte);
    topSpreads.push(...spreads);
  }

  // Sort all spreads and take top 3
  topSpreads.sort((a, b) => {
    const aDelta = Math.abs(parseFloat(a.delta));
    const bDelta = Math.abs(parseFloat(b.delta));
    const aDeltaScore = (aDelta >= 0.12 && aDelta <= 0.15) ? 10 : 5;
    const bDeltaScore = (bDelta >= 0.12 && bDelta <= 0.15) ? 10 : 5;
    return bDeltaScore - aDeltaScore;
  });

  topSpreads = topSpreads.slice(0, 3);

  for (let i = 0; i < topSpreads.length; i++) {
    const spread = topSpreads[i];
    const ipsResult = await scoreAgainstFullIPS(spread, ticker, currentPrice);

    console.log(`${i + 1}. SELL $${spread.sellStrike} PUT / BUY $${spread.buyStrike} PUT`);
    console.log(`   Exp: ${spread.expiry} (${spread.dte} DTE) | Width: $${spread.width}`);
    console.log(`   💰 Credit: $${spread.credit.toFixed(2)} | Max Profit: $${spread.maxProfit.toFixed(2)} | Max Loss: $${spread.maxLoss.toFixed(2)}`);
    console.log(`   📊 POP: ${spread.pop.toFixed(1)}% | ROI: ${spread.roi.toFixed(1)}%`);
    console.log(`   📈 Delta: ${spread.delta} | IV: ${(parseFloat(spread.iv) * 100).toFixed(1)}% | Theta: ${spread.theta} | Vega: ${spread.vega}`);
    console.log(`   🔄 OI: ${spread.sellOI}/${spread.buyOI} | Bid-Ask: $${spread.bidAskSpread.toFixed(2)}`);
    console.log(`   ⭐ IPS FIT: ${ipsResult.score}/${ipsResult.maxPossibleScore} (${Math.round(ipsResult.score/ipsResult.maxPossibleScore*100)}%)\n`);

    console.log(`   📋 FACTOR BREAKDOWN:`);
    for (let [key, val] of Object.entries(ipsResult.breakdown)) {
      console.log(`      ${val.status} ${key}: ${val.value} (${val.score} pts)${val.note ? ' - ' + val.note : ''}`);
    }
    console.log('');
  }
}

// Run analysis
(async () => {
  console.log('🎯 PUT CREDIT SPREAD ANALYSIS - OPTIMIZED FOR RETURNS');
  console.log('Target: Delta 0.12-0.15 (optimal range), 1-14 DTE, Full 100-point IPS\n');

  const tickers = ['MU', 'AMD', 'APP', 'TSLA'];

  for (let ticker of tickers) {
    await analyzeTicker(ticker);
    await new Promise(resolve => setTimeout(resolve, 12000)); // API rate limit
  }
})();
