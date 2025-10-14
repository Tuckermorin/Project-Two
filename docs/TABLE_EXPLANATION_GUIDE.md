# Complete Guide: Every Table in Your App

Let me explain **exactly** what each table does and how it fits into your trading system. I'll be intuitive and explain the **real-world purpose** of each one.

---

## 🎯 THE CORE: Your Trading Flow

Think of your app like this workflow:

```
1. You create an IPS (Investment Policy Statement)
   ↓
2. You add symbols to your watchlist
   ↓
3. Your agent scans candidates and recommends trades based on IPS
   ↓
4. You enter a trade
   ↓
5. System monitors the trade (snapshots)
   ↓
6. You exit the trade
   ↓
7. AI analyzes what happened (post-mortem)
   ↓
8. RAG system learns from the outcome (embeddings)
```

Now let's see which tables support each step...

---

## 📋 TIER 1: Core Trading Tables (Must Keep)

### 1. **`trades`** - Your Actual Trades
**40 rows | 65 columns**

**What it is:**
This is THE most important table. Every trade you enter (like "Sell TSLA $110/$109 put credit spread") is a row here.

**What it stores:**
- Basic info: symbol (TSLA), strikes ($110/$109), expiration date
- Entry/exit data: when you opened it, when you closed it
- P&L: how much you made or lost
- Status: active vs. closed
- Your IPS that recommended it

**Real example from your data:**
```
Trade: OKLO put credit spread
- Short strike: $110
- Long strike: $109
- Credit received: $0.18
- Contracts: 15
- Status: closed
- Profit: $210 (77.8%)
```

**Why it matters:**
Without this, you have no record of your trades. This is your trading journal.

**Problem:** It's BLOATED with 65 columns. Should be ~35.

---

### 2. **`ips_configurations`** - Your Trading Strategy Rules
**1 row | 19 columns**

**What it is:**
Your IPS (Investment Policy Statement) is like your "trading rulebook." It defines what makes a good trade.

**What it stores:**
- Name: "Put Credit Strategy for 1-14 DTE"
- 21 factors you care about (IV rank, delta, etc.)
- Exit rules: when to take profit (50%) or stop loss (250%)
- Total trades using this IPS: 40

**Real-world analogy:**
Think of this as your personal "checklist" for entering trades. Like a pilot's pre-flight checklist.

**Why it matters:**
Your agent uses THIS to decide which trades to recommend. Change your IPS = change what trades you get.

---

### 3. **`ips_factors`** - The Individual Rules in Your IPS
**21 rows | 14 columns**

**What it is:**
This breaks down your IPS into specific factors. Each row is ONE rule.

**What it stores:**
- Factor name: "52W Range Position"
- Target: ≥ 0.4 (stock should be at least 40% up from 52-week low)
- Weight: 3 points (how important this rule is)
- Enabled: true/false

**Real example:**
```
Factor: "52W Range Position"
- Weight: 3 points
- Target: Stock must be ≥ 40% up from 52-week low
- If met: Trade gets 3 points toward IPS score
```

**Why it matters:**
Your IPS score (out of 100) comes from adding up all the factors that passed. Higher score = better trade candidate.

---

### 4. **`factor_definitions`** - The Master List of All Possible Factors
**210 rows | 12 columns**

**What it is:**
This is like a "menu" of all possible factors you COULD use in an IPS. You have 210 options to choose from.

**What it stores:**
- Name: "Economic Moat"
- Description: "Competitive advantages that protect against competition"
- Category: Business Model & Industry
- Data type: rating (1-5)
- Is it active? false (not currently being used)

**Why it matters:**
When you build a new IPS, you pick factors from this master list. Think of it as your "ingredient list" when making a recipe (IPS).

**Current state:**
Most factors are inactive. Only 21 are being used in your active IPS.

---

### 5. **`watchlist_items`** - Stocks You're Watching
**22 rows | 22 columns**

**What it is:**
Stocks you're interested in trading. Like a bookmark list.

