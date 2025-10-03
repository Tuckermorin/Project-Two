-- Migration: Add Relative/Percentage-Based Calculated Factors
-- Created: 2025-01-03
-- Description: Replaces absolute dollar value factors with relative/percentage-based factors
--              that are universally comparable across different stocks

-- ============================================================================
-- SECTION 1: RELATIVE PRICE POSITION FACTORS
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES

-- Distance from Moving Averages (Relative)
('calc-dist-ema-20', 'Distance from EMA 20', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage distance of current price from 20-period EMA: ((Price - EMA20) / EMA20) * 100', 'calculated', true),
('calc-dist-ema-50', 'Distance from EMA 50', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage distance of current price from 50-period EMA: ((Price - EMA50) / EMA50) * 100', 'calculated', true),
('calc-dist-ema-200', 'Distance from EMA 200', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage distance of current price from 200-period EMA: ((Price - EMA200) / EMA200) * 100', 'calculated', true),
('calc-dist-wma-20', 'Distance from WMA 20', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage distance of current price from 20-period WMA', 'calculated', true),
('calc-dist-dema', 'Distance from DEMA', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage distance of current price from Double EMA', 'calculated', true),
('calc-dist-tema', 'Distance from TEMA', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage distance of current price from Triple EMA', 'calculated', true),
('calc-dist-vwap', 'Distance from VWAP', 'quantitative', 'Volume Indicators', 'percentage', '%', NULL, 'Percentage distance of current price from Volume Weighted Average Price', 'calculated', true),

-- Distance from 52-Week High/Low (Relative)
('calc-dist-52w-high', 'Distance from 52W High', 'quantitative', 'Price Position', 'percentage', '%', NULL, 'Percentage below 52-week high: ((52W High - Price) / 52W High) * 100', 'calculated', true),
('calc-dist-52w-low', 'Distance from 52W Low', 'quantitative', 'Price Position', 'percentage', '%', NULL, 'Percentage above 52-week low: ((Price - 52W Low) / 52W Low) * 100', 'calculated', true),
('calc-52w-range-position', '52W Range Position', 'quantitative', 'Price Position', 'percentage', '%', NULL, 'Position within 52-week range: ((Price - 52W Low) / (52W High - 52W Low)) * 100', 'calculated', true),

-- Distance from Bollinger Bands (Relative)
('calc-bb-position', 'Bollinger Band Position', 'quantitative', 'Volatility Indicators', 'percentage', '%', NULL, 'Position within Bollinger Bands: ((Price - BB Lower) / (BB Upper - BB Lower)) * 100', 'calculated', true),
('calc-dist-bb-upper', 'Distance from BB Upper', 'quantitative', 'Volatility Indicators', 'percentage', '%', NULL, 'Percentage distance from Bollinger Band upper: ((BB Upper - Price) / Price) * 100', 'calculated', true),
('calc-dist-bb-lower', 'Distance from BB Lower', 'quantitative', 'Volatility Indicators', 'percentage', '%', NULL, 'Percentage distance from Bollinger Band lower: ((Price - BB Lower) / Price) * 100', 'calculated', true),

-- Distance from Analyst Target (Relative)
('calc-dist-target-price', 'Distance from Analyst Target', 'quantitative', 'Valuation', 'percentage', '%', NULL, 'Percentage distance from average analyst target price: ((Target - Price) / Price) * 100', 'calculated', true),

-- ============================================================================
-- SECTION 2: VOLATILITY AS PERCENTAGE OF PRICE
-- ============================================================================

('calc-atr-pct', 'ATR % of Price', 'quantitative', 'Volatility Indicators', 'percentage', '%', NULL, 'Average True Range as percentage of current price: (ATR / Price) * 100', 'calculated', true),
('calc-bb-width-pct', 'BB Width % of Price', 'quantitative', 'Volatility Indicators', 'percentage', '%', NULL, 'Bollinger Band width as percentage of price: ((BB Upper - BB Lower) / Price) * 100', 'calculated', true),

-- ============================================================================
-- SECTION 3: VOLUME RELATIVE METRICS
-- ============================================================================

('calc-volume-vs-avg', 'Volume vs Average', 'quantitative', 'Volume Indicators', 'ratio', 'ratio', NULL, 'Current volume divided by average volume: Volume / AvgVolume', 'calculated', true),
('calc-volume-surge', 'Volume Surge %', 'quantitative', 'Volume Indicators', 'percentage', '%', NULL, 'Percentage increase in volume vs average: ((Volume - AvgVolume) / AvgVolume) * 100', 'calculated', true),

-- ============================================================================
-- SECTION 4: MARKET CAP CATEGORIES (RELATIVE SIZING)
-- ============================================================================

('calc-market-cap-category', 'Market Cap Category', 'quantitative', 'Company Overview', 'rating', '1-5', NULL, 'Market cap category: 1=Micro (<$300M), 2=Small ($300M-$2B), 3=Mid ($2B-$10B), 4=Large ($10B-$200B), 5=Mega (>$200B)', 'calculated', true),

-- ============================================================================
-- SECTION 5: TREND STRENGTH INDICATORS (RELATIVE)
-- ============================================================================

('calc-ma-slope-20', 'MA 20 Slope', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage change in 20-period MA over last 5 periods', 'calculated', true),
('calc-ma-slope-50', 'MA 50 Slope', 'quantitative', 'Trend Indicators', 'percentage', '%', NULL, 'Percentage change in 50-period MA over last 10 periods', 'calculated', true),
('calc-price-momentum-5d', 'Price Momentum 5D', 'quantitative', 'Momentum Indicators', 'percentage', '%', NULL, '5-day price momentum: ((Price Today - Price 5D Ago) / Price 5D Ago) * 100', 'calculated', true),
('calc-price-momentum-20d', 'Price Momentum 20D', 'quantitative', 'Momentum Indicators', 'percentage', '%', NULL, '20-day price momentum: ((Price Today - Price 20D Ago) / Price 20D Ago) * 100', 'calculated', true),

-- ============================================================================
-- SECTION 6: OPTIONS-SPECIFIC RELATIVE METRICS
-- ============================================================================

('calc-iv-percentile', 'IV Percentile', 'quantitative', 'Options Greeks', 'percentile', 'percentile', NULL, 'Current IV percentile vs 1-year IV history (0-100)', 'calculated', true),
('calc-iv-rank', 'IV Rank', 'quantitative', 'Options Greeks', 'percentile', 'percentile', NULL, 'IV Rank: (Current IV - 52W Low IV) / (52W High IV - 52W Low IV) * 100', 'calculated', true),
('calc-put-call-volume-ratio', 'Put/Call Volume Ratio', 'quantitative', 'Options Volume', 'ratio', 'ratio', NULL, 'Put volume divided by call volume', 'calculated', true),
('calc-put-call-oi-ratio', 'Put/Call OI Ratio', 'quantitative', 'Options Volume', 'ratio', 'ratio', NULL, 'Put open interest divided by call open interest', 'calculated', true)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  data_type = EXCLUDED.data_type,
  unit = EXCLUDED.unit,
  collection_method = EXCLUDED.collection_method,
  is_active = EXCLUDED.is_active;

-- ============================================================================
-- SECTION 7: DEPRECATE ABSOLUTE VALUE FACTORS
-- ============================================================================

-- Mark absolute dollar value factors as inactive (don't delete for historical data)
UPDATE factor_definitions SET is_active = false WHERE id IN (
  -- Moving Averages (absolute $)
  'av-ema-20',
  'av-ema-50',
  'av-ema-200',
  'av-wma-20',
  'av-dema',
  'av-tema',
  'av-trima',
  'av-kama',
  'av-t3',

  -- VWAP (absolute $)
  'av-vwap',

  -- Bollinger Bands (absolute $)
  'av-bbands-upper',
  'av-bbands-middle',
  'av-bbands-lower',

  -- Volatility (absolute $)
  'av-atr',
  'av-trange',

  -- Other absolute price indicators
  'av-midpoint',
  'av-midprice',
  'av-sar',
  'av-ht-trendline',

  -- Analyst target (absolute $)
  'av-analyst-target-price',
  'tavily-price-target-avg'
);

-- Add comment explaining deprecation
COMMENT ON TABLE factor_definitions IS 'Factor definitions for IPS scoring. Absolute dollar value factors have been replaced with relative/percentage-based factors for universal comparability across stocks of different price ranges.';
