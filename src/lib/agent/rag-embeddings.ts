// RAG Embedding Pipeline for Trade Historical Context
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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
