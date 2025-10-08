  "has_overview": true,
  "current_price": 438.69,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "TSLA",
  "factor_key": "opt-bid-ask-spread",
  "display_name": "Bid-Ask Spread",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 438.69,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "TSLA",
  "factor_key": "calc-iv-percentile",
  "display_name": "IV Percentile",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 438.69,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "TSLA",
  "factor_key": "tavily-news-sentiment-score",
  "display_name": "News Sentiment Score",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 438.69,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "TSLA",
  "factor_key": "tavily-news-volume",
  "display_name": "News Volume",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 438.69,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "TSLA",
  "factor_key": "tavily-social-sentiment",
  "display_name": "Social Media Sentiment",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 438.69,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "TSLA",
  "factor_key": "opt-delta",
  "display_name": "Delta",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 438.69,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS] TSLA: Score=65.1%, Tier=speculative, Passed=9, Failed=12
[RAGScoring] TSLA: Composite=NaN (no historical data available)
[RAG] Finding similar trades for AMD put_credit_spread
[RAG] Using OpenAI for embeddings
[RAG] Found 0 similar trades (threshold: 0.75)
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "calc-52w-range-position",
  "display_name": "52W Range Position",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=1.0589096718365172, target=≥0.4, passed=true
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "calc-dist-52w-high",
  "display_name": "Distance from 52W High",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=-0.03903665475717875, target=≤0.15, passed=true
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "av-200-day-ma",
  "display_name": "200 Day Moving Average",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] AMD 200DMA: sma200=129.406, currentPrice=235.56
[getFactorValue] AMD 200DMA CALCULATED: ratio=1.82
[IPS Factor] undefined: value=1.8203174505046134, target=≥1, passed=true
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "av-50-day-ma",
  "display_name": "50 Day Moving Average",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=1.3965235125329034, target=≥1, passed=true
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "tavily-analyst-rating-avg",
  "display_name": "Analyst Rating Average",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "calc-market-cap-category",
  "display_name": "Market Cap Category",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "av-inflation",
  "display_name": "Inflation Rate",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "av-mom",
  "display_name": "Momentum",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=74.68, target=≥20, passed=true
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-iv-rank",
  "display_name": "IV Rank",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=45.1, target=≥50, passed=false
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-theta",
  "display_name": "Theta",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-vega",
  "display_name": "Vega",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-iv",
  "display_name": "Implied Volatility",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-open-interest",
  "display_name": "Open Interest",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-put-call-ratio",
  "display_name": "Put/Call Ratio",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "calc-put-call-oi-ratio",
  "display_name": "Put/Call OI Ratio",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-bid-ask-spread",
  "display_name": "Bid-Ask Spread",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "calc-iv-percentile",
  "display_name": "IV Percentile",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "tavily-news-sentiment-score",
  "display_name": "News Sentiment Score",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "tavily-news-volume",
  "display_name": "News Volume",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "tavily-social-sentiment",
  "display_name": "Social Media Sentiment",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "AMD",
  "factor_key": "opt-delta",
  "display_name": "Delta",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 235.56,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS] AMD: Score=68.8%, Tier=speculative, Passed=10, Failed=11
[RAGScoring] AMD: Composite=NaN (no historical data available)
[RAG] Finding similar trades for NVDA put_credit_spread
[RAG] Using OpenAI for embeddings
[RAG] Found 0 similar trades (threshold: 0.75)
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "calc-52w-range-position",
  "display_name": "52W Range Position",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=0.9424549980850248, target=≥0.4, passed=true
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "calc-dist-52w-high",
  "display_name": "Distance from 52W High",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=0.03145773357759759, target=≤0.15, passed=true
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "av-200-day-ma",
  "display_name": "200 Day Moving Average",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] NVDA 200DMA: sma200=143.8855, currentPrice=185.04
[getFactorValue] NVDA 200DMA CALCULATED: ratio=1.29
[IPS Factor] undefined: value=1.286022566554656, target=≥1, passed=true
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "av-50-day-ma",
  "display_name": "50 Day Moving Average",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=1.0350614190141634, target=≥1, passed=true
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "tavily-analyst-rating-avg",
  "display_name": "Analyst Rating Average",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "calc-market-cap-category",
  "display_name": "Market Cap Category",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "av-inflation",
  "display_name": "Inflation Rate",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "av-mom",
  "display_name": "Momentum",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=12.14, target=≥20, passed=false
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-iv-rank",
  "display_name": "IV Rank",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS Factor] undefined: value=30.6, target=≥50, passed=false
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-theta",
  "display_name": "Theta",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-vega",
  "display_name": "Vega",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-iv",
  "display_name": "Implied Volatility",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-open-interest",
  "display_name": "Open Interest",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-put-call-ratio",
  "display_name": "Put/Call Ratio",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "calc-put-call-oi-ratio",
  "display_name": "Put/Call OI Ratio",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-bid-ask-spread",
  "display_name": "Bid-Ask Spread",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "calc-iv-percentile",
  "display_name": "IV Percentile",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "tavily-news-sentiment-score",
  "display_name": "News Sentiment Score",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "tavily-news-volume",
  "display_name": "News Volume",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "tavily-social-sentiment",
  "display_name": "Social Media Sentiment",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[getFactorValue] Evaluating: {
  "symbol": "NVDA",
  "factor_key": "opt-delta",
  "display_name": "Delta",
  "has_fundamentalData": true,
  "has_overview": true,
  "current_price": 185.04,
  "overview_keys": [
    "Symbol",
    "AssetType",
    "Name",
    "Description",
    "CIK",
    "Exchange",
    "Currency",
    "Country",
    "Sector",
    "Industry"
  ]
}
[IPS] NVDA: Score=69.9%, Tier=speculative, Passed=10, Failed=11
[RAGScoring] NVDA: Composite=NaN (no historical data available)
[TieredSelection] Sorting 50 candidates by IPS score
[TieredSelection] Selected top 20 candidates by IPS score
[TieredSelection] Score range: 69.9-82.3 (avg: 74.9)
[TieredSelection] Tier breakdown:
  Elite (IPS≥90): 0 trades
  Quality (IPS 75-89): 6 trades
  Speculative (IPS 60-74): 14 trades
[GenerateRationales] Generating AI rationales for 20 selected trades
[GenerateRationales] AMD: Rationale generated (337 chars)
[GenerateRationales] AMD: Rationale generated (452 chars)
[GenerateRationales] TSLA: Rationale generated (435 chars)
[GenerateRationales] AMD: Rationale generated (317 chars)
[GenerateRationales] AMD: Rationale generated (396 chars)
[GenerateRationales] AMD: Rationale generated (355 chars)
[GenerateRationales] TSLA: Rationale generated (436 chars)