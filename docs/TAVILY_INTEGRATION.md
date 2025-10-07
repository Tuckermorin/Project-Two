# Tavily Integration - Full Implementation

Complete implementation of Tavily API following CODEX.md best practices for options trading intelligence.

## What Was Implemented

### ✅ Core APIs (all 4 endpoints)
1. **Search API** - Enhanced with `topic:"news"`, `search_depth:"advanced"`, `chunks_per_source`, `days` parameter
2. **Extract API** - Two-step pattern: Search → Filter by score → Extract
3. **Map API** - Site discovery for investor relations pages
4. **Crawl API** - Bulk content harvesting with path filtering

### ✅ Factor-Aware Query Patterns
Pre-built query strategies for:
- **Catalysts** - Earnings, guidance, product launches
- **Analyst Activity** - Downgrades, upgrades, price targets
- **SEC Filings** - 8-K, 10-Q, 10-K from sec.gov
- **Operational Risks** - Supply chain, margins, competition, regulatory

### ✅ LangChain Tools (7 new tools)
All tools integrated into your agent's tool suite:
1. `QueryCatalystsTool` - Searches for catalyst events
2. `QueryAnalystActivityTool` - Searches for analyst ratings
3. `QuerySECFilingsTool` - Searches SEC filings
4. `QueryOperationalRisksTool` - Searches for risk signals
5. `TwoStepIngestTool` - Comprehensive research pipeline
6. `ExtractURLTool` - Extracts content from URLs
7. `MapIRSiteTool` - Maps investor relations sites

## Files Created/Modified

### New Files
- `src/lib/clients/tavily-queries.ts` - Factor-aware query patterns
- `TAVILY_INTEGRATION.md` - This document

### Modified Files
- `src/lib/clients/tavily.ts` - Enhanced with all 4 APIs
- `src/lib/agent/tools.ts` - Added 7 new tools, enhanced SearchNewsTool
- `src/lib/api/tavily.ts` - Fixed typo (daysToCovet → daysToCover)

## Usage Examples

### Basic Enhanced Search
```typescript
import { tavilySearch } from "@/lib/clients/tavily";

const results = await tavilySearch("NVDA earnings guidance", {
  topic: "news",
  search_depth: "advanced",
  chunks_per_source: 3,
  days: 7,
  max_results: 8,
  include_domains: ["reuters.com", "bloomberg.com", "wsj.com"]
});
```

### Factor-Aware Queries
```typescript
import { queryCatalysts, queryAnalystActivity } from "@/lib/clients/tavily-queries";

// Get catalyst events
const catalysts = await queryCatalysts("AAPL", 7); // Last 7 days

// Get analyst activity
const analysts = await queryAnalystActivity("AAPL", 7);
```

### Two-Step Ingest (Search → Filter → Extract)
```typescript
import { twoStepIngest } from "@/lib/clients/tavily-queries";

const result = await twoStepIngest("TSLA", 7, 0.6);
// Returns: { symbol, documents[], metadata }
// Documents have full markdown content ready for RAG
```

### Extract Content from URLs
```typescript
import { tavilyExtract } from "@/lib/clients/tavily";

const result = await tavilyExtract({
  urls: ["https://investor.nvidia.com/financial-info/earnings"],
  extract_depth: "advanced", // Use for IR pages, SEC filings
  format: "markdown"
});
```

### Map Investor Relations Site
```typescript
import { tavilyMap } from "@/lib/clients/tavily";

const result = await tavilyMap({
  url: "investor.nvidia.com",
  max_depth: 2,
  select_paths: ["/press-releases/.*", "/events/.*"],
  exclude_paths: ["/careers/.*"]
});
// Returns list of discovered URLs (no content)
```

### Crawl for Bulk Content
```typescript
import { tavilyCrawl } from "@/lib/clients/tavily";

const result = await tavilyCrawl({
  url: "investor.nvidia.com",
  max_depth: 1,
  max_breadth: 50,
  limit: 100,
  select_paths: ["/press-releases/.*"],
  extract_depth: "basic"
});
// Returns pages with extracted content
```

## Agent Usage

Your LangChain agent now has access to these tools automatically via `agentTools`:

