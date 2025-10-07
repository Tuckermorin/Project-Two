# API Endpoints Reference - Enhanced Tavily Features

Quick reference guide for the new Tavily-powered API endpoints.

---

## Active Trade Monitoring

### Monitor Single Trade
**Endpoint**: `GET /api/trades/[id]/monitor`

**Query Parameters**:
- `daysBack` (optional, default: 7) - Lookback window in days
- `useCache` (optional, default: true) - Use cached results if fresh
- `forceRefresh` (optional, default: false) - Force new Tavily search

**Example**:
```bash
curl "http://localhost:3000/api/trades/abc-123/monitor?daysBack=7&forceRefresh=false"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "trade_id": "abc-123",
    "symbol": "AAPL",
    "status": "active",
    "days_held": 14,
    "current_context": {
      "catalysts": [...],
      "analyst_activity": [...],
      "sec_filings": [...],
      "operational_risks": [...]
    },
    "risk_alerts": {
      "level": "medium",
      "alerts": [
        {
          "type": "EARNINGS_RISK",
          "severity": "high",
          "message": "Earnings event in 3 days"
        }
      ]
    },
    "recommendations": [
      "⚠️ Close before earnings or roll position"
    ],
    "ai_summary": "Trade in good standing but earnings risk approaching...",
    "credits_used": 28
  }
}
```

---

### Monitor All Active Trades
**Endpoint**: `GET /api/trades/monitor-all`

**Query Parameters**:
- `userId` (optional, default: "default-user") - User ID to filter trades
- `daysBack` (optional, default: 7) - Lookback window
- `useCache` (optional, default: true) - Use cached results

**Example**:
```bash
curl "http://localhost:3000/api/trades/monitor-all?userId=user-123"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "total_trades": 13,
    "monitored": 13,
    "risk_summary": {
      "critical": 1,
      "high": 2,
      "medium": 5,
      "low": 5
    },
    "total_credits_used": 182,
    "results": [...]
  },
  "summary": {
    "total_trades": 13,
    "monitored": 13,
    "risk_summary": {...},
    "total_credits": 182,
    "avg_credits_per_trade": "14.0"
  }
}
```

---

## Trade Post-Mortem

### Get Existing Post-Mortem
**Endpoint**: `GET /api/trades/[id]/postmortem`

**Example**:
```bash
curl http://localhost:3000/api/trades/abc-123/postmortem
```

**Response**:
```json
{
  "success": true,
  "data": {
    "trade_id": "abc-123",
    "symbol": "AAPL",
    "outcome": "win",
    "realized_pnl": 150.50,
    "realized_pnl_percent": 50.2,
    "days_held": 21,
    "trade_lifecycle": {
      "entry_context": "...",
      "during_trade_events": [...],
      "exit_context": "..."
    },
    "lessons_learned": {
      "what_worked": [
        "High IPS score correctly predicted favorable setup"
      ],
      "what_didnt_work": [
        "Held longer than optimal"
      ],
      "key_insight": "Strong IPS alignment and positive sentiment drove success..."
    },
    "ips_effectiveness": {
      "entry_ips_score": 85,
      "ips_factors_validated": [...],
      "ips_factors_failed": [...]
    },
    "ai_analysis": "This trade succeeded due to...",
    "credits_used": 28
  }
}
```

---

### Generate Post-Mortem
**Endpoint**: `POST /api/trades/[id]/postmortem`

**Body**:
```json
{
  "embedToRAG": true
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/trades/abc-123/postmortem \
  -H "Content-Type: application/json" \
  -d '{ "embedToRAG": true }'
```

**Response**:
```json
{
  "success": true,
  "data": { /* same as GET */ },
  "message": "Post-mortem generated (28 credits used)"
}
```

---

## RAG Enrichment

### Enrich RAG with Fresh Research
**Endpoint**: `POST /api/agent/rag/enrich`

**Body**:
```json
{
  "symbols": ["AAPL", "MSFT", "NVDA"],
  "context": "general",
  "forceRefresh": false
}
```

**Parameters**:
- `symbols` (optional) - Array of symbols to enrich. If empty, uses watchlist
- `context` (optional, default: "general") - Research context: "general", "catalyst", "analyst", "risk"
- `forceRefresh` (optional, default: false) - Force Tavily fetch even if RAG has data

**Example**:
```bash
curl -X POST http://localhost:3000/api/agent/rag/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "MSFT"],
    "context": "general",
    "forceRefresh": false
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "symbols_enriched": 2,
    "results": {
      "AAPL": {
        "source": "rag",
        "cached": true,
        "credits_used": 0
      },
      "MSFT": {
        "source": "tavily",
        "cached": false,
        "credits_used": 20
      }
    },
    "statistics": {
      "total_credits_used": 20,
      "avg_credits_per_symbol": "10.0",
      "rag_hits": 1,
      "tavily_fetches": 1,
      "hybrid_queries": 0,
      "cache_hit_rate": "50.0%"
    }
  },
  "message": "Enriched 2 symbols (20 credits, 50% cache hit rate)"
}
```

---

### Check Enrichment Status
**Endpoint**: `GET /api/agent/rag/enrich`

**Example**:
```bash
curl http://localhost:3000/api/agent/rag/enrich
```

**Response**:
```json
{
  "success": true,
  "data": {
    "total_embeddings": 47,
    "embeddings_last_24h": 12,
    "symbols_with_embeddings": 15,
    "top_symbols": [
      { "symbol": "AAPL", "count": 8 },
      { "symbol": "MSFT", "count": 6 },
      { "symbol": "NVDA", "count": 5 }
    ]
  }
}
```