**What it stores:**
- Symbol: MDB (MongoDB)
- Current price: $321.53
- Sector: TECHNOLOGY
- Fundamentals: P/E, market cap, beta, etc.
- Last refreshed: when we last updated the price

**Why it matters:**
Your agent scans THESE symbols when looking for trade candidates. If a symbol isn't on your watchlist, the agent won't consider it.

**Real-world flow:**
```
1. You add MDB to watchlist
2. Nightly, your agent checks: "Does MDB meet my IPS criteria?"
3. If yes → Agent recommends a trade
4. You review and enter the trade
```

---

## 📊 TIER 2: Market Data Tables (Essential)

### 6. **`vol_regime_daily`** - Historical Volatility Data
**4,001 rows | 12 columns**

**What it is:**
Daily snapshots of volatility metrics for each symbol.

**What it stores:**
- Symbol: FIG
- Date: 2025-09-26
- HV30: 30-day historical volatility
- IV rank: where current IV sits vs. 52-week range
- ATR: Average True Range (daily price movement)

**Why it matters:**
Your IPS factors use this data! For example:
- "IV Rank > 50" ← needs this table
- "HV30 < 40%" ← needs this table

**Current issue:**
Sample row shows all nulls. Data might not be populating correctly.

---

### 7. **`iv_cache`** - IV Rank Cache (For Speed)
**0 rows | 0 columns** ❌

**What it SHOULD be:**
A cache to quickly look up IV rank/percentile without recalculating every time.

**Why it's empty:**
The caching system isn't being used yet. You're probably calculating IV rank on-the-fly.

**Should you keep it?**
Yes, but populate it or it's useless.

---

## 🤖 TIER 3: AI/RAG Tables (For Learning)

### 8. **`trade_embeddings`** - AI Learning from Your Trades
**35 rows | 6 columns**

