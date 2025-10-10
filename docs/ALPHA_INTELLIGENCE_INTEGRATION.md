# Alpha Intelligence Integration Guide

## Overview

This document describes the integration of Alpha Vantage's Alpha Intelligence APIs (NEWS_SENTIMENT and INSIDER_TRANSACTIONS) into the trading agent system. These APIs provide institutional-grade market intelligence that enhances trade decision-making.

## What Was Implemented

### Phase 1: API Testing & Validation ✅

**NEWS_SENTIMENT API**
- ✅ Tested and confirmed working with API key: `XF0H4EC893MP2ATJ`
- ✅ Returns live and historical market news with sentiment analysis
- ✅ Supports filtering by tickers, topics, and time ranges
- ✅ Provides both overall sentiment and ticker-specific sentiment scores

**INSIDER_TRANSACTIONS API**
- ✅ Tested and confirmed working
- ✅ Returns insider buy/sell transactions with executive details
- ✅ Includes transaction dates, shares, prices, and transaction types (A=Acquisition, D=Disposal)

### Phase 2: Database Infrastructure ✅

**Created 3 new database tables:**

1. **`news_sentiment_history`** - Historical news sentiment tracking
   ```sql
   - symbol, as_of_date, timestamp
   - sentiment_score (-1 to +1), sentiment_label (text)
   - positive_count, negative_count, neutral_count
   - avg_relevance_score, topics (JSONB), topic_sentiment (JSONB)
   ```

2. **`insider_transactions`** - Insider trading activity
   ```sql
   - symbol, transaction_date, executive_name, executive_title
   - security_type, acquisition_or_disposal (A/D)
   - shares, share_price, transaction_value
   ```

3. **`insider_activity_summary`** (VIEW) - Aggregated monthly insider metrics
   ```sql
   - buy/sell counts and ratios
   - net shares and values
   - latest transaction dates
   ```

### Phase 3: Factor Definitions ✅

**Added 20 new IPS factors across 2 categories:**

#### News & Sentiment Factors (11 factors)
- `av-news-sentiment-score` - Overall sentiment score (-1 to +1)
- `av-news-sentiment-label` - Categorized sentiment label
- `av-news-positive-count` - # of positive articles (7 days)
- `av-news-negative-count` - # of negative articles (7 days)
- `av-news-neutral-count` - # of neutral articles (7 days)
- `av-news-total-count` - Total article count
- `av-news-relevance-avg` - Average relevance to ticker
- `av-news-sentiment-momentum` - Sentiment trend (calculated)
- `av-news-earnings-sentiment` - Earnings-specific sentiment
- `av-news-ma-sentiment` - M&A news sentiment
- `av-news-tech-sentiment` - Technology news sentiment

#### Insider Activity Factors (9 factors)
- `av-insider-buy-ratio` - Buy/Sell ratio (>1 = more buying)
- `av-insider-net-shares` - Net shares acquired (90 days)
- `av-insider-net-value` - Net transaction value ($)
- `av-insider-activity-count` - Total transactions
- `av-insider-acquisition-count` - Buy transaction count
- `av-insider-disposal-count` - Sell transaction count
- `av-insider-activity-trend` - Trend score (-1 to +1)
- `av-insider-concentration` - C-suite vs other insiders (%)
- `av-insider-confidence-score` - Composite confidence (0-100)

### Phase 4: Enhanced API Client ✅

