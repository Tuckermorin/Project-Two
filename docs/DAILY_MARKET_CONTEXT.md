# Daily Market Context System

## Overview

The **Daily Market Context System** captures and analyzes economic/political news daily using Tavily API and GPT-4, storing AI-generated summaries in a vector database for RAG-enhanced trade recommendations.

This system enables your trading agent to:
- **Understand market conditions** when recommending trades
- **Detect trends** in economic/political news over time
- **Provide context-aware advice** based on current market sentiment
- **Learn from historical correlations** between news and trade outcomes

---

## Architecture

```
┌─────────────────────┐
│  EOD Snapshot Job   │  Triggers daily after market close (4-11 PM ET)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Daily Market Context Service                       │
│  ┌──────────────────────────────────────────────┐  │
│  │ 1. Gather News (Tavily API)                  │  │
│  │    - 10 search queries (economics/politics)  │  │
│  │    - Last 24 hours only                      │  │
│  │    - Trusted domains (Reuters, Bloomberg)    │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 2. AI Analysis (GPT-4)                       │  │
│  │    - Comprehensive summary (3-4 paragraphs)  │  │
│  │    - Key themes extraction                   │  │
│  │    - Sentiment analysis                      │  │
│  │    - Sector-specific insights                │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 3. Generate Embedding (OpenAI ada-002)       │  │
│  │    - Vector representation for similarity    │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 4. Store in Database                         │  │
│  │    - daily_market_context table              │  │
│  │    - With pgvector for similarity search     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  RAG System                                         │
│  - Retrieve relevant context for trade candidates  │
│  - Provide to agent for better recommendations     │
└─────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `daily_market_context`

```sql
CREATE TABLE daily_market_context (
  id UUID PRIMARY KEY,
  as_of_date DATE UNIQUE NOT NULL,

  -- AI-generated content
  summary TEXT NOT NULL,
  key_themes JSONB,  -- { "themes": ["Fed rate decision", ...] }

  -- Sentiment analysis
  overall_market_sentiment TEXT,  -- "bullish", "bearish", "neutral", "mixed"
  sentiment_score NUMERIC,  -- -1.0 to +1.0

  -- Structured data
  economic_indicators JSONB,  -- { "inflation": "2.7%", ... }
  political_events JSONB,     -- [{ "event": "...", "impact": "..." }]
  sector_themes JSONB,        -- { "technology": "AI boom", ... }

  -- Metadata
  source_count INTEGER,
  source_urls JSONB,
  source_domains JSONB,
  search_queries TEXT[],

  -- Vector embedding for RAG
  embedding VECTOR(1536),

  -- Tracking
  generated_by TEXT,
  generation_cost_cents NUMERIC,
  processing_time_seconds NUMERIC,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity search index
CREATE INDEX idx_daily_market_context_embedding
  ON daily_market_context
  USING ivfflat (embedding vector_cosine_ops);
```

---

## How It Works

### 1. News Gathering (Tavily API)

The system searches for news on 10 key economic/political topics:

```typescript
const searchQueries = [
  'Federal Reserve interest rates monetary policy',
  'inflation CPI consumer prices economic data',
  'US jobs report employment unemployment',
  'stock market volatility VIX trading',
  'economic recession GDP growth forecast',
  'geopolitical events international trade tensions',
  'US political news regulation policy changes',
  'technology sector earnings tech stocks',
  'energy sector oil prices commodities',
  'financial sector banking earnings',
];
```

**Tavily Configuration:**
- `topic: "news"` - Focus on recent news
- `days: 1` - Last 24 hours only
- `search_depth: "advanced"` - Better quality snippets (2 credits vs 1)
- `max_results: 5` per query
- `include_domains` - Trusted sources only (Reuters, Bloomberg, WSJ, etc.)

### 2. AI Analysis (GPT-4)

GPT-4 analyzes all articles and generates:

```json
{
  "summary": "3-4 paragraph comprehensive summary...",
  "key_themes": ["Fed rate policy", "Tech earnings", "..."],
  "overall_sentiment": "bullish",
  "sentiment_score": 0.3,
  "economic_indicators": {
    "inflation": "2.7%",
    "unemployment": "3.8%"
  },
  "political_events": [
    {
      "event": "...",
      "impact": "Positive for energy sector"
    }
  ],
  "sector_themes": {
    "technology": "AI boom continues",
    "financials": "Rate cuts expected"
  }
}
```

### 3. Vector Embedding

The summary is converted to a vector embedding using OpenAI's `text-embedding-ada-002` model, enabling:
- **Similarity search** - Find similar historical market conditions
- **RAG retrieval** - Provide relevant context to the trading agent

### 4. Storage & Indexing

Stored in PostgreSQL with pgvector extension for efficient similarity search.

---

## Integration with Trading Agent

### Getting Context for Trade Candidates

```typescript
import { getMarketContextForCandidate, formatMarketContextForAgent } from '@/lib/agent/rag-embeddings';

// Get relevant market context
const marketContext = await getMarketContextForCandidate(candidate, {
  daysBack: 7,              // Last 7 days of context
  includeSimilarDays: true  // Also find similar historical conditions
});

// Format for agent prompt
const contextText = formatMarketContextForAgent(marketContext);

// Include in agent prompt
const prompt = `
${contextText}

Based on the current market environment, should we take this trade?
Symbol: ${candidate.symbol}
Strategy: ${candidate.strategy}
...
`;
```

### Example Output

```
=== RECENT MARKET CONTEXT ===

Latest (2025-10-13):
  Sentiment: bullish (0.35)
  Key Themes: Fed rate cuts expected, Tech sector strength, Inflation cooling
  Sector Themes: technology: AI boom; financials: Rate cuts positive
  Summary: Markets rallied today as inflation data came in lower than expected,
  increasing the likelihood of Fed rate cuts in November. Tech sector led gains
  with major earnings beats from cloud providers...

Previous Days Summary:
  2025-10-12: neutral (0.05) - Earnings season, Market volatility
  2025-10-11: bearish (-0.20) - Geopolitical tensions, Energy concerns
  2025-10-10: neutral (0.00) - Mixed economic data, Tech regulation

=== SIMILAR HISTORICAL CONDITIONS ===

Market conditions similar to current environment:

1. 2025-09-15:
   Sentiment: bullish (0.30)
   Themes: Fed policy shift, Tech optimism, Inflation cooling
   Markets responded positively to dovish Fed signals...
```

---

## API Endpoints

### 1. Generate Daily Context

**POST** `/api/market-context/generate`

Manually trigger daily market context generation:

```bash
curl -X POST http://localhost:3000/api/market-context/generate \
  -H "Content-Type: application/json" \
  -d '{"asOfDate": "2025-10-13"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Market context generated successfully",
  "data": {
    "as_of_date": "2025-10-13",
    "summary_preview": "Markets rallied today as inflation data...",
    "key_themes": { "themes": ["Fed rate cuts expected", "..."] },
    "sentiment": "bullish",
    "sentiment_score": 0.35,
    "source_count": 42,
    "processing_time": 8.5
  }
}
```

### 2. Get Recent Context

**GET** `/api/market-context/generate?days=7`

Fetch recent market context:

```bash
curl http://localhost:3000/api/market-context/generate?days=7
```

### 3. Search Similar Context

**GET** `/api/market-context/generate?query=fed+rate+cuts+tech+sector`

Find similar historical market conditions:

```bash
curl http://localhost:3000/api/market-context/generate?query=high+volatility+tech+earnings
```

---

## Automatic Daily Generation

Market context is automatically generated during the **EOD snapshot job**:

```typescript
// src/app/api/jobs/snapshot-sync/route.ts

