-- Migration: Add Alpha Intelligence Factor Definitions
-- Created: 2025-10-10
-- Description: Adds NEWS_SENTIMENT and INSIDER_TRANSACTIONS factor definitions for IPS

-- ============================================================================
-- NEWS & SENTIMENT FACTORS
-- ============================================================================

INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, collection_method, is_active) VALUES

-- Overall sentiment metrics
('av-news-sentiment-score', 'News Sentiment Score', 'quantitative', 'News & Sentiment', 'score', '-1 to +1', 'alpha_vantage',
 'Overall news sentiment score from recent articles. -1 (bearish) to +1 (bullish)', 'api', true),

('av-news-sentiment-label', 'News Sentiment Label', 'qualitative', 'News & Sentiment', 'rating', 'label', 'alpha_vantage',
 'Categorized sentiment: Bearish, Somewhat-Bearish, Neutral, Somewhat-Bullish, Bullish', 'api', true),

-- Article count metrics
('av-news-positive-count', 'Positive News Article Count', 'quantitative', 'News & Sentiment', 'count', 'articles', 'alpha_vantage',
 'Number of positive news articles in the last 7 days', 'api', true),

('av-news-negative-count', 'Negative News Article Count', 'quantitative', 'News & Sentiment', 'count', 'articles', 'alpha_vantage',
 'Number of negative news articles in the last 7 days', 'api', true),

('av-news-neutral-count', 'Neutral News Article Count', 'quantitative', 'News & Sentiment', 'count', 'articles', 'alpha_vantage',
 'Number of neutral news articles in the last 7 days', 'api', true),

('av-news-total-count', 'Total News Article Count', 'quantitative', 'News & Sentiment', 'count', 'articles', 'alpha_vantage',
 'Total number of news articles in the last 7 days', 'api', true),

-- Advanced sentiment metrics
('av-news-relevance-avg', 'News Relevance Average', 'quantitative', 'News & Sentiment', 'score', '0 to 1', 'alpha_vantage',
 'Average relevance score of news articles to the ticker (0-1, higher = more relevant)', 'api', true),

('av-news-sentiment-momentum', 'News Sentiment Momentum', 'quantitative', 'News & Sentiment', 'score', '-1 to +1', 'alpha_vantage',
 'Change in sentiment over recent period (positive = improving sentiment)', 'calculated', true),

-- Topic-specific sentiment
('av-news-earnings-sentiment', 'Earnings News Sentiment', 'quantitative', 'News & Sentiment', 'score', '-1 to +1', 'alpha_vantage',
 'Sentiment of earnings-related news articles', 'api', true),

('av-news-ma-sentiment', 'M&A News Sentiment', 'quantitative', 'News & Sentiment', 'score', '-1 to +1', 'alpha_vantage',
 'Sentiment of mergers & acquisitions news', 'api', true),

('av-news-tech-sentiment', 'Technology News Sentiment', 'quantitative', 'News & Sentiment', 'score', '-1 to +1', 'alpha_vantage',
 'Sentiment of technology-focused news', 'api', true),

-- ============================================================================
-- INSIDER TRANSACTION FACTORS
-- ============================================================================

-- Basic insider metrics
('av-insider-buy-ratio', 'Insider Buy/Sell Ratio', 'quantitative', 'Insider Activity', 'ratio', 'ratio', 'alpha_vantage',
 'Ratio of insider buys to sells in last 90 days. >1 = more buying', 'api', true),

('av-insider-net-shares', 'Insider Net Shares', 'quantitative', 'Insider Activity', 'numeric', 'shares', 'alpha_vantage',
 'Net shares acquired by insiders (acquisitions - disposals) in last 90 days', 'api', true),

('av-insider-net-value', 'Insider Net Transaction Value', 'quantitative', 'Insider Activity', 'currency', '$', 'alpha_vantage',
 'Net dollar value of insider transactions in last 90 days', 'api', true),

-- Activity metrics
('av-insider-activity-count', 'Insider Transaction Count', 'quantitative', 'Insider Activity', 'count', 'transactions', 'alpha_vantage',
 'Total number of insider transactions in last 90 days', 'api', true),

('av-insider-acquisition-count', 'Insider Acquisition Count', 'quantitative', 'Insider Activity', 'count', 'transactions', 'alpha_vantage',
 'Number of insider buy transactions in last 90 days', 'api', true),

('av-insider-disposal-count', 'Insider Disposal Count', 'quantitative', 'Insider Activity', 'count', 'transactions', 'alpha_vantage',
 'Number of insider sell transactions in last 90 days', 'api', true),

-- Trend metrics
('av-insider-activity-trend', 'Insider Activity Trend', 'quantitative', 'Insider Activity', 'score', '-1 to +1', 'alpha_vantage',
 'Trend in insider activity: -1 (increasing selling) to +1 (increasing buying)', 'calculated', true),

('av-insider-concentration', 'Insider Transaction Concentration', 'quantitative', 'Insider Activity', 'percentage', '%', 'alpha_vantage',
 'Percentage of insider transactions from C-suite executives vs other insiders', 'calculated', true),

-- Composite scores
('av-insider-confidence-score', 'Insider Confidence Score', 'quantitative', 'Insider Activity', 'score', '0 to 100', 'alpha_vantage',
 'Composite score of insider confidence based on buy/sell ratio, trend, and value', 'calculated', true)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  collection_method = EXCLUDED.collection_method,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;

-- Add helpful view for sentiment factors
CREATE OR REPLACE VIEW sentiment_factors AS
SELECT
  id,
  name,
  category,
  data_type,
  unit,
  description,
  collection_method
FROM factor_definitions
WHERE category IN ('News & Sentiment', 'Insider Activity')
  AND is_active = true
ORDER BY category, name;

COMMENT ON VIEW sentiment_factors IS 'All active sentiment and insider activity factors for IPS configuration';