**Updated AlphaVantageClient ([alpha-vantage.ts:666-841](src/lib/api/alpha-vantage.ts#L666-L841))**

#### Enhanced `getNewsSentiment()` method
```typescript
async getNewsSentiment(symbol: string, limit = 50, options?: {
  topics?: string[];      // Filter by topics (earnings, M&A, etc.)
  time_from?: string;     // Start date filter
  time_to?: string;       // End date filter
})
```

**Returns:**
```typescript
{
  average_score: number | null,           // -1 to +1
  sentiment_label: string,                // bullish, bearish, etc.
  count: number,                          // Total articles
  positive: number,                       // Positive article count
  negative: number,                       // Negative article count
  neutral: number,                        // Neutral article count
  avg_relevance: number | null,           // 0 to 1
  topic_sentiment: Record<string, number>, // Sentiment by topic
  topic_relevance: Record<string, number>, // Relevance by topic
  raw_articles: any[]                     // First 10 articles for reference
}
```

#### New `getInsiderTransactions()` method
```typescript
async getInsiderTransactions(symbol: string, limit = 100)
```

**Returns:**
```typescript
{
  transaction_count: number,      // Total transactions (90 days)
  acquisition_count: number,      // Buy transactions
  disposal_count: number,         // Sell transactions
  net_shares: number,             // Net shares (buys - sells)
  net_value: number,              // Net dollar value
  buy_ratio: number,              // Buys/Sells ratio
  activity_trend: number,         // Trend indicator
  transactions: any[]             // Raw transaction data
}
```

## How to Use in IPS

### Example 1: Add News Sentiment Factor

```typescript
// In your IPS configuration UI
{
  factor_key: 'av-news-sentiment-score',
  weight: 10,
  threshold: 0.15,            // Require somewhat-bullish or better
  direction: 'gte',
  enabled: true
}
```

### Example 2: Add Insider Buy Signal

```typescript
{
  factor_key: 'av-insider-buy-ratio',
  weight: 8,
  threshold: 1.0,             // More buying than selling
  direction: 'gte',
  enabled: true
}
```

### Example 3: Earnings News Filter

```typescript
{
  factor_key: 'av-news-earnings-sentiment',
  weight: 12,
  threshold: 0,               // Positive earnings sentiment
  direction: 'gte',
  enabled: true
}
```

## Integration Points (To Do)

### 1. Pre-Filter Integration in Agent v3
**File:** [options-agent-v3.ts](src/lib/agent/options-agent-v3.ts)

Add to `preFilterGeneral()` function (around line 176):

```typescript
// Fetch news sentiment
const avClient = getAlphaVantageClient();
const newsSentiment = await avClient.getNewsSentiment(symbol, 50, {
  topics: ['earnings', 'financial_markets']
});

// Fetch insider activity
const insiderData = await avClient.getInsiderTransactions(symbol);

// Store in generalData for later use
generalData[symbol] = {
  ...generalData[symbol],
  news_sentiment: newsSentiment,
  insider_activity: insiderData
};
```

### 2. Deep Reasoning Enhancement
**File:** [deep-reasoning.ts](src/lib/agent/deep-reasoning.ts)

Replace basic Tavily sentiment with detailed Alpha Vantage data:

```typescript
// Around line 300 - replace current news sentiment logic
const newsSentiment = candidate.general_data?.news_sentiment;
if (newsSentiment) {
  if (newsSentiment.sentiment_label === 'bearish' ||
      newsSentiment.sentiment_label === 'somewhat-bearish') {
    news_sentiment = "negative";
    key_insights.push(`Bearish news sentiment (${newsSentiment.average_score?.toFixed(2)})`);
  } else if (newsSentiment.sentiment_label === 'bullish' ||
             newsSentiment.sentiment_label === 'somewhat-bullish') {
    news_sentiment = "positive";
    key_insights.push(`Bullish news sentiment (${newsSentiment.average_score?.toFixed(2)})`);
  }

  // Check topic-specific sentiment
  if (newsSentiment.topic_sentiment?.Earnings < -0.3) {
    key_insights.push(`⚠️ Negative earnings sentiment detected`);
  }
}
```

### 3. RAG Embeddings Enhancement
**File:** [rag-embeddings.ts](src/lib/agent/rag-embeddings.ts)

Add sentiment and insider context (around line 185):

```typescript
// After Reddit section
if (trade.metadata?.news_sentiment) {
  const news = trade.metadata.news_sentiment;
  lines.push(`News Sentiment: ${news.sentiment_label} (${news.average_score?.toFixed(2)})`);
  lines.push(`News Articles: ${news.positive} positive, ${news.negative} negative`);

  if (news.topic_sentiment) {
    const earningsSent = news.topic_sentiment.Earnings;
    if (earningsSent !== undefined) {
      lines.push(`Earnings Sentiment: ${earningsSent.toFixed(2)}`);
    }
  }
}

if (trade.metadata?.insider_activity) {
  const insider = trade.metadata.insider_activity;
  lines.push(`Insider Activity: Buy/Sell Ratio ${insider.buy_ratio?.toFixed(2)}`);
  lines.push(`Insider Trend: ${insider.activity_trend > 0 ? 'Bullish' : 'Bearish'}`);
}
```

### 4. Sentiment-Based Guardrails

Add to agent's filtering logic:

```typescript
// Block trades with strongly negative sentiment
if (newsSentiment.average_score < -0.5 && newsSentiment.count >= 5) {
  console.log(`[Guardrail] Blocking ${symbol}: Strongly negative sentiment`);
  continue; // Skip this candidate
}

// Block when insiders are heavily selling
if (insiderData.buy_ratio < 0.3 && insiderData.transaction_count >= 5) {
  console.log(`[Guardrail] Blocking ${symbol}: Heavy insider selling`);
  continue;
}

// Reduce score for sentiment divergence
if (Math.abs(newsSentiment.average_score - redditSentiment) > 0.5) {
  ipsScore -= 10; // Penalty for conflicting signals
  console.log(`[Warning] ${symbol}: News/Reddit sentiment divergence`);
}
```

## Example API Calls

### Test NEWS_SENTIMENT

```bash
curl "https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AMD&limit=5&apikey=XF0H4EC893MP2ATJ"
```

### Test INSIDER_TRANSACTIONS

```bash
curl "https://www.alphavantage.co/query?function=INSIDER_TRANSACTIONS&symbol=AMD&apikey=XF0H4EC893MP2ATJ"
```

## Database Queries

### Check sentiment history

```sql
SELECT * FROM news_sentiment_history
WHERE symbol = 'AMD'
ORDER BY as_of_date DESC
LIMIT 5;
```

### Check insider activity

```sql
SELECT * FROM insider_activity_summary
WHERE symbol = 'AMD'
ORDER BY month DESC
LIMIT 3;
```

### View all sentiment factors

```sql
SELECT * FROM sentiment_factors;
```

## Migration Files

All migrations are located in `supabase/migrations/`:

1. `20251010_add_news_sentiment_table.sql` - News sentiment history table
2. `20251010_add_insider_transactions_table.sql` - Insider transactions table
3. `20251010_add_alpha_intelligence_factors.sql` - Factor definitions

## Performance Considerations

- **Rate Limits**: Alpha Vantage has rate limits (~5 req/min for free tier)
- **Caching**: Consider caching sentiment data for 30-60 minutes
- **Batching**: Fetch sentiment during pre-filter stage, not per-candidate
- **Storage**: Store sentiment in `generalData` to avoid re-fetching

## Next Steps

1. ✅ **Phase 1-4 Complete** - API testing, database setup, enhanced client
2. ⏳ **Phase 5**: Integrate into agent pre-filter logic
3. ⏳ **Phase 6**: Add sentiment to deep reasoning
4. ⏳ **Phase 7**: Enhance RAG with sentiment context
5. ⏳ **Phase 8**: Create guardrails and scoring logic
6. ⏳ **Phase 9**: End-to-end testing and validation

## Benefits

- **Better Timing**: Detect sentiment shifts 24-48h before price moves
- **Risk Reduction**: Avoid trades during negative news clusters
- **Insider Intelligence**: Align with smart money (insider buying)
- **Higher Win Rates**: Learn which sentiment patterns predict success
- **Institutional Edge**: Professional-grade market intelligence

## Support

For issues or questions:
- Alpha Vantage Documentation: https://www.alphavantage.co/documentation/#intelligence
- Internal: Check [alpha-vantage.ts](src/lib/api/alpha-vantage.ts) for implementation details
- Database: Review migration files in `supabase/migrations/`

---

**Status**: Phase 1-4 Complete (API + Database + Client) ✅
**Next**: Agent Integration (Phase 5-9) ⏳