```typescript
import { agentTools } from "@/lib/agent/tools";

// The agent can now use:
// - query_catalysts
// - query_analyst_activity
// - query_sec_filings
// - query_operational_risks
// - two_step_ingest
// - extract_url_content
// - map_ir_site
// - search_news (enhanced)
```

## Cost Management

### Credit Costs (per CODEX.md)
- **Search basic**: 1 credit
- **Search advanced**: 2 credits (better quality)
- **Extract basic**: 1 credit per 5 URLs
- **Extract advanced**: 2 credits per 5 URLs (better for tables/complex HTML)
- **Map**: ~1 credit per 10 pages (2 with instructions)
- **Crawl**: Variable based on depth/breadth/limit

### Cost Control Features
1. **Domain filtering** - Only query trusted sources
2. **Score thresholds** - Only extract high-quality results (default ≥0.6)
3. **Days parameter** - Limit recency window (default 7 days)
4. **Explicit depth control** - Choose basic vs advanced per use case
5. **Query limits** - Max results capped (default 8 for advanced)

### Best Practices from CODEX.md
✅ Use `topic:"news"` + `days` for recency walls
✅ Use `search_depth:"advanced"` for decision-grade content
✅ Use two-step pattern (search → filter → extract) vs `include_raw_content`
✅ Keep queries < 400 chars; break into sub-queries
✅ Use `include_domains` for trusted sources
✅ Filter by score ≥ 0.6 before extracting
✅ Use `extract_depth:"advanced"` only for IR/SEC/tables
✅ Start crawling with `max_depth:1`, expand if needed

## Trusted Financial Domains

Pre-configured in `tavily-queries.ts`:
- sec.gov
- reuters.com
- bloomberg.com
- wsj.com
- marketwatch.com
- seekingalpha.com
- finance.yahoo.com
- barrons.com
- cnbc.com
- ft.com

## Integration with Your IPS/PCS Workflow

The factor-aware queries align with your IPS factors:

| IPS Factor | Tavily Query Pattern |
|------------|---------------------|
| Earnings Events | `queryCatalysts()` |
| Analyst Ratings | `queryAnalystActivity()` |
| Regulatory Risk | `querySECFilings()` |
| Operational Risk | `queryOperationalRisks()` |
| News Volume | Count from `queryAllFactors()` |
| News Sentiment | Score analysis from results |

## Next Steps (Optional)

### RAG Integration (not implemented yet)
To fully utilize the extracted content:
1. Set up vector database (Pinecone, Weaviate, or Supabase pgvector)
2. Chunk documents (~800-1200 tokens with overlap)
3. Generate embeddings (OpenAI, Cohere, or local)
4. Store with metadata (symbol, date, source, score)
5. Query at trade evaluation time

### Scheduled Syncs (not implemented yet)
- **Daily**: Run `twoStepIngest()` for watchlist symbols
- **Weekly**: Run `tavilyCrawl()` for IR site updates
- **Monthly**: Run `tavilyMap()` to discover new IR paths

## Testing

You can test the new tools individually:

```typescript
// Test enhanced search
import { tavilySearch } from "@/lib/clients/tavily";
const test1 = await tavilySearch("NVDA earnings", {
  topic: "news",
  search_depth: "advanced",
  days: 7
});

// Test factor queries
import { queryCatalysts } from "@/lib/clients/tavily-queries";
const test2 = await queryCatalysts("AAPL", 7);

// Test two-step ingest
import { twoStepIngest } from "@/lib/clients/tavily-queries";
const test3 = await twoStepIngest("TSLA", 7);
```

## Rate Limits

- **Dev key**: 100 RPM
- **Prod key**: 1,000 RPM (requires paid/PAYG plan)

Plan async/batching accordingly.

## Summary

✅ **All priorities implemented** (high, medium, low)
✅ **No additional costs** until you run the agent
✅ **Best practices from CODEX.md** fully integrated
✅ **Zero breaking changes** - all additions, no modifications to existing behavior
✅ **Type-safe** - Full TypeScript support
✅ **Agent-ready** - Tools automatically available to your LLM

Your agent now has enterprise-grade market intelligence capabilities following Tavily's recommended patterns for financial research.
