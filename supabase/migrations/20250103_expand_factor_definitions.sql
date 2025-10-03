-- Migration: Expand Factor Definitions with Alpha Vantage & Tavily API Coverage
-- Created: 2025-01-03
-- Description: Adds 100+ comprehensive factor definitions covering fundamentals, technical indicators,
--              options metrics, economic indicators, and web-based qualitative factors

-- First, ensure the factor_definitions table exists and has the correct schema
-- The table should already exist, but we'll add description column if it doesn't exist
ALTER TABLE factor_definitions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE factor_definitions ADD COLUMN IF NOT EXISTS collection_method TEXT CHECK (collection_method IN ('api', 'manual', 'calculated'));

-- Expand the data_type constraint to include new types
ALTER TABLE factor_definitions DROP CONSTRAINT IF EXISTS factor_definitions_data_type_check;
ALTER TABLE factor_definitions ADD CONSTRAINT factor_definitions_data_type_check CHECK (
  data_type = ANY (ARRAY[
    'numeric'::text,
    'percentage'::text,
    'currency'::text,
    'rating'::text,
    'boolean'::text,
    'ratio'::text,
    'date'::text,
    'index'::text,
    'points'::text,
    'volume'::text,
    'count'::text,
    'score'::text,
    'shares'::text,
    'decimal'::text,
    'contracts'::text,
    'percentile'::text,
    'coefficient'::text,
    'thousands'::text
  ])
);

-- Update collection_method for existing factors based on their source
UPDATE factor_definitions
SET collection_method =
  CASE
    WHEN source IN ('alpha_vantage', 'alpha_vantage_options', 'tavily') THEN 'api'
    WHEN source IS NULL THEN 'manual'
    ELSE 'manual'
  END
WHERE collection_method IS NULL;

-- ============================================================================
-- SECTION 1: ALPHA VANTAGE - COMPANY OVERVIEW & FUNDAMENTALS
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES
-- Extended valuation metrics
('av-trailing-pe', 'Trailing P/E Ratio', 'quantitative', 'Valuation', 'ratio', 'ratio', 'alpha_vantage', 'Price to trailing twelve months earnings ratio', 'api', true),
('av-forward-pe', 'Forward P/E Ratio', 'quantitative', 'Valuation', 'ratio', 'ratio', 'alpha_vantage', 'Price to forward earnings ratio based on analyst estimates', 'api', true),
('av-price-to-sales', 'Price to Sales Ratio TTM', 'quantitative', 'Valuation', 'ratio', 'ratio', 'alpha_vantage', 'Market cap divided by trailing twelve months revenue', 'api', true),
('av-price-to-book', 'Price to Book Ratio', 'quantitative', 'Valuation', 'ratio', 'ratio', 'alpha_vantage', 'Market price per share divided by book value per share', 'api', true),
('av-ev-to-revenue', 'EV to Revenue', 'quantitative', 'Valuation', 'ratio', 'ratio', 'alpha_vantage', 'Enterprise value divided by revenue', 'api', true),
('av-ev-to-ebitda', 'EV to EBITDA', 'quantitative', 'Valuation', 'ratio', 'ratio', 'alpha_vantage', 'Enterprise value divided by earnings before interest, taxes, depreciation, and amortization', 'api', true),
('av-shares-outstanding', 'Shares Outstanding', 'quantitative', 'Company Overview', 'numeric', 'shares', 'alpha_vantage', 'Total number of shares outstanding', 'api', true),
('av-analyst-target-price', 'Analyst Target Price', 'quantitative', 'Valuation', 'currency', '$', 'alpha_vantage', 'Average analyst target price', 'api', true),

-- Growth metrics
('av-quarterly-earnings-growth', 'Quarterly Earnings Growth YoY', 'quantitative', 'Growth', 'percentage', '%', 'alpha_vantage', 'Year-over-year quarterly earnings growth rate', 'api', true),
('av-diluted-eps', 'Diluted EPS TTM', 'quantitative', 'Profitability', 'currency', '$', 'alpha_vantage', 'Diluted earnings per share for trailing twelve months', 'api', true),

