# TenXIV - AI-Powered Options Trading Platform

TenXIV is an advanced options trading analysis platform that leverages AI agents, LangGraph workflows, and RAG (Retrieval-Augmented Generation) to systematically evaluate options trades based on user-defined Investment Policy Statements (IPS).

## 🎓 Academic Project Information

This project was developed as part of a Software Development program at Utah Tech University, demonstrating the integration of AI with financial analysis, full-stack web development, and database design.

**Key Technologies**: LangChain, LangGraph, Next.js, React, TypeScript, Supabase (PostgreSQL + pgvector), OpenAI Embeddings

---

## 🤖 AI Agent Architecture (LangGraph)

### Core Agent Implementation

The heart of TenXIV is a **LangGraph state machine** that orchestrates a 10-node workflow for systematic trade analysis.

**Main Graph File**: [src/lib/agent/options-agent-graph.ts](src/lib/agent/options-agent-graph.ts) (1,617 lines)
- LangGraph `StateGraph` implementation
- 10 sequential nodes for trade analysis workflow
- State-driven architecture with persistent context

### Agent State Schema

**Location**: [src/lib/agent/options-agent-graph.ts:19-40](src/lib/agent/options-agent-graph.ts#L19-L40)

**Interface**: `AgentState`

**Key State Fields**:
```typescript
interface AgentState {
  runId: string;                    // Unique run identifier
  mode: "backtest" | "paper" | "live"; // Execution mode
  symbols: string[];                 // Ticker symbols to analyze
  ipsId?: string;                   // Investment Policy Statement ID
  ipsConfig?: any;                  // Loaded IPS configuration
  asof: string;                     // Timestamp for data consistency
  marketData: Record<string, any>;  // Options chains, quotes
  fundamentalData: Record<string, any>; // Company overview, financials
  macroData: Record<string, any>;   // Economic indicators (FRED)
  features: Record<string, any>;    // Engineered features (IV rank, etc.)
  candidates: any[];                // Generated trade candidates
  scores: any[];                    // IPS compliance scores
  selected: any[];                  // Top-ranked trades
  errors: string[];                 // Error log
  // Deep reasoning additions
  reasoningChains: Record<string, any>;
  ipsCompliance: Record<string, any>;
  historicalContext: Record<string, any>;
  researchSynthesis: Record<string, any>;
  adjustedThresholds: Record<string, any>;
}
```

### LangGraph Workflow Nodes

The agent processes trades through 10 sequential nodes:

1. **FetchIPS** ([line 46](src/lib/agent/options-agent-graph.ts#L46))
   - Load Investment Policy Statement configuration
   - Extract factor criteria, thresholds, and weights

2. **FetchMarketData** ([line 81](src/lib/agent/options-agent-graph.ts#L81))
   - Fetch options chains from Alpha Vantage API
   - Get real-time stock quotes
   - Retrieve company fundamentals (P/E, Beta, market cap, etc.)
   - Calculate 5-day momentum and ATR-14 for volatility

3. **FetchMacroData** ([line 198](src/lib/agent/options-agent-graph.ts#L198))
   - Pull economic indicators from FRED API
   - Fed Funds Rate, Unemployment, Term Spread (10Y-3M), CPI

4. **EngineerFeatures** ([line 221](src/lib/agent/options-agent-graph.ts#L221))
   - Calculate IV Rank (implied volatility percentile)
   - Compute term slope (near-term vs far-term IV)
   - Measure put skew (put IV - call IV)
   - Volume/OI ratio for liquidity assessment

5. **GenerateCandidates** ([line 271](src/lib/agent/options-agent-graph.ts#L271))
   - Generate put credit spread candidates
   - Filter by IPS delta preferences (optimal range: 0.12-0.15)
   - Calculate entry credit, max profit/loss, breakeven
   - Estimate probability of profit (POP) from delta

6. **RiskGuardrails** ([line 451](src/lib/agent/options-agent-graph.ts#L451))
   - Check for earnings announcements (next 10 days)
   - Fetch 7-day news volume for sentiment analysis
   - Estimate 90-day news baseline for z-score calculation
   - Identify FOMC/macro event risk

7. **DeepReasoning** ([line 545](src/lib/agent/options-agent-graph.ts#L545))
   - Multi-phase analysis with IPS validation
   - Historical context integration via RAG
   - Market factor synthesis
   - Threshold adjustments based on regime

8. **ScoreIPS** ([line 922](src/lib/agent/options-agent-graph.ts#L922))
   - Score trades against IPS factor criteria
   - Weighted factor evaluation (delta, IV rank, Greeks, fundamentals)
   - Enhanced PCS (Put Credit Spread) evaluation framework
   - Hard gate checks: credit/width ratio, news z-score, liquidity

9. **LLM_Rationale** ([line 1264](src/lib/agent/options-agent-graph.ts#L1264))
   - Generate human-readable trade rationales
   - Synthesize news sentiment from Tavily search
   - Include macro context and key factor highlights
   - Create out-of-IPS justifications when score < 60

10. **SelectTopK** ([line 1441](src/lib/agent/options-agent-graph.ts#L1441))
    - Rank trades by composite score (70% IPS fit + 30% risk/reward)
    - Prioritize perfect IPS matches (≥99.9%)
    - Select top 10 trades
    - Persist to database with detailed analysis

### Graph Construction & Execution

**Build Function**: `buildOptionsAgentGraph()` ([line 1565](src/lib/agent/options-agent-graph.ts#L1565))
- Constructs the LangGraph with all 10 nodes
- Defines sequential edges (FetchIPS → FetchMarketData → ... → SelectTopK)
- Returns compiled graph ready for execution

**Entry Point**: `runAgentOnce()` ([line 1618](src/lib/agent/options-agent-graph.ts#L1618))
```typescript
await runAgentOnce({
  symbols: ["AAPL", "MSFT"],
  mode: "paper",
  ipsId: "your-ips-id"
});
```

### Agent Tools (LangChain StructuredTools)

**Location**: [src/lib/agent/tools.ts](src/lib/agent/tools.ts)

Available tools for LLM-based reasoning:
- `get_quote` - Real-time stock quotes
- `get_company_overview` - Fundamentals (P/E, Beta, market cap)
- `get_options_chain` - Options contracts for a symbol
- `get_economic_indicator` - FRED macroeconomic data
- `search_news` - Tavily web search for news/research

### Supporting Agent Files

**Deep Reasoning & Analysis**:
- [src/lib/agent/deep-reasoning.ts](src/lib/agent/deep-reasoning.ts) - Multi-step reasoning chains
- [src/lib/agent/pcs-trade-evaluator.ts](src/lib/agent/pcs-trade-evaluator.ts) - Put Credit Spread evaluation framework
- [src/lib/agent/ips-enhanced-scoring.ts](src/lib/agent/ips-enhanced-scoring.ts) - Enhanced IPS scoring with adjustments

**Backtesting & Historical Context**:
- [src/lib/agent/ips-backtester.ts](src/lib/agent/ips-backtester.ts) - IPS backtest evaluation
- [src/lib/services/time-travel-rag-service.ts](src/lib/services/time-travel-rag-service.ts) - Historical context retrieval

**RAG (Retrieval-Augmented Generation)**:
- [src/lib/agent/rag-embeddings.ts](src/lib/agent/rag-embeddings.ts) - Embedding generation
- [src/lib/agent/rag-router.ts](src/lib/agent/rag-router.ts) - RAG routing logic
- [src/lib/agent/multi-source-rag-orchestrator.ts](src/lib/agent/multi-source-rag-orchestrator.ts) - Multi-source research aggregation

**Configuration**:
- [src/lib/agent/config.ts](src/lib/agent/config.ts) - Agent configuration (filtering, diversity, scoring tiers)

**Monitoring & Jobs**:
- [src/lib/agent/active-trade-monitor.ts](src/lib/agent/active-trade-monitor.ts) - Live trade monitoring
- [src/lib/agent/trade-postmortem.ts](src/lib/agent/trade-postmortem.ts) - Trade analysis after close
- [src/lib/agent/job-runner.ts](src/lib/agent/job-runner.ts) - Async job execution

---

## 🏗️ Project Structure

### Application Pages (`src/app/`)

- [/](src/app/page.tsx) - Landing page
- [/dashboard](src/app/dashboard) - Main trading dashboard
- [/trades](src/app/trades) - Trade management interface
- [/watchlist](src/app/watchlist) - Stock watchlist
- [/history](src/app/history) - Trade history
- [/backtest-history](src/app/backtest-history) - Backtesting results
- [/journal](src/app/journal) - Trading journal
- [/ips](src/app/ips) - Investment Policy Statement tool
- [/agent](src/app/agent) - Agent control panel
- [/analytics](src/app/analytics) - Analytics views
- [/account](src/app/account) - Account settings
- [/login](src/app/login) & [/signup](src/app/signup) - Authentication

### API Routes (`src/app/api/`)

**Agent Endpoints**:
- `/api/agent/run` - Execute agent analysis
- `/api/agent/jobs` - Job listing & creation
- `/api/agent/jobs/[jobId]` - Job status & details
- `/api/agent/candidates` - Retrieve trade candidates
- `/api/agent/scheduler` - Job scheduling
- `/api/agent/worker/process` - Background job processing
- `/api/agent/rag/seed` - RAG knowledge base seeding
- `/api/agent/rag/enrich` - RAG enrichment

**Other Key Endpoints**:
- `/api/trades` - Trade CRUD operations
- `/api/backtest` - Backtesting engine
- `/api/journal` - Journal entries
- `/api/ips` - IPS operations
- `/api/market-data` - Market data fetching
- `/api/snapshots` - Trade snapshots with embeddings
- `/api/embedding` - Embedding operations
- `/api/patterns` - Pattern detection
- 25+ total endpoints

### Core Services (`src/lib/services/`) - 31 Files

**Market Data**:
- [market-data-service.ts](src/lib/services/market-data-service.ts) - Market data aggregation
- [alpha-vantage.ts](src/lib/services/alpha-vantage.ts) - Alpha Vantage client wrapper
- [iv-cache-service.ts](src/lib/services/iv-cache-service.ts) - Implied volatility caching

**IPS & Backtesting**:
- [ips-backtesting-engine.ts](src/lib/services/ips-backtesting-engine.ts) - Backtest execution
- [ips-performance-calculator.ts](src/lib/services/ips-performance-calculator.ts) - IPS metrics
- [ips-ai-analyzer.ts](src/lib/services/ips-ai-analyzer.ts) - AI-enhanced IPS analysis

**AI/ML Services**:
- [ai-trade-evaluator.ts](src/lib/services/ai-trade-evaluator.ts) - Trade evaluation engine
- [embedding-service.ts](src/lib/services/embedding-service.ts) - Embedding generation (OpenAI 2000D)
- [unified-intelligence-service.ts](src/lib/services/unified-intelligence-service.ts) - Intelligence aggregation

**Trade Analysis**:
- [trade-scoring-service.ts](src/lib/services/trade-scoring-service.ts) - Trade scoring logic
- [trade-postmortem-service.ts](src/lib/services/trade-postmortem-service.ts) - Post-trade analysis
- [enhanced-trade-recommendation-service.ts](src/lib/services/enhanced-trade-recommendation-service.ts) - Recommendation engine

**Research & Intelligence**:
- [market-intelligence-service.ts](src/lib/services/market-intelligence-service.ts) - Market research
- [time-travel-rag-service.ts](src/lib/services/time-travel-rag-service.ts) - Historical context retrieval
- [backtest-rag-integration.ts](src/lib/services/backtest-rag-integration.ts) - Backtest + RAG

### Database Schema (`supabase/migrations/`) - 65+ SQL Files

**Core Tables**:
- [20240924_create_ai_trade_tables.sql](supabase/migrations/20240924_create_ai_trade_tables.sql) - Trade tables (`ai_trades`, `ai_trade_candidates`, `ai_agent_runs`)
- [20251009_create_snapshot_embeddings.sql](supabase/migrations/20251009_create_snapshot_embeddings.sql) - Trade snapshots with pgvector embeddings (2000D)
- [20251027_create_agent_jobs_queue.sql](supabase/migrations/20251027_create_agent_jobs_queue.sql) - Agent job scheduling queue
- [20251028_create_journal_entries.sql](supabase/migrations/20251028_create_journal_entries.sql) - Trading journal entries
- [20251005_enable_pgvector.sql](supabase/migrations/20251005_enable_pgvector.sql) - Enable pgvector extension
- [20251029_migrate_to_2000_dimensions.sql](supabase/migrations/20251029_migrate_to_2000_dimensions.sql) - Upgrade embeddings to 2000D

**Key Tables**:
- `ai_agent_runs` - Agent execution history
- `ai_trade_candidates` - Generated trade candidates with detailed analysis
- `ai_trades` - User's trade history
- `snapshot_embeddings` - Daily trade snapshots with vector embeddings
- `journal_entries` - Trading journal with AI insights
- `agent_jobs_queue` - Background job queue
- `ips_configurations` - Investment Policy Statements
- `trade_pattern_views` - ML pattern detection views

**Vector Search**: pgvector extension for semantic similarity search (2000-dimensional embeddings)

### State Management

- **Zustand Store**: [src/lib/stores/trades-store.ts](src/lib/stores/trades-store.ts) - Global trade state
- **React Context**: Providers in [src/components/providers/](src/components/providers/)

### React Components (`src/components/`)

- [/agent/](src/components/agent/) - Agent UI components
- [/dashboard/](src/components/dashboard/) - Dashboard-specific components
  - [excel-style-trades-dashboard.tsx](src/components/dashboard/excel-style-trades-dashboard.tsx)
  - [historic-trades-dashboard.tsx](src/components/dashboard/historic-trades-dashboard.tsx)
- [/journal/](src/components/journal/) - Journal components
- [/ips/](src/components/ips/) - IPS tool components
- [/trades/](src/components/trades/) - Trade management UI
- [/watchlist/](src/components/watchlist/) - Watchlist components
- [/ui/](src/components/ui/) - Shadcn UI component library (Radix UI primitives)

---

## 🛠️ Tech Stack

### Core Framework
- **Next.js 15.4.5** - React framework with App Router
- **React 19.1.0** - UI library
- **TypeScript** - Type safety throughout

### AI/Agent Framework
- **LangChain 0.3.35** - LLM orchestration and tool calling
- **@langchain/langgraph 0.4.9** - State graph for agent workflow
- **@langchain/ollama 0.2.4** - Local LLM integration (optional)
- **OpenAI API** - Embeddings (text-embedding-3-large, 2000D)

### Database & Backend
- **Supabase** - PostgreSQL database with real-time subscriptions
- **pgvector** - Vector similarity search for embeddings
- **Supabase Auth** - User authentication and authorization

### Data Sources & APIs
- **Alpha Vantage** - Stock/options data, company fundamentals, technical indicators
- **Tavily** - Web search API for news and research
- **FRED API** - Federal Reserve economic data (interest rates, unemployment, etc.)
- **Reddit API** - Sentiment analysis from social media (optional)

### UI & Styling
- **Tailwind CSS 4** - Utility-first CSS framework
- **Shadcn UI** - Accessible component library built on Radix UI primitives
- **Recharts** - Data visualization and charting
- **Lucide React** - Icon library

### Utilities
- **Zod** - Schema validation for API responses and type safety
- **p-retry** - Retry logic for API calls with exponential backoff
- **p-queue** - Request rate limiting and concurrency control
- **cron** & **node-cron** - Job scheduling for market data updates

---

## 📦 Installation & Setup

### Prerequisites

- **Node.js 18+** and npm
- **Supabase account** ([https://supabase.com](https://supabase.com))
- **API Keys** (see below for links):
  - Alpha Vantage (stock/options data)
  - OpenAI (embeddings)
  - Tavily (web search)

### Setup Steps

#### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/tenxiv.git
cd tenxiv
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Set Up Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials (see **Environment Variables** section below for details).

#### 4. Set Up Supabase Database

1. Create a new Supabase project at [https://app.supabase.com](https://app.supabase.com)
2. Get your project URL and API keys from **Settings → API**
3. Run all SQL migrations in order from the `supabase/migrations/` folder:
   - Use the Supabase SQL Editor or Supabase CLI
   - Migrations are numbered sequentially (run in order)
4. Ensure pgvector extension is enabled (see [supabase/migrations/20251005_enable_pgvector.sql](supabase/migrations/20251005_enable_pgvector.sql))

#### 5. Run Development Server

```bash
npm run dev
```

#### 6. Open in Browser

Navigate to [http://localhost:3000](http://localhost:3000)

---

## 🔑 Environment Variables

### Required API Keys

Create a `.env` file (copy from `.env.example`) and fill in these values:

#### Alpha Vantage (Stock/Options Data)
- **Get key**: [https://www.alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
- **Variables**:
  - `ALPHA_VANTAGE_API_KEY` - Your API key
  - `ALPHA_VANTAGE_MIN_DELAY_MS=100` - Rate limiting
  - `ALPHA_VANTAGE_ENTITLEMENT=realtime` - Data tier

#### Supabase (Database)
- **Get credentials**: [https://app.supabase.com/project/_/settings/api](https://app.supabase.com/project/_/settings/api)
- **Variables**:
  - `SUPABASE_URL` - Your project URL
  - `SUPABASE_SERVICE_ROLE_KEY` - Service role key (secret)
  - `SUPABASE_ANON_KEY` - Anonymous key (public)
  - `DATABASE_URL` - PostgreSQL connection string

#### OpenAI (Embeddings)
- **Get key**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Variables**:
  - `OPENAI_API_KEY` - Your OpenAI API key
  - `EMBEDDING_PROVIDER=openai`
  - `OPENAI_EMBEDDING_MODEL=text-embedding-3-large`
  - `OPENAI_EMBEDDING_DIMENSIONS=2000`

#### Tavily (Web Search)
- **Get key**: [https://tavily.com/](https://tavily.com/)
- **Variables**:
  - `TAVILY_API_KEY` - Your Tavily API key

#### Optional: Ollama (Local LLM)
- **Setup**: [https://ollama.com/](https://ollama.com/)
- **Variables**:
  - `OLLAMA_HOST=http://localhost:11434`
  - `OLLAMA_MODEL=llama4:maverick`

See [.env.example](.env.example) for a complete list with descriptions.

---

## 🚀 Key Features

### 1. AI-Powered Trade Analysis
- **LangGraph-based agent workflow** for systematic trade evaluation
- **Multi-factor analysis**: IV rank, Greeks (delta, theta, vega), fundamentals, sentiment
- **IPS integration**: Rule-based filtering and scoring based on user-defined criteria
- **Risk guardrails**: Earnings detection, news volume spikes, macro event risk

### 2. Investment Policy Statement (IPS) Tool
- **Define trading rules**: Set factor criteria (delta, IV rank, P/E, etc.) with weights and thresholds
- **Backtest IPS**: Validate strategy against historical trades
- **AI-powered compliance**: Automated scoring and violation detection
- **IPS-aware candidate generation**: Agent respects delta ranges, risk limits, etc.

### 3. Options Strategy Support
- **Put Credit Spreads (PCS)** - Primary focus
  - Credit/width ratio validation
  - Probability of profit (POP) estimation from delta
  - Risk/reward analysis
  - Liquidity checks (bid-ask spread, open interest)

### 4. Research & Intelligence (RAG)
- **Historical context retrieval**: Time-travel RAG for past market conditions
- **Real-time news**: Tavily web search with sentiment analysis
- **Multi-source intelligence**: Aggregation from fundamentals, technicals, news, macros
- **Vector similarity search**: pgvector for semantic search of trade snapshots
- **2000D embeddings**: OpenAI text-embedding-3-large for high-quality representations

### 5. Trade Journal
- **Post-trade analysis**: Automated postmortem with AI insights
- **Performance tracking**: Win rate, P&L, factor correlations
- **Pattern detection**: Identify winning/losing patterns across trades

### 6. Backtesting Engine
- **Historical strategy simulation**: Test IPS against past market data
- **IPS compliance validation**: Ensure trades meet criteria
- **Performance metrics**: Sharpe ratio, max drawdown, win rate, etc.
- **RAG-enhanced analysis**: Historical context for each backtest period

---

## 🧪 Running the Agent

### Via UI

1. Navigate to the [/agent](http://localhost:3000/agent) page
2. Configure:
   - **Symbols**: Select stocks to analyze (e.g., AAPL, MSFT)
   - **IPS**: Choose an Investment Policy Statement
   - **Mode**: Paper trading or backtest
3. Click **"Run Agent"**
4. Monitor progress in real-time
5. View results in the [dashboard](http://localhost:3000/dashboard)

### Via API

**Run Agent**:
```bash
curl -X POST http://localhost:3000/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "MSFT"],
    "ipsId": "your-ips-id",
    "mode": "paper"
  }'
```

**Get Latest Results**:
```bash
curl http://localhost:3000/api/agent/latest
```

### Background Jobs

- **Schedule jobs**: POST to `/api/agent/scheduler`
- **Job queue**: `agent_jobs_queue` table in Supabase
- **Processing**: Async worker at `/api/agent/worker/process`
- **Monitor**: Check job status via `/agent` page or `/api/agent/jobs/[jobId]`

---

## 📊 Database Schema Overview

Key tables (see [supabase/migrations/](supabase/migrations/) for full schema):

- **`ai_agent_runs`** - Agent execution history (runId, mode, symbols, timestamps)
- **`ai_trade_candidates`** - Generated trade candidates with:
  - Contract legs (short/long strikes, Greeks)
  - IPS scores and factor breakdowns
  - News sentiment, rationales, selection reasoning
- **`ai_trades`** - User's trade history (entry/exit, P&L, status)
- **`snapshot_embeddings`** - Daily trade snapshots with 2000D vector embeddings
- **`journal_entries`** - Trading journal with AI postmortem analysis
- **`agent_jobs_queue`** - Background job queue (pending, processing, completed)
- **`ips_configurations`** - Investment Policy Statements (factors, thresholds, weights)
- **`trade_pattern_views`** - Materialized views for pattern detection

---

## 🎯 Academic Context

This project demonstrates proficiency in:

- **AI Agent Design**: LangGraph state machine for complex multi-step workflows with persistent state
- **RAG Architecture**: Vector embeddings (2000D) with pgvector for semantic search and historical context retrieval
- **API Integration**: Multiple financial data sources (Alpha Vantage, FRED, Tavily) with rate limiting and error handling
- **Full-Stack Development**: Next.js App Router, React Server Components, TypeScript, Supabase real-time
- **Database Design**: PostgreSQL with advanced features (pgvector, triggers, materialized views, RLS)
- **LLM Integration**: OpenAI embeddings (2000D text-embedding-3-large), local Ollama inference (optional)
- **Real-Time Analysis**: Market data processing, sentiment analysis, news aggregation
- **Performance Optimization**: Rate limiting (p-queue), caching (Redis-style), query optimization, connection pooling

**Key Innovations**:
1. **IPS-Driven Agent**: First-class integration of user-defined investment rules into agent workflow
2. **Time-Travel RAG**: Historical context retrieval for backtesting with period-specific embeddings
3. **Multi-Source Intelligence**: Unified framework for fundamentals, technicals, news, and macros
4. **2000D Embeddings**: Higher-dimensional embeddings for better semantic search quality
5. **Enhanced PCS Evaluation**: Hard gates (credit/width, news z-score, liquidity) for trade quality

---

## 📚 Documentation

Additional technical documentation in the [docs/](docs/) folder:

- **[IMPLEMENTATION_SUMMARY.md](docs/IMPLEMENTATION_SUMMARY.md)** - Key implementation details and architecture decisions
- **[DAILY_SNAPSHOTS_AND_EMBEDDINGS_SUMMARY.md](docs/DAILY_SNAPSHOTS_AND_EMBEDDINGS_SUMMARY.md)** - Snapshot/embedding system design
- **[EMBEDDING_MIGRATION_GUIDE.md](docs/EMBEDDING_MIGRATION_GUIDE.md)** - Vector dimension migration (1536D → 2000D)
- **[TAVILY_OPTIMIZATION_COMPLETE.md](docs/TAVILY_OPTIMIZATION_COMPLETE.md)** - Tavily API optimization for credit usage
- **[JOURNAL_FEATURE.md](docs/JOURNAL_FEATURE.md)** - Trading journal feature documentation
- **[CHANGES.md](docs/CHANGES.md)** - Change log and version history

---

## 📝 Scripts & Utilities

The [scripts/](scripts/) folder contains utility scripts:

- **[ecosystem.config.js](scripts/ecosystem.config.js)** - PM2 process manager config for production
- **[scripts/schedulers/](scripts/schedulers/)** - Automated schedulers (spread prices, daily snapshots)
- **[scripts/migrations/](scripts/migrations/)** - Database migration runners
- **[scripts/backfill/](scripts/backfill/)** - Historical data backfill utilities
- **[scripts/analysis/](scripts/analysis/)** - Data analysis and reporting tools

---

## 🏃 Development Workflow

### Build for Production
```bash
npm run build
```

### Run Production Build
```bash
npm start
```

### Lint Code
```bash
npm run lint
```

### Type Check
```bash
npx tsc --noEmit
```

---

## 🚧 Troubleshooting

### Common Issues

**Issue**: "Module not found" errors
- **Solution**: Run `npm install` to ensure all dependencies are installed

**Issue**: Database connection errors
- **Solution**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`

**Issue**: Agent runs fail with "ALPHA_VANTAGE rate limit"
- **Solution**: Increase `ALPHA_VANTAGE_MIN_DELAY_MS` in `.env` (try 200-500ms)

**Issue**: Embeddings fail with "OpenAI API error"
- **Solution**: Check `OPENAI_API_KEY` is valid and has sufficient credits

**Issue**: `.next/` folder missing errors
- **Solution**: Run `npm run build` to regenerate the build folder

---

## 📄 License

[Add your license information here]

---

## 👨‍💻 Author

**Tucker Morin**
Utah Tech University
Computer Science Program

---

## 🙏 Acknowledgments

- **LangChain Team** - For the incredible LangGraph framework
- **Vercel** - For Next.js and hosting
- **Supabase** - For PostgreSQL + pgvector backend
- **Alpha Vantage** - For financial market data
- **OpenAI** - For high-quality embeddings

---

## 📬 Contact

For questions about this project, please contact:
- **Email**: [your-email@example.com]
- **GitHub**: [https://github.com/yourusername]

---

**Built with ❤️ using LangGraph, Next.js, and AI**