---

## Tavily Usage Monitoring

### Get Comprehensive Metrics
**Endpoint**: `GET /api/admin/tavily-usage`

**Example**:
```bash
curl http://localhost:3000/api/admin/tavily-usage
```

**Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_requests": 247,
      "total_credits_used": 456,
      "estimated_daily_cost": "$22.80",
      "estimated_monthly_cost": "$684.00",
      "cache_hit_rate": "52.3%",
      "success_rate": "97.6%",
      "avg_cost_per_request": "$0.0462"
    },
    "metrics": {
      "requests": {
        "total": 247,
        "successful": 241,
        "failed": 6,
        "success_rate": 97.6
      },
      "cache": {
        "hits": 129,
        "misses": 118,
        "hit_rate": 52.3,
        "search_cache_size": 234,
        "extract_cache_size": 89
      },
      "latency": {
        "average_ms": 423,
        "p50_ms": 312,
        "p95_ms": 1024,
        "p99_ms": 2341
      },
      "credits": {
        "total_used": 456,
        "estimated_daily": 456,
        "estimated_monthly": 13680,
        "remaining_this_month": -9680
      },
      "cost": {
        "per_credit": 0.05,
        "total_spent": "$22.80",
        "estimated_daily": "$22.80",
        "estimated_monthly": "$684.00"
      }
    },
    "operations": {
      "search": {
        "requests": 198,
        "avg_latency_ms": 387,
        "credits": 312,
        "cache_hit_rate": 52.3
      },
      "extract": {
        "requests": 49,
        "avg_latency_ms": 612,
        "credits": 144,
        "cache_hit_rate": 43.1
      }
    },
    "rag_router": {
      "total_queries": 85,
      "rag_hits": 42,
      "tavily_fetches": 38,
      "hybrid_queries": 5,
      "cache_hit_rate": "49.4%",
      "total_credits_saved_by_rag": 84,
      "avg_credits_per_query": "5.32"
    },
    "health": {
      "rate_limiter": {
        "tier": "prod",
        "available_tokens": 987,
        "capacity": 1000,
        "utilization": "1.3%",
        "queue_size": 0
      },
      "circuit_breakers": {
        "search": "CLOSED",
        "extract": "CLOSED",
        "map": "CLOSED",
        "crawl": "CLOSED"
      }
    }
  }
}
```

---

### Reset Metrics
**Endpoint**: `POST /api/admin/tavily-usage`

**Body**:
```json
{
  "action": "reset"
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/admin/tavily-usage \
  -H "Content-Type: application/json" \
  -d '{ "action": "reset" }'
```

**Response**:
```json
{
  "success": true,
  "message": "Metrics reset successfully"
}
```

---

## Common Usage Patterns

### 1. Daily Active Trade Monitoring (Cron Job)
```bash
#!/bin/bash
# Run daily at 9 AM ET

curl "http://localhost:3000/api/trades/monitor-all?userId=default-user" \
  | jq '.data.risk_summary'

# If critical or high risk trades found, send alert
```

### 2. Trade Closure Workflow
```bash
#!/bin/bash
TRADE_ID=$1

# When trade is closed, generate post-mortem
curl -X POST "http://localhost:3000/api/trades/${TRADE_ID}/postmortem" \
  -H "Content-Type: application/json" \
  -d '{ "embedToRAG": true }' \
  | jq '.data.ai_analysis'
```

### 3. Weekly RAG Enrichment (Cron Job)
```bash
#!/bin/bash
# Run weekly on Sunday night

curl -X POST http://localhost:3000/api/agent/rag/enrich \
  -H "Content-Type: application/json" \
  -d '{ "context": "general", "forceRefresh": false }' \
  | jq '.data.statistics'
```

### 4. Cost Monitoring Alert
```bash
#!/bin/bash
# Run daily to check if over budget

USAGE=$(curl -s http://localhost:3000/api/admin/tavily-usage | jq -r '.data.summary.total_credits_used')

if [ "$USAGE" -gt 150 ]; then
  echo "WARNING: Daily Tavily usage at $USAGE credits (budget: 133)"
  # Send alert via Slack, email, etc.
fi
```

---

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common HTTP Status Codes**:
- `200` - Success
- `404` - Resource not found (e.g., trade doesn't exist)
- `500` - Server error (check logs)

**Common Errors**:
- "Trade not found" - Invalid trade ID
- "Trade not active" - Trying to monitor a closed trade
- "No post-mortem found" - Post-mortem hasn't been generated yet
- "Failed to fetch Tavily data" - Tavily API issue (check circuit breaker)

---

## TypeScript Usage

```typescript
// Monitor active trade
const response = await fetch(`/api/trades/${tradeId}/monitor?forceRefresh=true`);
const { data } = await response.json();

if (data.risk_alerts.level === "critical") {
  // Handle critical risk
  showAlert(data.recommendations[0]);
}

// Generate post-mortem
const pmResponse = await fetch(`/api/trades/${tradeId}/postmortem`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ embedToRAG: true })
});
const postMortem = await pmResponse.json();

// Check Tavily usage
const usageResponse = await fetch("/api/admin/tavily-usage");
const metrics = await usageResponse.json();
console.log(`Credits used: ${metrics.data.summary.total_credits_used}`);
```

---

## Next Steps

1. **Test endpoints** using the curl examples above
2. **Set up cron jobs** for daily monitoring and weekly enrichment
3. **Integrate into UI** with fetch calls from React components
4. **Monitor costs** via `/admin/tavily-usage` dashboard

For detailed implementation guides, see `TAVILY_ENHANCED_FEATURES.md`.
