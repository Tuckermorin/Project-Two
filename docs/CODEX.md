
🚀🚀🚀 [AgentV3] NEW CODE VERSION - Oct 8 2025 - TOLERANCE FIX v2 + 50 STRIKES 🚀🚀🚀
[AgentV3] Starting run c3d478e3-3d47-41aa-b10e-900e33b36119 with 3 symbols, IPS: 20edfe58-2e44-4234-96cd-503011577cf4 
[FetchIPS] Loading IPS configuration: 20edfe58-2e44-4234-96cd-503011577cf4
[FetchIPS] Loaded macro data: inflation=2.7%
[loadIPSById] Loading IPS with ID: 20edfe58-2e44-4234-96cd-503011577cf4
[loadIPSById] Found IPS: Put Credit Strategy for 1 - 14 DTE Contracts
[loadIPSById] Loaded 21 factors
[loadIPSById] Factor: 52W Range Position (factor_id: calc-52w-range-position), weight: 0.3, threshold: 0.4, threshold_max: null, direction: gte
[loadIPSById] Factor: Distance from 52W High (factor_id: calc-dist-52w-high), weight: 0.2, threshold: 0.15, threshold_max: null, direction: lte
[loadIPSById] Factor: 200 Day Moving Average (factor_id: av-200-day-ma), weight: 0.3, threshold: 1, threshold_max: null, direction: gte
[loadIPSById] Factor: 50 Day Moving Average (factor_id: av-50-day-ma), weight: 0.3, threshold: 1, threshold_max: null, direction: gte
[loadIPSById] Factor: Analyst Rating Average (factor_id: tavily-analyst-rating-avg), weight: 0.2, threshold: 10, threshold_max: null, direction: gte
[loadIPSById] Factor: Market Cap Category (factor_id: calc-market-cap-category), weight: 0.3, threshold: 2000000000, threshold_max: null, direction: gte
[loadIPSById] Factor: Inflation Rate (factor_id: av-inflation), weight: 0.1, threshold: 4, threshold_max: null, direction: lte
[loadIPSById] Factor: Momentum (factor_id: av-mom), weight: 0.7, threshold: 20, threshold_max: null, direction: gte   
[loadIPSById] Factor: IV Rank (factor_id: opt-iv-rank), weight: 0.9, threshold: 50, threshold_max: null, direction: gte
[loadIPSById] Factor: Theta (factor_id: opt-theta), weight: 0.4, threshold: 0.01, threshold_max: null, direction: gte 
[loadIPSById] Factor: Vega (factor_id: opt-vega), weight: 0.4, threshold: 0, threshold_max: null, direction: lte      
[loadIPSById] Factor: Implied Volatility (factor_id: opt-iv), weight: 0.6, threshold: 0.4, threshold_max: null, direction: gte
[loadIPSById] Factor: Open Interest (factor_id: opt-open-interest), weight: 0.7, threshold: 500, threshold_max: null, direction: gte
[loadIPSById] Factor: Put/Call Ratio (factor_id: opt-put-call-ratio), weight: 0.4, threshold: 1, threshold_max: null, direction: lte
[loadIPSById] Factor: Put/Call OI Ratio (factor_id: calc-put-call-oi-ratio), weight: 0.3, threshold: 1, threshold_max: null, direction: lte
[loadIPSById] Factor: Bid-Ask Spread (factor_id: opt-bid-ask-spread), weight: 0.8, threshold: 0.05, threshold_max: null, direction: lte
[loadIPSById] Factor: IV Percentile (factor_id: calc-iv-percentile), weight: 0.6, threshold: 50, threshold_max: null, direction: gte
[loadIPSById] Factor: News Sentiment Score (factor_id: tavily-news-sentiment-score), weight: 0.4, threshold: 0.2, threshold_max: null, direction: gte
[loadIPSById] Factor: News Volume (factor_id: tavily-news-volume), weight: 0.2, threshold: 2, threshold_max: null, direction: lte
[loadIPSById] Factor: Social Media Sentiment (factor_id: tavily-social-sentiment), weight: 0.2, threshold: 2, threshold_max: null, direction: gte
[loadIPSById] Factor: Delta (factor_id: opt-delta), weight: 1, threshold: 0.18, threshold_max: null, direction: lte   
[loadIPSById] Final config with 21 enabled factors, normalized weights sum to 1
[FetchIPS] Loaded IPS: Put Credit Strategy for 1 - 14 DTE Contracts with 21 factors
[PreFilterGeneral] Pre-filtering 3 symbols on general factors
[PreFilterGeneral] Found 1 high-weight general factors to check
Fetching company overview for AMD
Fetching MOM(10) for AMD
[Cache MISS] Search: "AMD stock news earnings" (topic: news)
[Tavily Search] Schema validation failed for query: "AMD stock news earnings"
[Tavily Search] Validation errors: undefined
[Tavily Search] Actual response type: object
[Tavily Search] Actual response: {
  "query": "AMD stock news earnings",
  "follow_up_questions": null,
  "answer": null,
  "images": [],
  "results": [
    {
      "url": "https://www.forbes.com/sites/siladityaray/2025/10/06/amd-shares-surge-24-after-announcing-multibillion-dollar-deal-openai/",
      "title": "AMD Shares Surge 24% After Announcing Multibillion-Dollar Deal OpenAI - Forbes",
      "score": 0.66464967,
      "published_date": "Mon, 06 Oct 2025 11:31:51 GMT",
      "content": "# AMD Shares Surge 24% After Announcing Multibillion-Dollar Deal OpenAI Siladitya Ray is a New Delhi-based Forbes news team reporter. AMD shares surged more than 24% in premarket trading on Monday after the chipmaker announced a new multibillion-dollar deal with OpenAI, in a move that looks to challenge AI giant Nvidia, which recently announced plans to acquire a 4% stake in rival Intel. According to an SEC filing made by AMD, the chipmaker has issued OpenAI a warrant for up to 160 million shares, roughly 10% of the company, at one cent per share, which will be vested when specific share-price targets and commercial milestones are met. AMD’s share price surged 24% to $204.50 in the premarket early on Monday, following the deal’s announcement. Share confidential information with Forbes.",
      "raw_content": null
    },
    {
      "url": "https://fortune.com/2025/10/06/amd-stock-jumps-on-openai-deal-as-big-tech-seeks-to-reduce-reliance-on-nvidia/",
      "title": "AMD stock soars after striking a landmark deal with OpenAI—part of Sam Altman’s bid to loosen Nvidia’s grip on AI - Fortune",
      "score": 0.61972505,
      "published_date": "Mon, 06 Oct 2025 16:20:00 GMT",
      "content": "# AMD stock jumps on OpenAI deal as Big Tech seeks to reduce reliance on Nvidia The company’s stock jumped 28% in midday trading on the news of the multiyear deal, which could generate tens of billions of dollars in annual revenue for AMD over time and marks one of the largest AI infrastructure commitments that’s not based on processors from industry leader Nvidia. As part of the agreement, OpenAI will use AMD’s next generation of AI GPU chips in massive data-center deployments starting in 2026. The deal underscores how Big Tech and leading AI developers are broadening their supply chains to reduce dependence on Nvidia, whose GPUs have so far dominated the market for AI chips.",   
      "raw_content": null
    },
    {
      "url": "https://www.investors.com/news/technology/amd-stock-chipmaker-latest-openai-deal/",
      "title": "AMD Stock Surges As Chipmaker Latest To Get OpenAI Deal - Investor's Business Daily",
      "score": 0.60861784,
      "published_date": "Mon, 06 Oct 2025 13:36:00 GMT",
      "content": "# AMD Stock Surges As Chipmaker Latest To Get OpenAI Deal AMD stock surged on the news. Also, AMD gave OpenAI a warrant for up to 160 million shares of AMD stock that will vest as milestones are achieved. Those targets require AMD's stock price to continue to increase in value and for OpenAI to achieve technical and commercial milestones needed to enable AMD deployments at scale. ## AMD Stock Breaks Out In morning trades on the stock market today, AMD jumped 33% to 219.10. With the advance, AMD stock broke out of a seven-week consolidation pattern with a buy point of 186.65, according to IBD MarketSurge charts. ## Stock Market Today: Dow Jones Dips; AMD Soars On OpenAI Deal, Tesla, Palantir Rebound (Live Coverage)",
      "raw_content": null
    },
    {
      "url": "https://www.investopedia.com/s-and-p-500-gains-and-losses-today-amd-stock-pops-on-openai-deal-applovin-plunges-11825060",
      "title": "S&P 500 Gains and Losses Today: AMD Stock Pops on OpenAI Deal; AppLovin Plunges - Investopedia",      
      "score": 0.5596998,
      "published_date": "Mon, 06 Oct 2025 20:29:54 GMT",
      "content": "Advanced Micro Devices (AMD) shares added nearly a quarter of their value in Monday's session, outpacing every other stock in S&P 500, after the chipmaker announced a major artificial intelligence partnership with OpenAI. These Stocks Got a Boost From OpenAI's DevDay Buzz Top Stock Movers Now: AMD, Tesla, Comerica, Verizon, and More 5 Things to Know Before the Stock Market Opens S&P 500 Gains & Losses Today: Intel Stock Extends Rally, Freeport-McMoRan Drops S&P 500 Gain & Losses Today: Oracle, Nvidia Shares Advance; Kenvue Stock Slips OpenAI and AMD Announce Massive AI Partnership, Sending AMD Shares Soaring Markets News, Oct 6, 2025: Nasdaq, S&P 500 Post New Closing Highs to Begin Week; AMD Soars on OpenAI Deal; Gold, Bitcoin Rise to Records S&P 500 Gains and Losses Today: Pfizer and Merck Jump; Payments Stocks Decline",
      "raw_content": null
    },
    {
      "url": "https://seekingalpha.com/news/4502288-amd-rating-split-quant-still-sees-buy-but-sa-analysts-are-on-hold",
      "title": "AMD stock rating split: Quant still sees Buy, but SA analysts are on Hold (AMD:NASDAQ) - Seeking Alpha",
      "score": 0.5533369,
      "published_date": "Tue, 07 Oct 2025 12:03:55 GMT",
      "content": "Search for Symbols, analysts, keywords # AMD stock rating split: Quant still sees Buy, but SA analysts are on Hold (AMD) StockBy: Sinchita Mitra, SA News Editor Advanced Micro Devices (NASDAQ:AMD) stock hoped to continue its upbeat mood after closing 23.7% on Monday after it inked a partnership with OpenAI. AMD's shares soared after the company announced * Analysts believe the OpenAI deal positions AMD as a strong AI competitor, validating product quality and brightening future prospects. * The deal is forecasted to accelerate AMD's growth and boost its valuation, with some analysts predicting a target toward $1 trillion and higher data center revenue growth. ### About AMD Stock | AMD | - | - |",
      "raw_content": null
    },
    {
      "url": "https://seekingalpha.com/news/4501961-4-stocks-to-watch-on-monday-tsla-amd-fitb-ba",
      "title": "4 stocks to watch on Monday: TSLA, AMD, FITB, BA (SP500:) - Seeking Alpha",
      "score": 0.5443418,
      "published_date": "Mon, 06 Oct 2025 13:03:15 GMT",
      "content": "Entering text into the input field will update the search result below Entering text into the input field will update the search result below # 4 stocks to watch on Monday: TSLA, AMD, FITB, BA Oct. 06, 2025 9:03 AM ETBA, AMD, FITB, TSLABy: Sinchita Mitra, SA News Editor ### AMD's $70 Billion Surge: OpenAI Deal You Should Be Questioning Gain access to the world's leading investment community. | Symbol | Last Price | % Chg | | HIVE | 5.57 | 25.17% | | Symbol | Last Price | % Chg | | Opendoor Technologies Inc. | AMD | 203.71 | 23.71% | | Advanced Micro Devices, Inc. * ### AMD's $70 Billion Surge: OpenAI Deal You Should Be Questioning",
      "raw_content": null
    },
    {
      "url": "https://www.forbes.com/sites/siladityaray/2025/10/06/amd-shares-surge-30-after-multibillion-dollar-deal-with-openai/",
      "title": "AMD Shares Surge 30% After Multibillion-Dollar Deal With OpenAI - Forbes",
      "score": 0.534443,
      "published_date": "Mon, 06 Oct 2025 14:26:11 GMT",
      "content": "# AMD Shares Surge 30% After Multibillion-Dollar Deal With OpenAI AMD stock soared as trading opened Monday morning, after the chipmaker announced a multibillion-dollar deal with OpenAI in a move that could challenge AI giant Nvidia, which earlier announced plans to acquire a stake in rival Intel. The deal is AMD’s most significant win in its attempt to challenge Nvidia’s dominance in the AI chip market, and also helps OpenAI reduce its dependence on Nvidia’s GPUs. AMD’s shares dropped after this deal was announced as it threatened to dent a critical moat the company had over Nvidia. Nvidia Will Invest $5 Billion In Rival Chipmaker Intel, Following $10 Billion Deal With U.S. Government (Forbes)",
      "raw_content": null
    },
    {
      "url": "https://www.tipranks.com/news/advanced-micro-devices-stock-amd-is-up-36-ytd-what-lies-ahead-for-the-chipmaker",
      "title": "Advanced Micro Devices Stock (AMD) Is up 36% YTD, What Lies Ahead for the Chipmaker? - TipRanks",     
      "score": 0.5163278,
      "published_date": "Mon, 06 Oct 2025 10:32:03 GMT",
      "content": "Top Insiders Stocks Top Stocks Top Analyst Stocks AI Analyst Top Stocks Top Insiders Stocks Dividend Stocks Best Dividend Stocks Dividend Stock Comparison STOCKS Advanced Micro Devices (AMD) stock has recovered well from the weakness seen earlier this year and is up 36% year-to-date, driven by renewed hopes about the company capturing demand in the artificial intelligence (AI) chips market through its new graphics processing units (GPUs) while continuing to gain market share in the CPU server market. ## **Analysts’ Views on AMD Stock** Likewise, Piper Sandler analyst Harsh Kumar reiterated a Buy rating on AMD stock with a price target of $190. The average AMD stock price target of $187.32 indicates 13.8% upside potential from current levels. Analyst Top Stocks",
      "raw_content": null
    },
    {
      "url": "https://www.tradingview.com/news/reuters.com,2025:newsml_L3N3VJ0K2:0-amd-rises-on-report-intel-considers-adding-rival-as-foundry-customer/",
      "title": "AMD rises on report Intel considers adding rival as foundry customer - TradingView",
      "score": 0.49729064,