// Auto-triggers between 4 PM - 11 PM ET
const hour = new Date().getHours();
const generateMarketContext = hour >= 16 && hour <= 23;

if (generateMarketContext) {
  await marketContextService.generateDailyContext();
}
```

**Trigger via cron:**
```bash
curl -X POST http://localhost:3000/api/jobs/snapshot-sync \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"trigger": "scheduled", "generateMarketContext": true}'
```

---

## Usage Examples

### Example 1: Enhance Agent Reasoning

```typescript
// In your trading agent
import { getMarketContextForCandidate, formatMarketContextForAgent } from '@/lib/agent/rag-embeddings';

async function evaluateTradeCandidate(candidate) {
  // Get market context
  const marketContext = await getMarketContextForCandidate(candidate, {
    daysBack: 7,
    includeSimilarDays: true
  });

  // Check for relevant news
  const latestContext = marketContext.recent_context[0];

  if (latestContext.sentiment === 'bearish' && candidate.strategy === 'PUT_CREDIT_SPREAD') {
    console.log('⚠️ Warning: Bullish strategy in bearish market environment');
  }

  // Include in agent prompt
  const contextText = formatMarketContextForAgent(marketContext);
  const agentPrompt = `
    ${contextText}

    Should we take this ${candidate.strategy} trade on ${candidate.symbol}?
    Consider the current market sentiment and themes.
  `;

  return await llm.analyze(agentPrompt);
}
```

### Example 2: Post-Mortem Analysis

```typescript
// When analyzing why a trade won/lost
async function analyzeTradeOutcome(trade) {
  const service = getDailyMarketContextService();

  // Get context from entry date
  const entryContext = await service.getRecentContext(1); // Day of entry

  // Compare with exit date context
  const exitDate = new Date(trade.exit_date);
  const exitContext = await service.getRecentContext(1);

  console.log(`
    Entry Day Sentiment: ${entryContext[0].sentiment} (${entryContext[0].sentiment_score})
    Exit Day Sentiment: ${exitContext[0].sentiment} (${exitContext[0].sentiment_score})
    Sentiment Shift: ${exitContext[0].sentiment_score - entryContext[0].sentiment_score}
  `);
}
```

### Example 3: Trend Detection

```typescript
// Detect if market sentiment is improving or deteriorating
const contexts = await marketContextService.getRecentContext(30);

