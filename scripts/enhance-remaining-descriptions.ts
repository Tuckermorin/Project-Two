import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const moreDescriptions = [
  // More calculated factors
  {
    id: 'calc-dist-vwap',
    description: 'Distance from Volume Weighted Average Price - institutional benchmark. Near VWAP (±0.5%) = fair value; far from VWAP suggests potential reversion. Institutions use VWAP for execution quality. Intraday: price above VWAP = bullish, below = bearish.'
  },
  {
    id: 'calc-dist-wma-20',
    description: '20-day Weighted Moving Average distance - recent prices weighted heavier. More responsive than SMA but less than EMA. Useful for: trend following with reduced lag. Similar interpretation to EMA distance but smoother response to recent changes.'
  },
  {
    id: 'calc-dist-dema',
    description: 'Double Exponential Moving Average distance - reduced lag indicator. Faster response to price changes than regular EMA. Popular for: active trading and reducing whipsaw in choppy markets. Large deviations (>8%) often revert quickly.'
  },
  {
    id: 'calc-dist-tema',
    description: 'Triple Exponential Moving Average distance - minimal lag. Fastest response of MA family. Tracks price closely but prone to false signals in sideways markets. Best used: in strong trending markets for early entry/exit signals.'
  },
  {
    id: 'calc-dist-bb-upper',
    description: 'Distance to Bollinger Band upper limit. Near upper band (<2%) = potential reversal or strong trend. Walking the upper band = strength. Breakouts above upper band often lead to continuation. Use for: identifying overextended moves.'
  },
  {
    id: 'calc-dist-bb-lower',
    description: 'Distance to Bollinger Band lower limit. Near lower band (<2%) = oversold or weakness. Bounces from lower band = reversal opportunity. Walking lower band = downtrend. Key for: finding support levels and oversold bounces.'
  },
  {
    id: 'calc-bb-width-pct',
    description: 'Bollinger Band width as % of price - volatility indicator. Narrow bands (<2%) = consolidation before breakout; wide bands (>8%) = high volatility, potential exhaustion. Squeeze followed by expansion signals new trends. Critical for: volatility breakout strategies.'
  },
  {
    id: 'calc-volume-surge',
    description: 'Volume increase vs. average %. >100% (2x) = significant interest; >200% (3x) = unusual activity likely news-driven. Volume spikes validate breakouts. Low volume moves (negative %) lack conviction. Essential for: confirming price action.'
  },
  {
    id: 'calc-ma-slope-20',
    description: '20-MA slope - short-term trend direction and strength. Positive slope = uptrend; negative = downtrend. Steeper slope = stronger trend. Flattening slope warns of trend weakening. Use for: trend strength assessment and early reversal detection.'
  },
  {
    id: 'calc-ma-slope-50',
    description: '50-MA slope - medium-term trend momentum. Rising slope confirms uptrend; falling confirms downtrend. Slope change precedes price reversal. Combine with price position vs. MA for optimal entries. Key for: determining trend health.'
  },
  {
    id: 'calc-put-call-volume-ratio',
    description: 'Put volume / call volume - sentiment gauge. >1.5 = extreme fear (contrarian bullish); <0.5 = extreme greed (contrarian bearish). Near 1.0 = neutral. Spikes often mark turning points. Use cautiously: hedging affects ratio.'
  },
  {
    id: 'calc-put-call-oi-ratio',
    description: 'Put OI / call OI - longer-term sentiment vs. volume ratio. >1.2 = bearish positioning; <0.8 = bullish. Changes over time show sentiment shifts. More stable than volume ratio. Useful for: identifying major sentiment changes.'
  },

  // More Alpha Vantage factors
  {
    id: 'av-52-week-high',
    description: 'Highest price in past year - resistance level. Testing 52W high often triggers breakouts or rejections. Breaking above = bullish signal, institutional buying. Stalling near high = potential distribution. Compare to distance from high for context.'
  },
  {
    id: 'av-52-week-low',
    description: 'Lowest price in past year - support level. Testing 52W low = distressed or value opportunity. Breaking below = bearish breakdown. Bouncing from low = potential reversal. Context matters: fundamentals improving or deteriorating?'
  },
  {
    id: 'av-eps',
    description: 'Earnings Per Share - fundamental profitability metric. Growing EPS = healthy business; declining = problems. Compare to estimates: beats drive stock higher, misses cause drops. Quarter-over-quarter growth more relevant than absolute value. Foundation of P/E ratio.'
  },
  {
    id: 'av-diluted-eps-ttm',
    description: 'Diluted EPS includes all convertible securities - more conservative measure. Lower than basic EPS due to share dilution. Important for: companies with stock options, convertible debt. Shows true per-share earnings after potential dilution.'
  },
  {
    id: 'av-revenue-ttm',
    description: 'Trailing twelve months revenue - top-line growth measure. Growing revenue essential for long-term success. Revenue without profit = unsustainable. Compare to expectations and prior periods. Declining revenue = major red flag unless strategic shift.'
  },
  {
    id: 'av-analyst-target',
    description: 'Consensus price target from Wall Street analysts. Large discount to target (>20%) = potential upside or overly bullish analysts. Premium to target = expensive or pessimistic analysts. Useful context but lag market moves - don\'t rely solely on targets.'
  },

  // Financial ratios
  {
    id: 'calc-working-capital',
    description: 'Current assets minus current liabilities - operating liquidity. Positive = can fund operations; negative = potential cash crunch. Declining working capital = warning sign. Critical for: assessing short-term financial flexibility and bankruptcy risk.'
  },
  {
    id: 'calc-interest-coverage',
    description: 'EBIT / interest expense - ability to service debt. >3 = comfortable; <2 = risky; <1 = cannot cover interest (distress). Rising coverage = improving health. Essential for: evaluating financial stability and default risk.'
  },

  // More calculated factors
  {
    id: 'calc-asset-turnover',
    description: 'Revenue / total assets - asset utilization efficiency. Higher = more efficient asset use. Varies by industry: retail high, utilities low. Declining turnover = deteriorating efficiency or poor capital allocation. Use for: comparing operational efficiency.'
  },
  {
    id: 'calc-inventory-turnover',
    description: 'COGS / average inventory - inventory management efficiency. Higher = faster selling inventory, less capital tied up. Too high = stock-outs risk; too low = excess inventory, obsolescence. Retail 6-12x typical. Key for: assessing working capital efficiency.'
  },
  {
    id: 'calc-receivables-turnover',
    description: 'Revenue / average receivables - collection efficiency. Higher = faster payment collection, better cash flow. Declining turnover = payment issues, credit quality deterioration. Compare to industry and payment terms. Critical for: cash flow assessment.'
  },

  // Economic indicators
  {
    id: 'av-treasury-3m',
    description: '3-month Treasury yield - risk-free rate and Fed policy indicator. Rising = tightening monetary policy; falling = easing. Inverted curve (3M > 10Y) historically predicts recessions. Affects option pricing (rho). Important macro context for all trades.'
  },
  {
    id: 'av-treasury-2y',
    description: '2-year Treasury yield - Fed expectations for next 2 years. Most sensitive to Fed policy changes. Spread to 10Y (yield curve) indicates growth expectations. Inversion = recession warning. Key for: understanding market\'s Fed expectations.'
  },
  {
    id: 'av-treasury-10y',
    description: '10-year Treasury yield - long-term growth and inflation expectations. Benchmark for mortgages, corporate borrowing. Rising = stocks (especially growth) under pressure; falling = stocks benefit. Critical macro indicator affecting all asset classes.'
  },
];

async function enhanceRemaining() {
  console.log('Enhancing remaining factor descriptions...\n');

  let updated = 0;

  for (const { id, description } of moreDescriptions) {
    const { error } = await supabase
      .from('factor_definitions')
      .update({ description })
      .eq('id', id);

    if (error) {
      console.error(`❌ Error updating ${id}:`, error.message);
    } else {
      console.log(`✓ Enhanced ${id}`);
      updated++;
    }
  }

  console.log(`\n✅ Enhanced ${updated} more factor descriptions!`);
}

enhanceRemaining();