-- Dividend metrics
('av-dividend-date', 'Dividend Date', 'quantitative', 'Dividends', 'date', 'date', 'alpha_vantage', 'Next expected dividend payment date', 'api', true),
('av-ex-dividend-date', 'Ex-Dividend Date', 'quantitative', 'Dividends', 'date', 'date', 'alpha_vantage', 'Date when stock trades without dividend', 'api', true)

ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  collection_method = EXCLUDED.collection_method,
  source = EXCLUDED.source;

-- ============================================================================
-- SECTION 2: ALPHA VANTAGE - TECHNICAL INDICATORS (50+ indicators)
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES
-- Moving Averages
('av-ema-20', 'EMA 20', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', '20-period Exponential Moving Average', 'api', true),
('av-ema-50', 'EMA 50', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', '50-period Exponential Moving Average', 'api', true),
('av-ema-200', 'EMA 200', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', '200-period Exponential Moving Average', 'api', true),
('av-wma-20', 'WMA 20', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', '20-period Weighted Moving Average', 'api', true),
('av-dema', 'DEMA', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Double Exponential Moving Average', 'api', true),
('av-tema', 'TEMA', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Triple Exponential Moving Average', 'api', true),
('av-trima', 'TRIMA', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Triangular Moving Average', 'api', true),
('av-kama', 'KAMA', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Kaufman Adaptive Moving Average', 'api', true),
('av-t3', 'T3 Moving Average', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Triple Exponential Moving Average (T3)', 'api', true),
('av-vwap', 'VWAP', 'quantitative', 'Volume Indicators', 'numeric', '$', 'alpha_vantage', 'Volume Weighted Average Price', 'api', true),

-- Bollinger Bands & Volatility
('av-bbands-upper', 'Bollinger Bands Upper', 'quantitative', 'Volatility Indicators', 'numeric', '$', 'alpha_vantage', 'Bollinger Bands upper band (2 std dev)', 'api', true),
('av-bbands-middle', 'Bollinger Bands Middle', 'quantitative', 'Volatility Indicators', 'numeric', '$', 'alpha_vantage', 'Bollinger Bands middle band (SMA)', 'api', true),
('av-bbands-lower', 'Bollinger Bands Lower', 'quantitative', 'Volatility Indicators', 'numeric', '$', 'alpha_vantage', 'Bollinger Bands lower band (2 std dev)', 'api', true),
('av-atr', 'ATR (Average True Range)', 'quantitative', 'Volatility Indicators', 'numeric', '$', 'alpha_vantage', 'Average True Range - measures volatility', 'api', true),
('av-natr', 'NATR (Normalized ATR)', 'quantitative', 'Volatility Indicators', 'percentage', '%', 'alpha_vantage', 'Normalized Average True Range', 'api', true),

-- Oscillators & Momentum
('av-stoch-k', 'Stochastic %K', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Stochastic Oscillator %K line', 'api', true),
('av-stoch-d', 'Stochastic %D', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Stochastic Oscillator %D line (signal)', 'api', true),
('av-stochf-k', 'Fast Stochastic %K', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Fast Stochastic Oscillator %K', 'api', true),
('av-stochrsi', 'Stochastic RSI', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Stochastic RSI indicator', 'api', true),
('av-willr', 'Williams %R', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Williams %R momentum indicator', 'api', true),
('av-cci', 'CCI (Commodity Channel Index)', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Commodity Channel Index', 'api', true),
('av-mfi', 'MFI (Money Flow Index)', 'quantitative', 'Volume Indicators', 'numeric', 'index', 'alpha_vantage', 'Money Flow Index - volume-weighted RSI', 'api', true),
('av-cmo', 'CMO (Chande Momentum Oscillator)', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Chande Momentum Oscillator', 'api', true),
('av-roc', 'ROC (Rate of Change)', 'quantitative', 'Momentum Indicators', 'percentage', '%', 'alpha_vantage', 'Rate of Change indicator', 'api', true),
('av-rocr', 'ROCR (Rate of Change Ratio)', 'quantitative', 'Momentum Indicators', 'ratio', 'ratio', 'alpha_vantage', 'Rate of Change Ratio', 'api', true),
('av-mom', 'Momentum', 'quantitative', 'Momentum Indicators', 'numeric', 'points', 'alpha_vantage', 'Momentum indicator', 'api', true),
('av-bop', 'BOP (Balance of Power)', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Balance of Power indicator', 'api', true),
('av-trix', 'TRIX', 'quantitative', 'Momentum Indicators', 'percentage', '%', 'alpha_vantage', 'Triple Exponential Average Rate of Change', 'api', true),
('av-ultosc', 'Ultimate Oscillator', 'quantitative', 'Momentum Indicators', 'numeric', 'index', 'alpha_vantage', 'Ultimate Oscillator combining multiple timeframes', 'api', true),

-- Trend Strength & Direction
('av-adx', 'ADX (Average Directional Index)', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Average Directional Index - trend strength', 'api', true),
('av-adxr', 'ADXR', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Average Directional Movement Index Rating', 'api', true),
('av-dx', 'DX (Directional Movement Index)', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Directional Movement Index', 'api', true),
('av-plus-di', '+DI (Plus Directional Indicator)', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Plus Directional Indicator', 'api', true),
('av-minus-di', '-DI (Minus Directional Indicator)', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Minus Directional Indicator', 'api', true),
('av-aroon-up', 'Aroon Up', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Aroon Up indicator', 'api', true),
('av-aroon-down', 'Aroon Down', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Aroon Down indicator', 'api', true),
('av-aroonosc', 'Aroon Oscillator', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Aroon Oscillator (Up - Down)', 'api', true),

-- MACD Family
('av-macdext-macd', 'MACD Extended', 'quantitative', 'Momentum Indicators', 'numeric', 'points', 'alpha_vantage', 'MACD with controllable MA types', 'api', true),
('av-apo', 'APO (Absolute Price Oscillator)', 'quantitative', 'Momentum Indicators', 'numeric', 'points', 'alpha_vantage', 'Absolute Price Oscillator', 'api', true),
('av-ppo', 'PPO (Percentage Price Oscillator)', 'quantitative', 'Momentum Indicators', 'percentage', '%', 'alpha_vantage', 'Percentage Price Oscillator', 'api', true),

-- Volume Indicators
('av-ad', 'AD (Accumulation/Distribution)', 'quantitative', 'Volume Indicators', 'numeric', 'index', 'alpha_vantage', 'Accumulation/Distribution Line', 'api', true),
('av-adosc', 'ADOSC (Chaikin A/D Oscillator)', 'quantitative', 'Volume Indicators', 'numeric', 'index', 'alpha_vantage', 'Chaikin Accumulation/Distribution Oscillator', 'api', true),
('av-obv', 'OBV (On Balance Volume)', 'quantitative', 'Volume Indicators', 'numeric', 'volume', 'alpha_vantage', 'On Balance Volume indicator', 'api', true),

-- Other Technical Indicators
('av-midpoint', 'Midpoint', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Midpoint over period', 'api', true),
('av-midprice', 'Midprice', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Midpoint Price over period', 'api', true),
('av-sar', 'SAR (Parabolic SAR)', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Parabolic Stop and Reverse', 'api', true),
('av-trange', 'True Range', 'quantitative', 'Volatility Indicators', 'numeric', '$', 'alpha_vantage', 'True Range indicator', 'api', true),

-- Hilbert Transform Indicators
('av-ht-trendline', 'HT Trendline', 'quantitative', 'Trend Indicators', 'numeric', '$', 'alpha_vantage', 'Hilbert Transform - Instantaneous Trendline', 'api', true),
('av-ht-trendmode', 'HT Trend vs Cycle Mode', 'quantitative', 'Trend Indicators', 'numeric', 'index', 'alpha_vantage', 'Hilbert Transform - Trend vs Cycle Mode', 'api', true)

ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  collection_method = EXCLUDED.collection_method,
  source = EXCLUDED.source;

-- ============================================================================
-- SECTION 3: ALPHA VANTAGE - ECONOMIC INDICATORS
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES
('av-gdp-annual', 'GDP Annual', 'quantitative', 'Economic Indicators', 'currency', '$B', 'alpha_vantage', 'US Gross Domestic Product (Annual)', 'api', true),
('av-gdp-quarterly', 'GDP Quarterly', 'quantitative', 'Economic Indicators', 'currency', '$B', 'alpha_vantage', 'US Gross Domestic Product (Quarterly)', 'api', true),
('av-gdp-per-capita', 'Real GDP per Capita', 'quantitative', 'Economic Indicators', 'currency', '$', 'alpha_vantage', 'US Real GDP per Capita', 'api', true),
('av-consumer-sentiment', 'Consumer Sentiment', 'quantitative', 'Economic Indicators', 'numeric', 'index', 'alpha_vantage', 'University of Michigan Consumer Sentiment Index', 'api', true),
('av-retail-sales', 'Retail Sales', 'quantitative', 'Economic Indicators', 'currency', '$M', 'alpha_vantage', 'US Retail Sales', 'api', true),
('av-durable-goods', 'Durable Goods Orders', 'quantitative', 'Economic Indicators', 'currency', '$M', 'alpha_vantage', 'US Durable Goods Orders', 'api', true),
('av-nonfarm-payroll', 'Nonfarm Payroll', 'quantitative', 'Economic Indicators', 'numeric', 'thousands', 'alpha_vantage', 'US Nonfarm Payroll Employment', 'api', true),
('av-inflation', 'Inflation Rate', 'quantitative', 'Economic Indicators', 'percentage', '%', 'alpha_vantage', 'US Annual Inflation Rate', 'api', true),
('av-inflation-expectation', 'Inflation Expectation', 'quantitative', 'Economic Indicators', 'percentage', '%', 'alpha_vantage', 'Median Expected Inflation (12 months)', 'api', true),
('av-treasury-3m', 'Treasury Yield 3 Month', 'quantitative', 'Interest Rates', 'percentage', '%', 'alpha_vantage', '3-Month Treasury Yield', 'api', true),
('av-treasury-2y', 'Treasury Yield 2 Year', 'quantitative', 'Interest Rates', 'percentage', '%', 'alpha_vantage', '2-Year Treasury Yield', 'api', true),
('av-treasury-5y', 'Treasury Yield 5 Year', 'quantitative', 'Interest Rates', 'percentage', '%', 'alpha_vantage', '5-Year Treasury Yield', 'api', true),
('av-treasury-7y', 'Treasury Yield 7 Year', 'quantitative', 'Interest Rates', 'percentage', '%', 'alpha_vantage', '7-Year Treasury Yield', 'api', true),
('av-treasury-10y', 'Treasury Yield 10 Year', 'quantitative', 'Interest Rates', 'percentage', '%', 'alpha_vantage', '10-Year Treasury Yield', 'api', true),
('av-treasury-30y', 'Treasury Yield 30 Year', 'quantitative', 'Interest Rates', 'percentage', '%', 'alpha_vantage', '30-Year Treasury Yield', 'api', true)

ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  collection_method = EXCLUDED.collection_method,
  source = EXCLUDED.source;

-- ============================================================================
-- SECTION 4: TAVILY API - WEB-BASED & NEWS SENTIMENT FACTORS
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES
('tavily-news-sentiment-score', 'News Sentiment Score', 'quantitative', 'News & Sentiment', 'numeric', 'score', 'tavily', 'Aggregated news sentiment score from recent articles', 'api', true),
('tavily-news-volume', 'News Volume', 'quantitative', 'News & Sentiment', 'numeric', 'count', 'tavily', 'Number of news articles in past 7 days', 'api', true),
('tavily-analyst-rating-avg', 'Analyst Rating Average', 'quantitative', 'Analyst Coverage', 'numeric', 'rating', 'tavily', 'Average analyst rating (1-5 scale)', 'api', true),
('tavily-analyst-count', 'Analyst Coverage Count', 'quantitative', 'Analyst Coverage', 'numeric', 'count', 'tavily', 'Number of analysts covering the stock', 'api', true),
('tavily-price-target-avg', 'Analyst Price Target Avg', 'quantitative', 'Analyst Coverage', 'currency', '$', 'tavily', 'Average analyst price target', 'api', true),
('tavily-upgrade-downgrade', 'Recent Upgrades/Downgrades', 'quantitative', 'Analyst Coverage', 'numeric', 'count', 'tavily', 'Net analyst upgrades minus downgrades (30 days)', 'api', true),
('tavily-sec-filings-count', 'Recent SEC Filings', 'quantitative', 'Corporate Events', 'numeric', 'count', 'tavily', 'Number of SEC filings in past 90 days', 'api', true),
('tavily-insider-buying', 'Insider Buying Activity', 'quantitative', 'Insider Activity', 'percentage', '%', 'tavily', 'Net insider buying as % of shares (90 days)', 'api', true),
('tavily-institutional-ownership', 'Institutional Ownership %', 'quantitative', 'Ownership', 'percentage', '%', 'tavily', 'Percentage of shares held by institutions', 'api', true),
('tavily-short-interest', 'Short Interest %', 'quantitative', 'Sentiment & Flow', 'percentage', '%', 'tavily', 'Short interest as percentage of float', 'api', true),
('tavily-social-sentiment', 'Social Media Sentiment', 'quantitative', 'News & Sentiment', 'numeric', 'score', 'tavily', 'Aggregated social media sentiment score', 'api', true)

ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  collection_method = EXCLUDED.collection_method,
  source = EXCLUDED.source;

-- ============================================================================
-- SECTION 5: ENHANCED QUALITATIVE FACTORS (Manual Input)
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES
('qual-management-track-record', 'Management Track Record', 'qualitative', 'Management & Governance', 'rating', '1-5', NULL, 'Historical performance of management team', 'manual', true),
('qual-board-independence', 'Board Independence', 'qualitative', 'Management & Governance', 'rating', '1-5', NULL, 'Independence and quality of board of directors', 'manual', true),
('qual-corporate-governance', 'Corporate Governance', 'qualitative', 'Management & Governance', 'rating', '1-5', NULL, 'Overall corporate governance practices', 'manual', true),
('qual-industry-tailwinds', 'Industry Tailwinds', 'qualitative', 'Business Model & Industry', 'rating', '1-5', NULL, 'Positive industry trends and growth drivers', 'manual', true),
('qual-market-share-trend', 'Market Share Trend', 'qualitative', 'Business Model & Industry', 'rating', '1-5', NULL, 'Company gaining or losing market share', 'manual', true),
('qual-pricing-power', 'Pricing Power', 'qualitative', 'Business Model & Industry', 'rating', '1-5', NULL, 'Ability to raise prices without losing customers', 'manual', true),
('qual-customer-concentration', 'Customer Concentration Risk', 'qualitative', 'Risk Factors', 'rating', '1-5', NULL, 'Diversification of customer base (1=high risk, 5=diversified)', 'manual', true),
('qual-supply-chain-risk', 'Supply Chain Risk', 'qualitative', 'Risk Factors', 'rating', '1-5', NULL, 'Supply chain vulnerabilities (1=high risk, 5=resilient)', 'manual', true),
('qual-technology-moat', 'Technology Moat', 'qualitative', 'Business Model & Industry', 'rating', '1-5', NULL, 'Proprietary technology advantages', 'manual', true),
('qual-network-effects', 'Network Effects', 'qualitative', 'Business Model & Industry', 'rating', '1-5', NULL, 'Product becomes more valuable with more users', 'manual', true),
('qual-environmental-score', 'Environmental Score', 'qualitative', 'ESG Factors', 'rating', '1-5', NULL, 'Environmental practices and impact', 'manual', true),
('qual-social-score', 'Social Score', 'qualitative', 'ESG Factors', 'rating', '1-5', NULL, 'Social responsibility and labor practices', 'manual', true),
('qual-governance-score', 'Governance Score', 'qualitative', 'ESG Factors', 'rating', '1-5', NULL, 'Corporate governance quality', 'manual', true)

ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  collection_method = EXCLUDED.collection_method;

-- ============================================================================
-- SECTION 6: CALCULATED/DERIVED FACTORS
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES
('calc-current-ratio', 'Current Ratio', 'quantitative', 'Financial Health', 'ratio', 'ratio', NULL, 'Current Assets / Current Liabilities', 'calculated', true),
('calc-quick-ratio', 'Quick Ratio', 'quantitative', 'Financial Health', 'ratio', 'ratio', NULL, 'Quick Assets / Current Liabilities', 'calculated', true),
('calc-debt-to-equity', 'Debt to Equity Ratio', 'quantitative', 'Financial Health', 'ratio', 'ratio', NULL, 'Total Debt / Total Equity', 'calculated', true),
('calc-interest-coverage', 'Interest Coverage Ratio', 'quantitative', 'Financial Health', 'ratio', 'ratio', NULL, 'EBIT / Interest Expense', 'calculated', true),
('calc-free-cash-flow-yield', 'Free Cash Flow Yield', 'quantitative', 'Valuation', 'percentage', '%', NULL, 'Free Cash Flow / Market Cap', 'calculated', true),
('calc-earning-yield', 'Earnings Yield', 'quantitative', 'Valuation', 'percentage', '%', NULL, 'Earnings per Share / Price per Share', 'calculated', true),
('calc-peg-ratio', 'PEG Ratio (Calculated)', 'quantitative', 'Valuation', 'ratio', 'ratio', NULL, 'P/E Ratio / Earnings Growth Rate (calculated from financials)', 'calculated', true),
('calc-working-capital', 'Working Capital', 'quantitative', 'Financial Health', 'currency', '$', NULL, 'Current Assets - Current Liabilities', 'calculated', true),
('calc-net-margin', 'Net Profit Margin', 'quantitative', 'Profitability', 'percentage', '%', NULL, 'Net Income / Revenue', 'calculated', true),
('calc-asset-turnover', 'Asset Turnover', 'quantitative', 'Efficiency', 'ratio', 'ratio', NULL, 'Revenue / Total Assets', 'calculated', true),
('calc-inventory-turnover', 'Inventory Turnover', 'quantitative', 'Efficiency', 'ratio', 'ratio', NULL, 'Cost of Goods Sold / Average Inventory', 'calculated', true),
('calc-receivables-turnover', 'Receivables Turnover', 'quantitative', 'Efficiency', 'ratio', 'ratio', NULL, 'Revenue / Average Accounts Receivable', 'calculated', true)

ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  collection_method = EXCLUDED.collection_method;

-- ============================================================================
-- Update existing factors with descriptions if they don't have them
-- ============================================================================

UPDATE factor_definitions SET description = 'Simple Moving Average over 50 periods'
WHERE id = 'av-sma-50' AND description IS NULL;

UPDATE factor_definitions SET description = 'Simple Moving Average over 200 periods'
WHERE id = 'av-sma-200' AND description IS NULL;

UPDATE factor_definitions SET description = 'Relative Strength Index - momentum oscillator'
WHERE id = 'av-rsi' AND description IS NULL;

UPDATE factor_definitions SET description = 'Moving Average Convergence Divergence - trend-following momentum indicator'
WHERE id = 'av-macd' AND description IS NULL;

-- ============================================================================
-- Create indexes for better query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_factor_definitions_category ON factor_definitions(category);
CREATE INDEX IF NOT EXISTS idx_factor_definitions_type_source ON factor_definitions(type, source);
CREATE INDEX IF NOT EXISTS idx_factor_definitions_collection_method ON factor_definitions(collection_method);
CREATE INDEX IF NOT EXISTS idx_factor_definitions_active ON factor_definitions(is_active);

-- ============================================================================
-- Summary statistics view
-- ============================================================================

CREATE OR REPLACE VIEW factor_definitions_summary AS
SELECT
  category,
  type,
  collection_method,
  COUNT(*) as factor_count,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
FROM factor_definitions
GROUP BY category, type, collection_method
ORDER BY category, type, collection_method;

-- Grant permissions
GRANT SELECT ON factor_definitions_summary TO authenticated;
