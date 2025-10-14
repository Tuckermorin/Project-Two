// RAG Embedding Pipeline for Trade Historical Context
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getDailyMarketContextService } from "@/lib/services/daily-market-context-service";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Determine which embedding provider to use
// Prefer OpenAI if API key is available, otherwise fall back to Ollama
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const USE_OLLAMA = !openai && !!process.env.OLLAMA_HOST;
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

// ============================================================================
// Embedding Creation
// ============================================================================

/**
 * Generate embedding vector using Ollama
 */
async function generateOllamaEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding;
}

/**
 * Generate embedding vector using OpenAI
 */
async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    throw new Error("OpenAI client not initialized - missing API key");
  }

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return embeddingResponse.data[0].embedding;
}

/**
 * Generate embedding using configured provider (Ollama or OpenAI)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (USE_OLLAMA) {
    console.log(`[RAG] Using Ollama for embeddings (${OLLAMA_HOST})`);
    return generateOllamaEmbedding(text);
  } else if (openai) {
    console.log(`[RAG] Using OpenAI for embeddings`);
    return generateOpenAIEmbedding(text);
  } else {
    throw new Error(
      "No embedding provider available. Set OPENAI_API_KEY (with billing) or OLLAMA_HOST in .env"
    );
  }
}

/**
 * Create embedding for a closed trade outcome
 */
export async function embedTradeOutcome(trade: any): Promise<void> {
  console.log(`[RAG] Creating embedding for trade ${trade.id} (${trade.symbol})`);

  try {
    // Build context text for embedding
    const context = buildTradeContext(trade);

    // Generate embedding using configured provider
    const embedding = await generateEmbedding(context);

    // Store in Supabase
    await supabase.from("trade_embeddings").insert({
      trade_id: trade.id,
      embedding: embedding,
      metadata: {
        symbol: trade.symbol,
        strategy: trade.strategy_type,
        ips_score: trade.ips_score,
        ips_id: trade.ips_id,
        status: trade.status,
        realized_pnl: trade.realized_pnl,
        realized_pnl_percent: trade.realized_pl_percent,
        entry_date: trade.entry_date,
        exit_date: trade.exit_date,
        // Include key factors for similarity matching
        delta: trade.delta,
        iv_rank: trade.iv_rank,
        dte: trade.dte,
        win: trade.realized_pnl > 0,
      },
      user_id: trade.user_id,
    });

    console.log(`[RAG] ✓ Embedded trade ${trade.id}`);
  } catch (error: any) {
    console.error(`[RAG] Failed to embed trade ${trade.id}:`, error.message);
    throw error;
  }
}

/**
 * Build context text from trade data for embedding
 */
