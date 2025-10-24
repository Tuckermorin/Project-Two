import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const relativeFactors = [
  // Distance from Moving Averages (Relative)
  { id: 'calc-dist-ema-20', name: 'Distance from EMA 20', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance of current price from 20-period EMA: ((Price - EMA20) / EMA20) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-ema-50', name: 'Distance from EMA 50', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance of current price from 50-period EMA: ((Price - EMA50) / EMA50) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-ema-200', name: 'Distance from EMA 200', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance of current price from 200-period EMA: ((Price - EMA200) / EMA200) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-wma-20', name: 'Distance from WMA 20', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance of current price from 20-period WMA', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-dema', name: 'Distance from DEMA', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance of current price from Double EMA', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-tema', name: 'Distance from TEMA', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance of current price from Triple EMA', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-vwap', name: 'Distance from VWAP', type: 'quantitative', category: 'Volume Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance of current price from Volume Weighted Average Price', collection_method: 'calculated', is_active: true },

  // Distance from 52-Week High/Low (Relative)
  { id: 'calc-dist-52w-high', name: 'Distance from 52W High', type: 'quantitative', category: 'Price Position', data_type: 'percentage', unit: '%', source: null, description: 'Percentage below 52-week high: ((52W High - Price) / 52W High) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-52w-low', name: 'Distance from 52W Low', type: 'quantitative', category: 'Price Position', data_type: 'percentage', unit: '%', source: null, description: 'Percentage above 52-week low: ((Price - 52W Low) / 52W Low) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-52w-range-position', name: '52W Range Position', type: 'quantitative', category: 'Price Position', data_type: 'percentage', unit: '%', source: null, description: 'Position within 52-week range: ((Price - 52W Low) / (52W High - 52W Low)) * 100', collection_method: 'calculated', is_active: true },

  // Distance from Bollinger Bands (Relative)
  { id: 'calc-bb-position', name: 'Bollinger Band Position', type: 'quantitative', category: 'Volatility Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Position within Bollinger Bands: ((Price - BB Lower) / (BB Upper - BB Lower)) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-bb-upper', name: 'Distance from BB Upper', type: 'quantitative', category: 'Volatility Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance from Bollinger Band upper: ((BB Upper - Price) / Price) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-dist-bb-lower', name: 'Distance from BB Lower', type: 'quantitative', category: 'Volatility Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance from Bollinger Band lower: ((Price - BB Lower) / Price) * 100', collection_method: 'calculated', is_active: true },

  // Distance from Analyst Target (Relative)
  { id: 'calc-dist-target-price', name: 'Distance from Analyst Target', type: 'quantitative', category: 'Valuation', data_type: 'percentage', unit: '%', source: null, description: 'Percentage distance from average analyst target price: ((Target - Price) / Price) * 100', collection_method: 'calculated', is_active: true },

  // Volatility as Percentage of Price
  { id: 'calc-atr-pct', name: 'ATR % of Price', type: 'quantitative', category: 'Volatility Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Average True Range as percentage of current price: (ATR / Price) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-bb-width-pct', name: 'BB Width % of Price', type: 'quantitative', category: 'Volatility Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Bollinger Band width as percentage of price: ((BB Upper - BB Lower) / Price) * 100', collection_method: 'calculated', is_active: true },

  // Volume Relative Metrics
  { id: 'calc-volume-vs-avg', name: 'Volume vs Average', type: 'quantitative', category: 'Volume Indicators', data_type: 'ratio', unit: 'ratio', source: null, description: 'Current volume divided by average volume: Volume / AvgVolume', collection_method: 'calculated', is_active: true },
  { id: 'calc-volume-surge', name: 'Volume Surge %', type: 'quantitative', category: 'Volume Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage increase in volume vs average: ((Volume - AvgVolume) / AvgVolume) * 100', collection_method: 'calculated', is_active: true },

  // Market Cap Categories (Relative Sizing)
  { id: 'calc-market-cap-category', name: 'Market Cap Category', type: 'quantitative', category: 'Company Overview', data_type: 'rating', unit: '1-5', source: null, description: 'Market cap category: 1=Micro (<$300M), 2=Small ($300M-$2B), 3=Mid ($2B-$10B), 4=Large ($10B-$200B), 5=Mega (>$200B)', collection_method: 'calculated', is_active: true },

  // Trend Strength Indicators (Relative)
  { id: 'calc-ma-slope-20', name: 'MA 20 Slope', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage change in 20-period MA over last 5 periods', collection_method: 'calculated', is_active: true },
  { id: 'calc-ma-slope-50', name: 'MA 50 Slope', type: 'quantitative', category: 'Trend Indicators', data_type: 'percentage', unit: '%', source: null, description: 'Percentage change in 50-period MA over last 10 periods', collection_method: 'calculated', is_active: true },
  { id: 'calc-price-momentum-5d', name: 'Price Momentum 5D', type: 'quantitative', category: 'Momentum Indicators', data_type: 'percentage', unit: '%', source: null, description: '5-day price momentum: ((Price Today - Price 5D Ago) / Price 5D Ago) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-price-momentum-20d', name: 'Price Momentum 20D', type: 'quantitative', category: 'Momentum Indicators', data_type: 'percentage', unit: '%', source: null, description: '20-day price momentum: ((Price Today - Price 20D Ago) / Price 20D Ago) * 100', collection_method: 'calculated', is_active: true },

  // Options-Specific Relative Metrics
  { id: 'calc-iv-percentile', name: 'IV Percentile', type: 'quantitative', category: 'Options Greeks', data_type: 'percentile', unit: 'percentile', source: null, description: 'Current IV percentile vs 1-year IV history (0-100)', collection_method: 'calculated', is_active: true },
  { id: 'calc-iv-rank', name: 'IV Rank', type: 'quantitative', category: 'Options Greeks', data_type: 'percentile', unit: 'percentile', source: null, description: 'IV Rank: (Current IV - 52W Low IV) / (52W High IV - 52W Low IV) * 100', collection_method: 'calculated', is_active: true },
  { id: 'calc-put-call-volume-ratio', name: 'Put/Call Volume Ratio', type: 'quantitative', category: 'Options Volume', data_type: 'ratio', unit: 'ratio', source: null, description: 'Put volume divided by call volume', collection_method: 'calculated', is_active: true },
  { id: 'calc-put-call-oi-ratio', name: 'Put/Call OI Ratio', type: 'quantitative', category: 'Options Volume', data_type: 'ratio', unit: 'ratio', source: null, description: 'Put open interest divided by call open interest', collection_method: 'calculated', is_active: true },
];

const deprecatedFactors = [
  'av-ema-20', 'av-ema-50', 'av-ema-200', 'av-wma-20', 'av-dema', 'av-tema', 'av-trima', 'av-kama', 'av-t3',
  'av-vwap', 'av-bbands-upper', 'av-bbands-middle', 'av-bbands-lower', 'av-atr', 'av-trange',
  'av-midpoint', 'av-midprice', 'av-sar', 'av-ht-trendline', 'av-analyst-target-price', 'tavily-price-target-avg'
];

async function runMigration() {
  console.log('Starting migration: Add relative factors...');

  // Insert relative factors
  for (const factor of relativeFactors) {
    const { data, error } = await supabase
      .from('factor_definitions')
      .upsert(factor, { onConflict: 'id' });

    if (error) {
      console.error(`Error inserting factor ${factor.id}:`, error);
    } else {
      console.log(`✓ Inserted/updated: ${factor.name}`);
    }
  }

  // Deprecate absolute value factors
  const { data, error } = await supabase
    .from('factor_definitions')
    .update({ is_active: false })
    .in('id', deprecatedFactors);

  if (error) {
    console.error('Error deprecating factors:', error);
  } else {
    console.log(`✓ Deprecated ${deprecatedFactors.length} absolute value factors`);
  }

  console.log('\nMigration completed successfully!');
}

runMigration().catch(console.error);
