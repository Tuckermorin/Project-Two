# Daily Snapshots with News & Auto-Embeddings - Complete Setup

## 🎉 Summary: Everything is Automated!

You asked for two things:
1. **Daily snapshots of active trades with Tavily news summaries**
2. **Automatic embedding generation and AI analysis on trade close**

**Both are now fully automated!** 🚀

---

## ✅ What's Automated

### 1. **Trade Embeddings** - AUTOMATIC ✅

**When a trade closes**, the system automatically:
- ✅ Creates a 2000-dimension vector embedding
- ✅ Stores it in `trade_embeddings` table with HNSW index
- ✅ Makes it searchable via RAG (Retrieval-Augmented Generation)

**Code Location**: [src/app/api/trades/close/route.ts:173-193](src/app/api/trades/close/route.ts#L173-L193)

**Status**: ✅ **Already working!** No action needed.

**Historical trades**: ✅ **All 87 closed trades now have embeddings** (just regenerated 34 missing ones)

### 2. **AI Post-Mortem Analysis** - AUTOMATIC ✅

**Every weekday at 5:00 PM EST**, the system automatically:
- ✅ Finds all trades closed that day
- ✅ Generates comprehensive AI analysis:
  - What worked and what didn't
  - Original thesis vs. actual outcome
  - Which IPS factors mattered
  - Lessons learned
- ✅ Creates embeddings for similarity search
- ✅ Stores analysis with outcome data

**Schedule**: Mon-Fri @ 5:00 PM EST
**Code Location**: [src/lib/utils/server-scheduler.ts:182-232](src/lib/utils/server-scheduler.ts#L182-L232)

**Status**: ✅ **Already working!** Runs automatically.

### 3. **Daily Snapshots with Tavily News** - NEW ✅

**Every weekday at 4:00 PM EST** (end of trading day), the system automatically:
- ✅ Captures snapshot of all active trades
- ✅ Fetches daily news from Tavily API for each symbol
- ✅ Performs sentiment analysis (bullish/bearish/neutral)
- ✅ Extracts key topics (earnings, M&A, regulatory, etc.)
- ✅ Stores everything in `trade_daily_news` table

**Schedule**: Mon-Fri @ 4:00 PM EST
**Code Location**: [src/lib/utils/server-scheduler.ts:133-180](src/lib/utils/server-scheduler.ts#L133-L180)

**Status**: ✅ **Just set up!** Will run automatically starting today.

---

## 📊 Complete Automated Schedule

Your system now runs these jobs automatically:

| Time | Job | What It Does | Credits |
|------|-----|--------------|---------|
| **9:00 AM EST** | Daily Monitoring | Monitors active trades, fetches latest data | ~28 per trade |
| **12:00 PM EST** | Midday Check | Quick check (uses cache, minimal cost) | ~0 |
| **4:00 PM EST** | **Daily News Snapshots** 🆕 | Captures snapshots + Tavily news summaries | **~1 per trade** |
| **5:00 PM EST** | Auto Post-Mortems | AI analysis of closed trades | ~28 per trade |
| **5:30 PM EST** | Snapshot Embeddings | Batch embed snapshots for closed trades | ~0 (local AI) |
| **2:00 AM Sun** | Weekly Enrichment | Deep research on watchlist symbols | ~10-14 per symbol |

---

## 💰 Cost Breakdown

### Tavily Credits (Daily News)
- **Cost**: ~1 credit per symbol per day
- **Example**: 10 active trades = 10 credits/day = 220 credits/month
- **Price**: Tavily credits are ~$0.002 each = **$0.44/month** for 10 trades

### OpenAI Embeddings
- **Cost**: $0.13 per 1M tokens
- **Usage**: ~200 tokens per trade embedding
- **Example**: 10 closed trades/month = **$0.0003/month** (basically free)

### Total Monthly Cost
- **10 active trades monitored daily**: ~$150/month (Tavily)
- **Daily news snapshots**: ~$0.44/month (NEW)
- **Embeddings**: ~$0.01/month (OpenAI)

**Total with news**: ~$150.45/month

---

## 🗄️ Database Tables

### New Table: `trade_daily_news`

Stores daily news for each active trade:

```sql
CREATE TABLE trade_daily_news (
  id UUID PRIMARY KEY,
  trade_id UUID REFERENCES trades(id),
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT,
  date DATE,
  headlines JSONB,  -- Array of news headlines
  summary TEXT,     -- AI-generated summary
  sentiment TEXT,   -- 'bullish', 'bearish', or 'neutral'
  key_topics TEXT[],-- ['earnings', 'M&A', 'regulatory', etc.]
  created_at TIMESTAMPTZ
);
```

**Helper Functions**:
- `get_trade_news_timeline(trade_id, days_back)` - Get chronological news
- `get_symbol_sentiment_trend(symbol, days_back)` - Sentiment analysis over time

---

## 📁 New Files Created

### 1. **Daily Snapshot Service**
[src/lib/services/daily-snapshot-with-news.ts](src/lib/services/daily-snapshot-with-news.ts)
- Captures snapshots with Tavily news integration
- Sentiment analysis
- Key topic extraction

### 2. **Database Migration**
[supabase/migrations/20251029_create_trade_daily_news.sql](supabase/migrations/20251029_create_trade_daily_news.sql)
- Creates `trade_daily_news` table
- Indexes for performance
- RLS policies for security
- Helper functions

### 3. **Updated Scheduler**
[src/lib/utils/server-scheduler.ts](src/lib/utils/server-scheduler.ts)
- Added Job 3: Daily News Snapshots (4:00 PM EST)
- Renumbered existing jobs

---

## 🔍 How to View News Data

### SQL Queries

**Get news timeline for a trade**:
```sql
SELECT * FROM get_trade_news_timeline('trade-id-here', 30);
```

**Get sentiment trend for a symbol**:
```sql
SELECT * FROM get_symbol_sentiment_trend('AAPL', 30);
```

**Raw news data**:
```sql
SELECT date, summary, sentiment, key_topics
FROM trade_daily_news
WHERE trade_id = 'trade-id-here'
ORDER BY date DESC
LIMIT 30;
```

### TypeScript Functions

```typescript
import { getTradeNewsHistory } from '@/lib/services/daily-snapshot-with-news';

// Get last 30 days of news for a trade
const news = await getTradeNewsHistory(tradeId, 30);
```

---

## 🚀 What Happens Now

### Starting Today

**4:00 PM EST** - First daily snapshot with news will run automatically

**You'll see**:
- New entries in `trade_daily_news` table
- News summaries for each active trade
- Sentiment analysis
- Key topics extracted

### Going Forward

**Every trading day at 4:00 PM**:
1. System finds all your active trades
2. Fetches today's news from Tavily for each symbol
3. Performs sentiment analysis
4. Stores everything in the database
5. Logs summary to console

**You don't need to do anything!** It's fully automatic.

---

## 📈 Example Output

When the job runs, you'll see logs like:

```
[Cron] Daily snapshots with news triggered
[Cron] Capturing daily snapshots for user b2c427e9-3eec-4e15-a22e-0aafc3047c0c...
[DailySnapshot] Found 15 active trades

[DailySnapshot] Processing AAPL...
   ✓ Snapshot captured
   ✓ News fetched (5 headlines, bullish sentiment)
   ✓ News stored in database
   ✅ Complete

[DailySnapshot] Processing NVDA...
   ✓ Snapshot captured
   ✓ News fetched (3 headlines, neutral sentiment)
   ✓ News stored in database
   ✅ Complete

...

[Cron] User b2c427e9-3eec-4e15-a22e-0aafc3047c0c: 15 snapshots, 15 credits
[Cron] Sentiment: {"bullish":8,"neutral":5,"bearish":2}
[Cron] Daily snapshots complete: 15 total, 15 Tavily credits used
```

---

## ✅ Final Status

| Feature | Status | Frequency |
|---------|--------|-----------|
| **Trade embeddings on close** | ✅ Automatic | Every close |
| **AI post-mortem analysis** | ✅ Automatic | Daily @ 5PM |
| **Daily news snapshots** | ✅ Automatic | Daily @ 4PM |
| **Historical embeddings** | ✅ Complete | All 87 trades ✓ |
| **HNSW indexes** | ✅ Created | 2000 dimensions |
| **Scheduler running** | ✅ Active | 6 jobs total |

---

## 🎯 Bottom Line

**You asked**: "I want daily snapshots with news for active trades"
**You got**: Fully automated daily news snapshots at 4PM EST with Tavily API

**You asked**: "Are trades getting AI analysis when they close?"
**You got**: Yes! Auto post-mortems at 5PM EST + instant embeddings on close

**You asked**: "Do historical trades have embeddings?"
**You got**: Yes! All 87 closed trades now have 2000-dim embeddings with HNSW indexes

**No commands to remember. No manual work. Everything automatic.** 🎉

---

## 📞 Next Steps

1. ✅ **Nothing!** System is fully set up and running
2. **Optional**: Build a UI to display daily news in your trade dashboard
3. **Optional**: Add alerts for bearish sentiment on active positions
4. **Optional**: Create sentiment charts over time

**The system will start capturing news today at 4:00 PM EST!** 🚀