function buildTradeContext(trade: any): string {
  const lines: string[] = [
    `Symbol: ${trade.symbol}`,
    `Strategy: ${trade.strategy_type}`,
    `Status: ${trade.status}`,
  ];

  if (trade.ips_score != null) {
    lines.push(`IPS Score: ${trade.ips_score}%`);
  }

  if (trade.factors_met != null && trade.total_factors != null) {
    lines.push(`IPS Factors: ${trade.factors_met}/${trade.total_factors} met`);
  }

  if (trade.entry_price != null) {
    lines.push(`Entry Price: $${trade.entry_price}`);
  }

  if (trade.strike_price_short != null) {
    lines.push(`Short Strike: $${trade.strike_price_short}`);
  }

  if (trade.strike_price_long != null) {
    lines.push(`Long Strike: $${trade.strike_price_long}`);
  }

  if (trade.credit_received != null) {
    lines.push(`Credit: $${trade.credit_received}`);
  }

  if (trade.max_loss != null) {
    lines.push(`Max Loss: $${trade.max_loss}`);
  }

  if (trade.max_gain != null) {
    lines.push(`Max Gain: $${trade.max_gain}`);
  }

  if (trade.realized_pnl != null) {
    const outcome = trade.realized_pnl > 0 ? "WIN" : "LOSS";
    lines.push(`Outcome: ${outcome} (P&L: $${trade.realized_pnl})`);
  }

  if (trade.realized_pl_percent != null) {
    lines.push(`ROI: ${trade.realized_pl_percent}%`);
  }

  if (trade.entry_date && trade.exit_date) {
    const days = Math.ceil(
      (new Date(trade.exit_date).getTime() - new Date(trade.entry_date).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    lines.push(`Held: ${days} days`);
  }

  if (trade.evaluation_notes) {
    lines.push(`Notes: ${trade.evaluation_notes}`);
  }

  // Add Reddit context from metadata if available
  if (trade.metadata?.reddit) {
    const reddit = trade.metadata.reddit;

    if (reddit.sentiment_score != null) {
      const sentimentLabel =
        reddit.sentiment_score > 0.3 ? "bullish" :
        reddit.sentiment_score < -0.3 ? "bearish" :
        "neutral";
      lines.push(`Reddit Sentiment: ${sentimentLabel} (${reddit.sentiment_score.toFixed(2)})`);
    }

    if (reddit.mention_count != null) {
      lines.push(`Reddit Mentions: ${reddit.mention_count}`);
    }

    if (reddit.trending_rank != null) {
      lines.push(`Reddit Trending: Rank #${reddit.trending_rank}`);
    }

    if (reddit.mention_velocity != null) {
      const velocityLabel = reddit.mention_velocity > 0 ? "increasing" : "decreasing";
      lines.push(`Reddit Velocity: ${velocityLabel} (${reddit.mention_velocity}%)`);
    }
  }

  // Add Alpha Vantage News Sentiment context
  if (trade.metadata?.av_news_sentiment) {
    const news = trade.metadata.av_news_sentiment;

    if (news.sentiment_label) {
      lines.push(`News Sentiment: ${news.sentiment_label}`);
    }

    if (news.average_score != null) {
      lines.push(`News Score: ${news.average_score.toFixed(2)} (${news.positive || 0}+ / ${news.negative || 0}- articles)`);
    }

    if (news.avg_relevance != null) {
      lines.push(`News Relevance: ${news.avg_relevance.toFixed(2)}`);
    }

    // Add topic-specific sentiment
    if (news.topic_sentiment) {
      const topics = Object.entries(news.topic_sentiment)
        .slice(0, 3)
        .map(([topic, score]) => `${topic}:${(score as number).toFixed(2)}`)
        .join(', ');
      if (topics) {
        lines.push(`Topic Sentiment: ${topics}`);
      }
    }
  }

  // Add Insider Activity context
  if (trade.metadata?.insider_activity) {
    const insider = trade.metadata.insider_activity;

    if (insider.transaction_count > 0) {
      lines.push(`Insider Transactions: ${insider.transaction_count} (${insider.acquisition_count} buys, ${insider.disposal_count} sells)`);
    }

    if (insider.buy_ratio != null && insider.transaction_count >= 3) {
      const ratioLabel =
        insider.buy_ratio > 2.0 ? "strong buying" :
        insider.buy_ratio > 1.0 ? "moderate buying" :
        insider.buy_ratio > 0.5 ? "balanced" :
        "selling";
      lines.push(`Insider Activity: ${ratioLabel} (ratio: ${insider.buy_ratio.toFixed(2)})`);
    }

    if (insider.activity_trend != null) {
      const trendLabel =
        insider.activity_trend > 0.5 ? "increasingly bullish" :
        insider.activity_trend < -0.5 ? "increasingly bearish" :
        "stable";
      lines.push(`Insider Trend: ${trendLabel}`);
    }
  }

  // Add Intelligence Adjustments if present
  if (trade.metadata?.intelligence_adjustments && trade.metadata.intelligence_adjustments !== 'none') {
    lines.push(`Intelligence Adjustments: ${trade.metadata.intelligence_adjustments}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Retrieval
// ============================================================================

export interface SimilarTrade {
  trade_id: string;
  similarity: number;
  metadata: any;
}

/**
 * Find similar historical trades for a candidate
 */
export async function findSimilarTrades(
  candidate: any,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    ipsId?: string;
  } = {}
): Promise<SimilarTrade[]> {
  const { matchThreshold = 0.75, matchCount = 10, ipsId } = options;

  console.log(`[RAG] Finding similar trades for ${candidate.symbol} ${candidate.strategy}`);

  try {
    // Build query context for candidate
    const queryText = buildCandidateContext(candidate);

    // Generate query embedding using configured provider
    const queryEmbedding = await generateEmbedding(queryText);

    // Query Supabase for similar trades
    const { data, error } = await supabase.rpc("match_trades", {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error("[RAG] Error querying similar trades:", error);
      return [];
    }

    // Filter by IPS if specified
    let results = data || [];
    if (ipsId) {
      results = results.filter((r: any) => r.metadata?.ips_id === ipsId);
    }

    console.log(`[RAG] Found ${results.length} similar trades (threshold: ${matchThreshold})`);

    return results.map((r: any) => ({
      trade_id: r.trade_id,
      similarity: r.similarity,
      metadata: r.metadata,
    }));
  } catch (error: any) {
    console.error(`[RAG] Failed to find similar trades:`, error.message);
    return [];
  }
}

/**
 * Build context text for a trade candidate
 */
function buildCandidateContext(candidate: any): string {
  const lines: string[] = [
    `Symbol: ${candidate.symbol}`,
    `Strategy: ${candidate.strategy}`,
  ];

  const shortLeg = candidate.contract_legs?.find((l: any) => l.type === "SELL");
  const longLeg = candidate.contract_legs?.find((l: any) => l.type === "BUY");

  if (shortLeg?.strike) {
    lines.push(`Short Strike: $${shortLeg.strike}`);
  }

  if (longLeg?.strike) {
    lines.push(`Long Strike: $${longLeg.strike}`);
  }

  if (candidate.entry_mid != null) {
    lines.push(`Credit: $${candidate.entry_mid}`);
  }

  if (candidate.max_loss != null) {
    lines.push(`Max Loss: $${candidate.max_loss}`);
  }

  if (candidate.max_profit != null) {
    lines.push(`Max Gain: $${candidate.max_profit}`);
  }

  if (shortLeg?.delta != null) {
    lines.push(`Delta: ${Math.abs(shortLeg.delta).toFixed(2)}`);
  }

  if (shortLeg?.theta != null) {
    lines.push(`Theta: ${shortLeg.theta}`);
  }

  if (shortLeg?.iv != null) {
    lines.push(`IV: ${shortLeg.iv}`);
  }

  if (candidate.ips_score != null) {
    lines.push(`IPS Score: ${candidate.ips_score}%`);
  }

  return lines.join("\n");
}

// ============================================================================
// Analysis
// ============================================================================

export interface HistoricalAnalysis {
  has_data: boolean;
  trade_count: number;
  win_rate: number;
  avg_roi: number;
  avg_hold_days: number;
  similar_trades: SimilarTrade[];
  confidence: "high" | "medium" | "low";
}

/**
 * Analyze historical performance for a candidate
 */
export async function analyzeHistoricalPerformance(
  candidate: any,
  ipsId?: string
): Promise<HistoricalAnalysis> {
  const similarTrades = await findSimilarTrades(candidate, {
    matchThreshold: 0.75,
    matchCount: 20,
    ipsId,
  });

  if (similarTrades.length === 0) {
    return {
      has_data: false,
      trade_count: 0,
      win_rate: 0,
      avg_roi: 0,
      avg_hold_days: 0,
      similar_trades: [],
      confidence: "low",
    };
  }

  // Calculate statistics
  const wins = similarTrades.filter((t) => t.metadata?.win === true).length;
  const winRate = wins / similarTrades.length;

  const rois = similarTrades
    .map((t) => t.metadata?.realized_pnl_percent)
    .filter((roi) => roi != null);
  const avgRoi = rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : 0;

  // Determine confidence based on sample size and similarity
  const avgSimilarity =
    similarTrades.reduce((sum, t) => sum + t.similarity, 0) / similarTrades.length;
  const confidence =
    similarTrades.length >= 10 && avgSimilarity >= 0.85
      ? "high"
      : similarTrades.length >= 5 && avgSimilarity >= 0.75
        ? "medium"
        : "low";

  return {
    has_data: true,
    trade_count: similarTrades.length,
    win_rate: winRate,
    avg_roi: avgRoi,
    avg_hold_days: 0, // TODO: Calculate from entry/exit dates
    similar_trades: similarTrades,
    confidence,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Seed embeddings for all existing closed trades
 */
export async function seedTradeEmbeddings(userId: string): Promise<number> {
  console.log("[RAG] Seeding trade embeddings for user", userId);

  // Fetch all closed trades without embeddings
  const { data: trades, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "closed")
    .not("realized_pnl", "is", null);

  if (error) {
    console.error("[RAG] Failed to fetch trades:", error);
    throw error;
  }

  if (!trades || trades.length === 0) {
    console.log("[RAG] No closed trades to embed");
    return 0;
  }

  console.log(`[RAG] Found ${trades.length} closed trades to embed`);

  let embedded = 0;
  for (const trade of trades) {
    try {
      // Check if embedding already exists
      const { data: existing } = await supabase
        .from("trade_embeddings")
        .select("id")
        .eq("trade_id", trade.id)
        .single();

      if (existing) {
        console.log(`[RAG] Trade ${trade.id} already embedded, skipping`);
        continue;
      }

      await embedTradeOutcome(trade);
      embedded++;

      // Rate limit: OpenAI allows 3000 requests/min for embeddings
      // Add small delay to be safe
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`[RAG] Failed to embed trade ${trade.id}:`, error.message);
    }
  }

  console.log(`[RAG] ✓ Embedded ${embedded}/${trades.length} trades`);
  return embedded;
}

/**
 * Auto-embed when a trade is closed
 */
export async function onTradeClose(tradeId: string): Promise<void> {
  console.log(`[RAG] Auto-embedding closed trade ${tradeId}`);

  // Fetch trade data
  const { data: trade, error } = await supabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .single();

  if (error || !trade) {
    console.error("[RAG] Failed to fetch trade:", error);
    return;
  }

  if (trade.status !== "closed" || trade.realized_pnl == null) {
    console.log("[RAG] Trade not ready for embedding (not closed or no P&L)");
    return;
  }

  await embedTradeOutcome(trade);
}

// ============================================================================
// Snapshot Embeddings
// ============================================================================

/**
 * Embed a trade snapshot for temporal pattern learning
 * Snapshots capture state during trade lifecycle, not just entry/exit
 */
export async function embedTradeSnapshot(
  snapshot: any,
  trade: any,
  options: {
    includeOutcome?: boolean; // If trade is closed, include outcome context
  } = {}
): Promise<void> {
  const { includeOutcome = false } = options;

  console.log(`[RAG] Embedding snapshot for trade ${trade.symbol} (${snapshot.snapshot_trigger})`);

  try {
    // Build snapshot context
    const context = buildSnapshotContext(snapshot, trade, includeOutcome);

    // Generate embedding
    const embedding = await generateEmbedding(context);

    // Store in trade_snapshot_embeddings table (will create migration for this)
    await supabase.from("trade_snapshot_embeddings").insert({
      snapshot_id: snapshot.id,
      trade_id: trade.id,
      embedding: embedding,
      metadata: {
        symbol: trade.symbol,
        strategy: trade.strategy_type,
        snapshot_trigger: snapshot.snapshot_trigger,
        days_in_trade: snapshot.days_in_trade,
        days_to_expiration: snapshot.days_to_expiration,
        delta_spread: snapshot.delta_spread,
        unrealized_pnl_percent: snapshot.unrealized_pnl_percent,
        iv_rank: snapshot.iv_rank,
        // If trade is closed, include outcome for pattern learning
        outcome: includeOutcome && trade.status === 'closed'
          ? trade.realized_pnl > 0 ? 'win' : 'loss'
          : null,
        final_pnl_percent: includeOutcome && trade.status === 'closed'
          ? trade.realized_pl_percent
          : null,
      },
      user_id: trade.user_id,
    });

    console.log(`[RAG] ✓ Embedded snapshot ${snapshot.id}`);
  } catch (error: any) {
    console.error(`[RAG] Failed to embed snapshot ${snapshot.id}:`, error.message);
    throw error;
  }
}

/**
 * Build context text for a trade snapshot
 */
function buildSnapshotContext(snapshot: any, trade: any, includeOutcome: boolean): string {
  const lines: string[] = [
    `Symbol: ${trade.symbol}`,
    `Strategy: ${trade.strategy_type}`,
    `Snapshot Type: ${snapshot.snapshot_trigger}`,
  ];

  // Trade lifecycle context
  if (snapshot.days_in_trade != null) {
    lines.push(`Days in Trade: ${snapshot.days_in_trade}`);
  }

  if (snapshot.days_to_expiration != null) {
    lines.push(`Days to Expiration: ${snapshot.days_to_expiration}`);
  }

  // Current state
  if (snapshot.current_stock_price != null) {
    lines.push(`Stock Price: $${snapshot.current_stock_price}`);
  }

  if (snapshot.current_spread_price != null) {
    lines.push(`Spread Price: $${snapshot.current_spread_price}`);
  }

  // Greeks at snapshot
  if (snapshot.delta_spread != null) {
    const deltaDirection = snapshot.delta_spread > 0 ? "bullish" : "bearish";
    lines.push(`Delta: ${snapshot.delta_spread.toFixed(3)} (${deltaDirection})`);
  }

  if (snapshot.theta != null) {
    lines.push(`Theta: ${snapshot.theta.toFixed(4)}`);
  }

  if (snapshot.gamma != null) {
    lines.push(`Gamma: ${snapshot.gamma.toFixed(4)}`);
  }

  if (snapshot.vega != null) {
    lines.push(`Vega: ${snapshot.vega.toFixed(4)}`);
  }

  // P&L at snapshot
  if (snapshot.unrealized_pnl != null) {
    lines.push(`Unrealized P&L: $${snapshot.unrealized_pnl.toFixed(2)}`);
  }

  if (snapshot.unrealized_pnl_percent != null) {
    const profitStatus =
      snapshot.unrealized_pnl_percent > 50 ? "above profit target" :
      snapshot.unrealized_pnl_percent > 0 ? "profitable" :
      snapshot.unrealized_pnl_percent < -50 ? "significant loss" :
      "at loss";
    lines.push(`P&L: ${snapshot.unrealized_pnl_percent.toFixed(1)}% (${profitStatus})`);
  }

  // IV metrics
  if (snapshot.iv_rank != null) {
    const ivContext =
      snapshot.iv_rank > 70 ? "very high IV environment" :
      snapshot.iv_rank > 50 ? "elevated IV" :
      snapshot.iv_rank < 30 ? "low IV environment" :
      "moderate IV";
    lines.push(`IV Rank: ${snapshot.iv_rank.toFixed(0)}% (${ivContext})`);
  }

  if (snapshot.iv_percentile != null) {
    lines.push(`IV Percentile: ${snapshot.iv_percentile.toFixed(0)}%`);
  }

  if (snapshot.hv_20 != null && snapshot.iv_short_strike != null) {
    const ivVsHv = snapshot.iv_short_strike > snapshot.hv_20 ? "IV elevated vs HV" : "IV compressed vs HV";
    lines.push(`HV20: ${snapshot.hv_20.toFixed(1)}% | IV: ${(snapshot.iv_short_strike * 100).toFixed(1)}% (${ivVsHv})`);
  }

  // Risk metrics
  if (snapshot.probability_of_profit != null) {
    lines.push(`Probability of Profit: ${snapshot.probability_of_profit.toFixed(1)}%`);
  }

  if (snapshot.probability_itm != null) {
    const itmRisk =
      snapshot.probability_itm > 50 ? "high risk of assignment" :
      snapshot.probability_itm > 30 ? "moderate ITM risk" :
      "low ITM risk";
    lines.push(`ITM Probability: ${snapshot.probability_itm.toFixed(1)}% (${itmRisk})`);
  }

  // Market context
  if (snapshot.vix_level != null) {
    const vixEnvironment =
      snapshot.vix_level > 30 ? "high fear" :
      snapshot.vix_level > 20 ? "elevated uncertainty" :
      "calm market";
    lines.push(`VIX: ${snapshot.vix_level.toFixed(1)} (${vixEnvironment})`);
  }

  if (snapshot.spy_price != null) {
    lines.push(`SPY: $${snapshot.spy_price.toFixed(2)}`);
  }

  if (snapshot.sector_performance != null) {
    const sectorTrend =
      snapshot.sector_performance > 2 ? "sector outperforming" :
      snapshot.sector_performance < -2 ? "sector underperforming" :
      "sector neutral";
    lines.push(`Sector Performance: ${snapshot.sector_performance.toFixed(2)}% (${sectorTrend})`);
  }

  // If including outcome (for closed trades), add what happened next
  if (includeOutcome && trade.status === 'closed') {
    const outcome = trade.realized_pnl > 0 ? "WIN" : "LOSS";
    lines.push(`\nFinal Outcome: ${outcome}`);
    lines.push(`Final P&L: $${trade.realized_pnl.toFixed(2)} (${trade.realized_pl_percent.toFixed(1)}%)`);

    // Calculate if this snapshot preceded the exit
    if (trade.exit_date && snapshot.snapshot_time) {
      const daysUntilExit = Math.ceil(
        (new Date(trade.exit_date).getTime() - new Date(snapshot.snapshot_time).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (daysUntilExit >= 0) {
        lines.push(`Days until exit from this snapshot: ${daysUntilExit}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Find similar snapshot patterns
 * Used to answer questions like: "When delta > 0.40, what typically happens?"
 */
export async function findSimilarSnapshots(
  querySnapshot: any,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    onlyWithOutcomes?: boolean; // Only match snapshots from closed trades
  } = {}
): Promise<Array<{
  snapshot_id: string;
  trade_id: string;
  similarity: number;
  metadata: any;
}>> {
  const { matchThreshold = 0.80, matchCount = 20, onlyWithOutcomes = false } = options;

  console.log(`[RAG] Finding similar snapshot patterns`);

  try {
    // Build query context
    const queryText = buildSnapshotContext(querySnapshot, { symbol: querySnapshot.symbol || 'UNKNOWN' }, false);

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(queryText);

    // Query for similar snapshots
    const { data, error } = await supabase.rpc("match_trade_snapshots", {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error("[RAG] Error querying similar snapshots:", error);
      return [];
    }

    let results = data || [];

    // Filter to only snapshots with outcomes if requested
    if (onlyWithOutcomes) {
      results = results.filter((r: any) => r.metadata?.outcome != null);
    }

    console.log(`[RAG] Found ${results.length} similar snapshots`);

    return results;
  } catch (error: any) {
    console.error(`[RAG] Failed to find similar snapshots:`, error.message);
    return [];
  }
}

/**
 * Batch embed all snapshots for closed trades
 * This allows the agent to learn temporal patterns
 */
export async function embedClosedTradeSnapshots(userId: string): Promise<number> {
  console.log("[RAG] Embedding snapshots for closed trades");

  // Get all closed trades
  const { data: closedTrades, error: tradesError } = await supabase
    .from("trades")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "closed");

  if (tradesError || !closedTrades || closedTrades.length === 0) {
    console.log("[RAG] No closed trades found");
    return 0;
  }

  const tradeIds = closedTrades.map(t => t.id);

  // Get all snapshots for these trades
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("trade_snapshots")
    .select("*, trades!inner(*)")
    .in("trade_id", tradeIds);

  if (snapshotsError || !snapshots || snapshots.length === 0) {
    console.log("[RAG] No snapshots found for closed trades");
    return 0;
  }

  console.log(`[RAG] Found ${snapshots.length} snapshots to embed`);

  let embedded = 0;
  for (const snapshot of snapshots) {
    try {
      // Check if already embedded
      const { data: existing } = await supabase
        .from("trade_snapshot_embeddings")
        .select("id")
        .eq("snapshot_id", snapshot.id)
        .single();

      if (existing) {
        continue;
      }

      await embedTradeSnapshot(snapshot, snapshot.trades, { includeOutcome: true });
      embedded++;

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`[RAG] Failed to embed snapshot ${snapshot.id}:`, error.message);
    }
  }

  console.log(`[RAG] ✓ Embedded ${embedded}/${snapshots.length} snapshots`);
  return embedded;
}

// ============================================================================
// Market Context Augmentation for RAG
// ============================================================================

export interface MarketContextSummary {
  date: string;
  summary_preview: string;
  key_themes: string[];
  sentiment: string;
  sentiment_score: number;
  sector_themes?: Record<string, string>;
}

/**
 * Get relevant market context for a trade candidate
 * This provides the agent with recent economic/political news context
 */
export async function getMarketContextForCandidate(
  candidate: any,
  options: {
    daysBack?: number;
    includeSimilarDays?: boolean;
  } = {}
): Promise<{
  recent_context: MarketContextSummary[];
  similar_historical_context?: MarketContextSummary[];
}> {
  const { daysBack = 7, includeSimilarDays = false } = options;

  try {
    const marketContextService = getDailyMarketContextService();

    // Get recent market context (last N days)
    const recentContexts = await marketContextService.getRecentContext(daysBack);

    const recentSummary: MarketContextSummary[] = recentContexts.map(ctx => ({
      date: ctx.as_of_date,
      summary_preview: ctx.summary.substring(0, 300) + '...',
      key_themes: ctx.key_themes?.themes || [],
      sentiment: ctx.overall_market_sentiment,
      sentiment_score: ctx.sentiment_score,
      sector_themes: ctx.sector_themes || undefined,
    }));

    // Optionally search for similar historical market conditions
    let similarSummary: MarketContextSummary[] | undefined;

    if (includeSimilarDays) {
      // Build query from candidate characteristics
      const query = buildMarketContextQuery(candidate);
      const similarContexts = await marketContextService.searchSimilarContext(query, 3);

      similarSummary = similarContexts.map(ctx => ({
        date: ctx.as_of_date,
        summary_preview: ctx.summary.substring(0, 300) + '...',
        key_themes: ctx.key_themes?.themes || [],
        sentiment: ctx.overall_market_sentiment,
        sentiment_score: ctx.sentiment_score,
        sector_themes: ctx.sector_themes || undefined,
      }));
    }

    console.log(`[RAG] Retrieved market context: ${recentSummary.length} recent days${similarSummary ? `, ${similarSummary.length} similar days` : ''}`);

    return {
      recent_context: recentSummary,
      similar_historical_context: similarSummary,
    };
  } catch (error: any) {
    console.error(`[RAG] Failed to get market context:`, error.message);
    return {
      recent_context: [],
      similar_historical_context: undefined,
    };
  }
}

/**
 * Build a market context search query from candidate characteristics
 */
function buildMarketContextQuery(candidate: any): string {
  const parts: string[] = [];

  // Include symbol sector if known
  if (candidate.sector) {
    parts.push(`${candidate.sector} sector`);
  }

  // Include volatility context
  if (candidate.iv_rank != null) {
    if (candidate.iv_rank > 70) {
      parts.push('high volatility elevated uncertainty');
    } else if (candidate.iv_rank < 30) {
      parts.push('low volatility calm market');
    }
  }

  // Include strategy type implications
  if (candidate.strategy === 'PUT_CREDIT_SPREAD') {
    parts.push('bullish market conditions positive sentiment');
  } else if (candidate.strategy === 'CALL_CREDIT_SPREAD') {
    parts.push('bearish market conditions negative sentiment');
  }

  return parts.join(' ');
}

/**
 * Format market context for agent prompts
 * This creates a human-readable summary for the trading agent
 */
export function formatMarketContextForAgent(
  marketContext: {
    recent_context: MarketContextSummary[];
    similar_historical_context?: MarketContextSummary[];
  }
): string {
  const lines: string[] = [];

  if (marketContext.recent_context.length > 0) {
    lines.push('=== RECENT MARKET CONTEXT ===\n');

    // Show most recent day in detail
    const latest = marketContext.recent_context[0];
    lines.push(`Latest (${latest.date}):`);
    lines.push(`  Sentiment: ${latest.sentiment} (${latest.sentiment_score.toFixed(2)})`);
    lines.push(`  Key Themes: ${latest.key_themes.slice(0, 3).join(', ')}`);
    if (latest.sector_themes) {
      const sectors = Object.entries(latest.sector_themes)
        .slice(0, 3)
        .map(([sector, theme]) => `${sector}: ${theme}`)
        .join('; ');
      lines.push(`  Sector Themes: ${sectors}`);
    }
    lines.push(`  Summary: ${latest.summary_preview}\n`);

    // Show summary of other recent days
    if (marketContext.recent_context.length > 1) {
      lines.push('Previous Days Summary:');
      marketContext.recent_context.slice(1, 4).forEach(ctx => {
        lines.push(`  ${ctx.date}: ${ctx.sentiment} (${ctx.sentiment_score.toFixed(2)}) - ${ctx.key_themes.slice(0, 2).join(', ')}`);
      });
      lines.push('');
    }
  }

  if (marketContext.similar_historical_context && marketContext.similar_historical_context.length > 0) {
    lines.push('=== SIMILAR HISTORICAL CONDITIONS ===\n');
    lines.push('Market conditions similar to current environment:\n');

    marketContext.similar_historical_context.forEach((ctx, i) => {
      lines.push(`${i + 1}. ${ctx.date}:`);
      lines.push(`   Sentiment: ${ctx.sentiment} (${ctx.sentiment_score.toFixed(2)})`);
      lines.push(`   Themes: ${ctx.key_themes.slice(0, 3).join(', ')}`);
      lines.push(`   ${ctx.summary_preview}\n`);
    });
  }

  if (lines.length === 0) {
    return 'No recent market context available.';
  }

  return lines.join('\n');
}