const sentimentTrend = contexts
  .map(c => c.sentiment_score)
  .reduce((acc, score, i, arr) => {
    if (i === 0) return 0;
    return acc + (score - arr[i - 1]);
  }, 0);

if (sentimentTrend > 1.0) {
  console.log('📈 Market sentiment improving over last 30 days');
} else if (sentimentTrend < -1.0) {
  console.log('📉 Market sentiment deteriorating over last 30 days');
}
```

---

## Cost Estimates

### Per Daily Context Generation:

| Service | Usage | Cost |
|---------|-------|------|
| **Tavily API** | 10 queries × 2 credits (advanced) = 20 credits/day | Included in plan (4000 credits) |
| **GPT-4-mini** | 1 analysis (~2000 tokens) | ~$0.01 |
| **OpenAI Embeddings** | 1 embedding (ada-002, ~1000 tokens) | ~$0.0001 |
| **Total out-of-pocket** | Per day | **~$0.01** |

**Monthly cost:** ~$0.30/month (GPT + embeddings only)

**Tavily credit usage:**
- 20 credits per day
- 4000 credits = 200 days (~6.5 months)
- After 200 days, need to refill Tavily credits

---

## Setup Instructions

### 1. Run Database Migrations

```bash
# Apply the migrations
psql -h aws-0-us-west-1.pooler.supabase.com \
     -p 5432 \
     -U postgres.bannkxicnkhajjokzpwu \
     -d postgres \
     -f supabase/migrations/20251013_create_daily_market_context.sql

psql -h aws-0-us-west-1.pooler.supabase.com \
     -p 5432 \
     -U postgres.bannkxicnkhajjokzpwu \
     -d postgres \
     -f supabase/migrations/20251013_add_market_context_search_function.sql
```

### 2. Verify Setup

```sql
-- Check table exists
SELECT * FROM daily_market_context LIMIT 1;

-- Test vector search function
SELECT * FROM match_market_context(
  NULL::vector(1536),
  0.7,
  5
);
```

### 3. Generate First Context

```bash
# Manual generation for today
curl -X POST http://localhost:3000/api/market-context/generate

# View the result
curl http://localhost:3000/api/market-context/generate?days=1
```

### 4. Enable Automatic Generation

The system is already integrated with your EOD snapshot job. It will automatically run between 4 PM - 11 PM ET.

To manually trigger with market context:

```bash
curl -X POST http://localhost:3000/api/jobs/snapshot-sync \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"trigger": "scheduled", "generateMarketContext": true}'
```

---

## Monitoring

### Check Generation Status

```sql
-- View recent contexts
SELECT
  as_of_date,
  overall_market_sentiment,
  sentiment_score,
  source_count,
  key_themes->'themes' as themes,
  processing_time_seconds
FROM daily_market_context
ORDER BY as_of_date DESC
LIMIT 7;
```

### Check Coverage

```sql
-- Find missing days
SELECT date::date
FROM generate_series(
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE,
  '1 day'::interval
) date
WHERE NOT EXISTS (
  SELECT 1
  FROM daily_market_context
  WHERE as_of_date = date::date
);
```

---

## Troubleshooting

### Issue: No context generated

**Check:**
1. Tavily API key configured: `process.env.TAVILY_API_KEY`
2. OpenAI API key configured: `process.env.OPENAI_API_KEY`
3. Check logs for API errors

### Issue: Poor quality summaries

**Solution:**
- Increase `max_results` in search queries (more articles = better analysis)
- Adjust GPT-4 prompt for more specific analysis
- Filter to more trusted news sources

### Issue: Vector search not working

**Check:**
1. pgvector extension enabled
2. Index created: `idx_daily_market_context_embedding`
3. Embeddings are being stored (not null)

---

## Future Enhancements

1. **Social Media Integration**
   - Add Reddit/Twitter sentiment to context
   - Track trending topics in trading communities

2. **Economic Calendar**
   - Automatically include upcoming events (FOMC, earnings, etc.)
   - Predict impact on volatility

3. **Correlation Analysis**
   - Correlate market context with trade outcomes
   - Identify which news types predict winners/losers

4. **Real-time Updates**
   - Generate intraday context during major news events
   - Alert on significant market condition changes

5. **Custom Queries**
   - Allow users to define their own search topics
   - Sector-specific news tracking

---

## Related Documentation

- [Trade Snapshots System](./TRADE_SNAPSHOTS_SYSTEM.md)
- [RAG Embeddings](./RAG_SYSTEM.md)
- [Agent Setup](./AGENT_SETUP.md)
- [Scheduler Setup](./SCHEDULER_SETUP.md)

---

**Last Updated:** October 13, 2025
