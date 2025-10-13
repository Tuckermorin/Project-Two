import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const enhancedDescriptions = [
  // Options Greeks
  {
    id: 'opt-delta',
    description: 'Measures how much an option\'s price changes per $1 move in the underlying stock. Delta ranges from 0 to 1 for calls (-1 to 0 for puts). Higher delta means greater directional exposure. Use for: estimating position sensitivity and determining strike selection.'
  },
  {
    id: 'opt-gamma',
    description: 'Rate of change of Delta - shows how quickly your directional exposure changes. High gamma near expiration creates risk of rapid position changes. Critical for: understanding acceleration of gains/losses and managing gamma risk in short positions.'
  },
  {
    id: 'opt-theta',
    description: 'Time decay - dollar amount lost per day as expiration approaches. Always negative for long options. Higher theta accelerates near expiration. Key insight: selling high theta options generates income, but buying them fights time decay.'
  },
  {
    id: 'opt-vega',
    description: 'Sensitivity to implied volatility changes. $1 change per 1% IV move. Long options benefit from rising IV (vega positive), short options profit from falling IV. Essential for: volatility trading and understanding risk beyond price movement.'
  },
  {
    id: 'opt-rho',
    description: 'Sensitivity to interest rate changes. Generally small impact except for long-dated options. Positive for calls, negative for puts. Less critical for most retail strategies but relevant in high-rate environments.'
  },

  // Options Metrics
  {
    id: 'opt-iv',
    description: 'Market\'s expectation of future volatility derived from option prices. Higher IV = more expensive options. Compare to historical volatility to find mispricings. High IV favors selling strategies; low IV favors buying strategies.'
  },
  {
    id: 'opt-intrinsic-value',
    description: 'In-the-money amount - difference between strike and stock price (if favorable). Zero for out-of-the-money options. Important: Only intrinsic value is guaranteed at expiration; time value evaporates.'
  },
  {
    id: 'opt-time-value',
    description: 'Premium beyond intrinsic value - represents probability of further profit. Highest for at-the-money options. Decays to zero at expiration. Key consideration: time value is what you\'re buying/selling in most strategies.'
  },
  {
    id: 'opt-open-interest',
    description: 'Total outstanding contracts. High OI = liquid market with tight spreads. Low OI = harder to enter/exit with potential price slippage. Minimum 100+ OI recommended for active trading. Use for: ensuring position liquidity.'
  },
  {
    id: 'opt-volume',
    description: 'Contracts traded today. High volume relative to OI suggests active interest or position changes. Unusual volume can signal institutional activity or upcoming events. Compare to average volume for anomaly detection.'
  },
  {
    id: 'opt-bid-ask-spread',
    description: 'Difference between bid and ask as % of mid-price. Tight spreads (<5%) indicate liquid markets with lower transaction costs. Wide spreads (>10%) can erode profits. Critical for: calculating actual entry/exit costs.'
  },
  {
    id: 'opt-put-call-ratio',
    description: 'Put volume/OI divided by call volume/OI. >1 suggests bearish sentiment; <1 bullish. Extreme readings can indicate contrarian opportunities. Context matters: hedging vs. speculation affects interpretation.'
  },

  // Calculated Relative Factors
  {
    id: 'calc-dist-52w-high',
    description: 'How far below 52-week high (%). Near 52W high (0-5%) may face resistance or signal strength. Far from high (>20%) could indicate oversold or downtrend. Use for: identifying potential reversals or continuation patterns.'
  },
  {
    id: 'calc-dist-52w-low',
    description: 'How far above 52-week low (%). Near 52W low (0-5%) may signal weakness or bounce opportunity. Far from low (>50%) indicates recovery or uptrend. Context: combine with trend indicators for confirmation.'
  },
  {
    id: 'calc-52w-range-position',
    description: 'Position within 52-week range (0-100%). >80% = upper range (potential resistance); <20% = lower range (potential support). 50% = mid-range consolidation. Useful for: mean reversion strategies.'
  },
  {
    id: 'calc-dist-ema-20',
    description: 'Distance from 20-day EMA - short-term trend indicator. >5% above suggests overbought; >5% below oversold. Price respecting EMA signals strong trend. Use for: identifying pullback entries in trending markets.'
  },
  {
    id: 'calc-dist-ema-50',
    description: 'Distance from 50-day EMA - medium-term trend strength. Above = bullish; below = bearish. Large deviations (>10%) often revert. Popular support/resistance level. Key for: swing trading and trend confirmation.'
  },
  {
    id: 'calc-dist-ema-200',
    description: 'Distance from 200-day EMA - long-term trend indicator. Above = bull market; below = bear market. Crossing 200 EMA is significant. Wide divergences unsustainable. Essential for: determining overall market context.'
  },
  {
    id: 'calc-bb-position',
    description: 'Position within Bollinger Bands (0-100%). >80% = near upper band (potentially overbought); <20% = near lower band (potentially oversold). Walking the bands signals strong trends. Use for: volatility-based entries.'
  },
  {
    id: 'calc-atr-pct',
    description: 'Average True Range as % of price - normalized volatility measure. Higher = more volatile (wider stops needed). Compare to historical levels: high ATR% suggests caution; low ATR% may precede expansion. Critical for: position sizing.'
  },
  {
    id: 'calc-iv-rank',
    description: 'Current IV relative to 52-week range (0-100). >50 = elevated IV (favor selling); <50 = low IV (favor buying). Extreme levels (>80 or <20) suggest mean reversion opportunities. Best practice: sell high IV rank, buy low IV rank.'
  },
  {
    id: 'calc-iv-percentile',
    description: 'Percentage of days IV was lower in past year. 75th percentile = IV higher than 75% of days. Better than IV rank for distributions with outliers. Use for: comparing IV levels across different time periods.'
  },
  {
    id: 'calc-volume-vs-avg',
    description: 'Today\'s volume / average volume ratio. >2x suggests unusual activity (news, institutional interest). <0.5x indicates low interest. Spikes often precede significant moves. Watch for: volume confirmation of price action.'
  },
  {
    id: 'calc-dist-target-price',
    description: 'Distance to analyst consensus target. Large gap (>20%) suggests potential upside or overly optimistic analysts. Negative = above target (possible overvaluation). Useful context but combine with other factors - analysts lag markets.'
  },
  {
    id: 'calc-market-cap-category',
    description: 'Size classification: 1=Micro (<$300M), 2=Small ($300M-$2B), 3=Mid ($2B-$10B), 4=Large ($10B-$200B), 5=Mega (>$200B). Larger = more stable but slower growth. Smaller = higher risk/reward. Important for: portfolio diversification and risk management.'
  },

  // Valuation
  {
    id: 'av-pe-ratio',
    description: 'Price to Earnings - how much you pay per $1 of earnings. <15 typically cheap; >25 expensive. Compare to sector average and growth rate. High P/E justified if high growth. Negative P/E = company losing money. Key metric for value investing.'
  },
  {
    id: 'av-peg-ratio',
    description: 'P/E divided by growth rate. <1 = undervalued relative to growth; >2 = potentially overvalued. Balances valuation with growth. Only useful for growing companies. Superior to P/E alone for growth stocks. Sweet spot: 0.5-1.5.'
  },
  {
    id: 'av-market-cap',
    description: 'Total company value (price × shares). Determines company size category and liquidity. Large caps more stable; small caps higher growth potential. Critical for: risk assessment and position sizing relative to portfolio.'
  },
  {
    id: 'av-book-value',
    description: 'Net asset value per share (assets - liabilities). Price below book value = potential value play. Book value matters more for asset-heavy businesses than tech/service companies. Use for: finding deeply undervalued stocks.'
  },

  // Profitability
  {
    id: 'av-profit-margin',
    description: 'Net income / revenue - bottom line efficiency. >20% excellent; <5% concerning. Higher margins = better pricing power and efficiency. Compare to competitors and historical levels. Trend matters: improving margins bullish signal.'
  },
  {
    id: 'av-operating-margin',
    description: 'Operating income / revenue - core business profitability before interest/taxes. Shows operational efficiency. Stable/rising margins indicate competitive advantages. Compare to industry: varies widely by sector (tech high, retail low).'
  },
  {
    id: 'av-gross-profit-ttm',
    description: 'Revenue minus cost of goods sold. Foundation of profitability. High gross profit essential for covering overhead and delivering net profit. Declining gross profit signals pricing pressure or rising input costs - red flag.'
  },

  // Efficiency
  {
    id: 'av-return-on-assets',
    description: 'Net income / total assets - how efficiently company uses assets to generate profit. >5% good; >10% excellent. Asset-light businesses (software) have higher ROA. Compare within industry. Declining ROA suggests deteriorating efficiency.'
  },
  {
    id: 'av-return-on-equity',
    description: 'Net income / shareholder equity - return on invested capital. >15% good; >20% excellent. High ROE with reasonable debt = strong business. Artificially high ROE via excessive debt = risky. Key metric for long-term wealth creation.'
  },

  // Growth
  {
    id: 'av-quarterly-earnings-growth',
    description: 'YoY earnings growth - profit momentum. >20% = strong growth; negative = contracting. Consistent growth valuable; volatile growth risky. Compare to revenue growth: earnings growing faster than revenue = margin expansion (bullish).'
  },
  {
    id: 'av-quarterly-revenue-growth',
    description: 'YoY revenue growth - top-line momentum. >15% = rapid growth; <5% = mature/slowing. Revenue quality matters: organic vs. acquisitions. Decelerating growth often precedes stock weakness. Essential for growth investing.'
  },

  // Dividends
  {
    id: 'av-dividend-yield',
    description: 'Annual dividend / stock price. >4% = high yield (verify sustainability); <2% = growth focus. High yield can signal value or distress - check payout ratio. Rising dividends historically outperform. Balance: yield vs. growth potential.'
  },

  // Technical
  {
    id: 'av-50-day-ma',
    description: '50-day average price - medium-term trend. Price above = bullish; below = bearish. Often acts as support in uptrends, resistance in downtrends. Golden cross (50 above 200) = bullish; death cross = bearish. Widely watched by institutions.'
  },
  {
    id: 'av-200-day-ma',
    description: '200-day average - long-term trend benchmark. Separates bull (above) from bear (below) markets. Strong support/resistance level. Crossing 200-MA triggers algorithmic buying/selling. Most reliable moving average for trend following.'
  },

  // Volatility
  {
    id: 'av-beta',
    description: 'Volatility vs. market (S&P 500 = 1.0). >1.5 = high volatility (larger swings); <0.7 = defensive. High beta amplifies gains/losses. Important for: portfolio risk management and position sizing. Defensive stocks have low beta.'
  },

  // Financial Health
  {
    id: 'calc-current-ratio',
    description: 'Current assets / current liabilities - short-term liquidity. >2 = healthy cushion; <1 = potential liquidity issues. Too high (>3) may indicate inefficient capital use. Industry varies: tech needs less, manufacturing more. Critical for: bankruptcy risk assessment.'
  },
  {
    id: 'calc-debt-to-equity',
    description: 'Total debt / equity - leverage ratio. <0.5 = conservative; >2 = aggressive. High debt amplifies returns and risk. Acceptable levels vary by industry. Rising D/E = increasing leverage risk. Combine with interest coverage for complete picture.'
  },
  {
    id: 'calc-quick-ratio',
    description: 'Quick assets / current liabilities - stringent liquidity test excluding inventory. >1 = can cover short-term obligations; <1 = potential liquidity stress. More conservative than current ratio. Essential for assessing immediate financial health.'
  },

  // Momentum
  {
    id: 'calc-price-momentum-5d',
    description: '5-day price change % - very short-term momentum. >5% = strong surge; <-5% = sharp drop. Extreme moves often revert. Use for: identifying overbought/oversold conditions and short-term reversals. Combine with volume for confirmation.'
  },
  {
    id: 'calc-price-momentum-20d',
    description: '20-day price change % - short-term trend strength. >10% = strong momentum; <-10% = weakness. Persistent momentum tends to continue (trend following). Extreme readings (>20%) often mark exhaustion. Key for swing trading entries.'
  },
];

async function enhanceDescriptions() {
  console.log('Enhancing factor descriptions with context and insights...\n');

  let updated = 0;
  let errors = 0;

  for (const { id, description } of enhancedDescriptions) {
    const { error } = await supabase
      .from('factor_definitions')
      .update({ description })
      .eq('id', id);

    if (error) {
      console.error(`❌ Error updating ${id}:`, error.message);
      errors++;
    } else {
      console.log(`✓ Enhanced ${id}`);
      updated++;
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ Updated ${updated} factor descriptions`);
  if (errors > 0) {
    console.log(`❌ Failed: ${errors}`);
  }
  console.log('\nDescriptions now include:');
  console.log('  • What the factor measures');
  console.log('  • Why it matters for trading/investing');
  console.log('  • Typical values and what they indicate');
  console.log('  • Pros, cons, and context');
  console.log('  • Actionable insights for usage');
}

enhanceDescriptions();