**What it is:**
When a trade closes, it gets converted into a vector embedding (a bunch of numbers that represent the trade's characteristics).

**What it stores:**
- trade_id: Links to the trade
- embedding: [1536 numbers] - AI representation of the trade
- metadata: Quick facts (win/loss, symbol, strategy, profit %)

**Why it matters:**
This powers your RAG system! When evaluating a new trade:
```
1. Agent sees: "TSLA put credit spread"
2. RAG searches embeddings: "Show me similar trades"
3. Finds: "You did 3 TSLA put credits before - 2 won, 1 lost"
4. Agent uses that info to give better advice
```

**Real-world benefit:**
Your agent gets smarter over time by learning from your past trades.

---

### 9. **`trade_postmortems`** - AI Analysis of Closed Trades
**16 rows | 5 columns**

**What it is:**
After you close a trade, GPT-4 analyzes what happened and writes a detailed report.

**What it stores:**
- trade_id: Links to the trade
- post_mortem_data: Giant JSON with:
  - AI-generated summary (3-4 paragraphs)
  - Key insights: "Exit threshold worked well"
  - Lessons learned: "Set stricter exit at 75% during earnings"
  - IPS effectiveness: Which factors validated vs. failed

**Real example:**
```
Trade: TSLA put credit (2-day hold)
AI Analysis: "Trade succeeded by exiting before earnings IV spike.
             Exit threshold of 70% captured theta decay effectively."
Key Insight: "Early exit rule prevented losses from volatility spike"
Action Item: "Adjust exit to 75% during earnings periods"
```

**Why it matters:**
This is like having a professional trading coach review every trade and tell you what you did right/wrong.

---

### 10. **`snapshot_embeddings`** - RAG for Snapshots
**0 rows** ❌

**What it SHOULD be:**
Like trade_embeddings, but for individual snapshots. This would let you ask: "Show me times when delta reached 0.40 - what happened next?"

**Why it's empty:**
Never implemented. Snapshots aren't being embedded.

**Should you keep it?**
DELETE. You don't need this - trade_embeddings is enough.

---

### 11. **`daily_market_context`** - Economic/Political News Summaries
**0 rows** (just added today!)

**What it is:**
Daily AI-generated summaries of economic/political news (Fed rate cuts, inflation, etc.).

**What it stores:**
- Date: 2025-10-13
- Summary: "Markets rallied as inflation data came in lower than expected..."
- Key themes: ["Fed rate cuts", "Tech strength", "Inflation cooling"]
- Sentiment: bullish (+0.35)
- Embedding: For RAG similarity search

**Why it matters:**
Your agent can now say:
```
"Current market sentiment is bullish due to Fed rate cut expectations.
This supports your bullish put credit spread strategy."
```

**Why it's empty:**
We just built this today! It will populate during tonight's EOD job.

---

### 12. **`reddit_sentiment`** - Social Media Sentiment
**86 rows | 12 columns**

**What it is:**
Tracks how much a stock is being talked about on Reddit and the sentiment.

**What it stores:**
- Symbol: BWXT
- Mention count: 0 (not trending)
- Sentiment score: 0 (neutral)
- Confidence: low

**Why it matters:**
Can be used as an IPS factor: "Avoid stocks with negative Reddit sentiment" or "Target stocks trending on WSB."

**Current state:**
Most rows show zero mentions. May not be actively scraping Reddit.

---

## 📸 TIER 4: Monitoring Tables (Critical but Broken!)

### 13. **`trade_snapshots`** - Daily Health Checks of Your Trades
**0 rows** ❌ **CRITICAL PROBLEM**

**What it SHOULD be:**
Every day (or multiple times per day), capture the current state of each active trade:
- Current stock price
- Current spread price
- Greeks (delta, theta, vega)
- Unrealized P&L
- Market context (SPY, VIX)

**Why it's empty:**
Your snapshot service exists but ISN'T RUNNING! This is a critical issue.

**Why this matters SO MUCH:**
Without snapshots, you can't:
1. Calculate behavioral metrics (peak P&L, days at profit, max delta reached)
2. Detect patterns ("trades that hit peak profit on day 3 tend to reverse")
3. Monitor risk ("delta reached 0.40 - time to exit?")
4. Feed RAG system with temporal data

**What should be there:**
For your 40 trades, you should have HUNDREDS of snapshots by now. If trades last 7 days on average, that's 40 trades × 7 days = 280 snapshots minimum.

**Real-world analogy:**
This is like having a fitness tracker that takes your vitals (heart rate, steps, calories) throughout the day. Without it, you only know your start/end weight but not what happened in between.

---

### 14. **`trade_monitor_cache`** - Real-time Monitoring Cache
**0 rows** ❌

**What it SHOULD be:**
Cache for real-time monitoring of active trades (current greeks, prices, alerts).

**Why it's empty:**
Never implemented or not being used.

**Should you keep it?**
DELETE. If you need caching, use Redis or the snapshot system.

---

## 🔧 TIER 5: System Tables (Infrastructure)

### 15. **`api_sync_log`** - API Call Tracking
**0 rows** ❌

**What it SHOULD be:**
Logs every API call to Alpha Vantage, Tavily, etc. for debugging and rate limiting.

**Why it's empty:**
Not being used. You might be logging to console instead.

**Should you keep it?**
DELETE. If you want API logging, implement it properly or use a logging service.

---

### 16. **`news_sentiment_history`** - Alpha Intelligence News Data
**0 rows** ❌

**What it SHOULD be:**
Symbol-specific news sentiment from Alpha Vantage NEWS_SENTIMENT API.

**Why it's empty:**
Alpha Intelligence system might not be activated or data isn't being fetched.

**Different from daily_market_context:**
- daily_market_context: General market news (Fed, economy, politics)
- news_sentiment_history: Symbol-specific news (TSLA earnings, MDB guidance)

**Should you keep it?**
Keep if you plan to use Alpha Intelligence. Delete if not.

---

### 17. **`insider_transactions_history`** - Insider Trading Data
**0 rows** ❌

**What it SHOULD be:**
Tracks when company insiders buy/sell stock (bullish/bearish signal).

**Why it's empty:**
Alpha Intelligence system not activated.

**Should you keep it?**
Keep if you plan to use this as an IPS factor. Delete if not.

---

## 🎯 HOW THEY ALL WORK TOGETHER

Here's the **complete flow** through your app:

### **Setup Phase:**
```
1. factor_definitions: You browse the 210 possible factors
2. ips_configurations: You create an IPS with 21 factors
3. ips_factors: Each of your 21 rules is stored here
4. watchlist_items: You add 22 stocks to watch
```

### **Scanning Phase (Daily):**
```
1. vol_regime_daily: Agent checks volatility data for each symbol
2. watchlist_items: Agent gets current prices/fundamentals
3. ips_factors: Agent checks: "Does symbol meet all 21 rules?"
4. reddit_sentiment: (Optional) Check social sentiment
5. daily_market_context: Agent considers overall market conditions
```

### **Trading Phase:**
```
1. trades: You enter a trade (stores in this table)
2. trade_snapshots: System captures snapshots throughout trade life ❌ NOT WORKING
```

### **Exit Phase:**
```
1. trades: You close trade → status = 'closed', realized_pnl calculated
2. trade_postmortems: GPT-4 analyzes what happened
3. trade_embeddings: Trade converted to vector for RAG learning
```

### **Learning Phase:**
```
When evaluating future trades:
1. trade_embeddings: "Find similar past trades"
2. daily_market_context: "What's the current market environment?"
3. trade_postmortems: "What did we learn from similar trades?"
→ Agent gives smarter recommendations over time
```

---

## ⚠️ THE BIG PROBLEMS

### **Problem #1: `trade_snapshots` is Empty**
**Impact:** CRITICAL
**Why it matters:** Without snapshots, you can't:
- Track how trades perform over time
- Calculate behavioral metrics
- Detect patterns
- Monitor risk in real-time

**Fix:** Investigate why snapshot job isn't running

---

### **Problem #2: `trades` Table is Bloated (65 columns)**
**Impact:** HIGH
**Why it matters:**
- Storing behavioral metrics IN trades (should be in snapshots)
- Duplicate columns (5 columns for 2 strike prices!)
- Current state greeks (should come from latest snapshot)

**Fix:** Remove 25+ redundant columns

---

### **Problem #3: 7 Empty Tables**
**Impact:** MEDIUM
**Why it matters:** Taking up space, causing confusion, probably not needed

**Tables to delete:**
- snapshot_embeddings
- trade_monitor_cache
- api_sync_log

**Tables to keep but populate:**
- iv_cache (if you want caching)
- news_sentiment_history (if using Alpha Intelligence)
- insider_transactions_history (if using Alpha Intelligence)
- daily_market_context (will populate tonight)

---

## ✅ MY RECOMMENDATIONS

### **Keep & Use Actively (10 tables):**
1. ✅ trades (but clean up columns)
2. ✅ ips_configurations
3. ✅ ips_factors
4. ✅ factor_definitions
5. ✅ watchlist_items
6. ✅ vol_regime_daily
7. ✅ trade_embeddings
8. ✅ trade_postmortems
9. ✅ daily_market_context
10. ✅ trade_snapshots (FIX IT - most critical!)

### **Keep If You'll Use (2-3 tables):**
11. ⚠️ iv_cache (implement or delete)
12. ⚠️ reddit_sentiment (using it? keep it. not using? delete)
13. ⚠️ news_sentiment_history (Alpha Intelligence)
14. ⚠️ insider_transactions_history (Alpha Intelligence)

### **Delete (3 tables):**
15. ❌ snapshot_embeddings
16. ❌ trade_monitor_cache
17. ❌ api_sync_log

---

## 🚀 NEXT STEPS

**Most Important:** Fix `trade_snapshots` first!

Without snapshots working, half your system is broken. Once that's fixed, we can:
1. Clean up the bloated trades table
2. Delete unused tables
3. Implement computed views for behavioral metrics

**Questions for you:**
1. Do you want to use Alpha Intelligence (news_sentiment, insider_transactions)?
2. Is Reddit sentiment important to you?
3. When can we fix the snapshot system? (This is blocking everything else)

---

Does this help you understand how everything fits together? Let me know which tables you want to keep/delete and I'll create the migration scripts!
