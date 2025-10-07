// Historical Trade Post-Mortem Analysis
// Deep dive analysis of closed trades to extract lessons learned and embed into RAG

import { createClient } from "@supabase/supabase-js";
import { tavilySearch } from "@/lib/clients/tavily";
import {
  queryCatalysts,
  queryAnalystActivity,
  querySECFilings,
  queryOperationalRisks,
} from "@/lib/clients/tavily-queries";
import { embedTradeOutcome } from "./rag-embeddings";
import { rationaleLLM } from "@/lib/clients/llm";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// Types
// ============================================================================

export interface TradePostMortem {
  trade_id: string;
  symbol: string;
  outcome: "win" | "loss";
  realized_pnl: number;
  realized_pnl_percent: number;
  days_held: number;
  trade_lifecycle: {
    entry_context: string;
    during_trade_events: Array<{
      date: string;
      event_type: string;
      description: string;
      impact: "positive" | "negative" | "neutral";
    }>;
    exit_context: string;
  };
  lessons_learned: {
    what_worked: string[];
    what_didnt_work: string[];
    key_insight: string;
  };
  ips_effectiveness: {
    entry_ips_score: number | null;
    ips_factors_validated: string[];
    ips_factors_failed: string[];
  };
  research_summary: {
    total_news_articles: number;
    key_events_detected: number;
    analyst_activity: number;
    sec_filings: number;
  };
  ai_analysis: string;
  credits_used: number;
  created_at: string;
}

interface ClosedTradeData {
  id: string;
  symbol: string;
  strategy_type: string;
  entry_date: string;
  exit_date: string;
  expiration_date: string | null;
  realized_pnl: number;
  realized_pl_percent: number | null;
  ips_score: number | null;
  short_strike: number | null;
  long_strike: number | null;
  credit_received: number | null;
  entry_price: number | null;
  exit_price: number | null;
  status: string;
}

// ============================================================================
// Main Post-Mortem Function
// ============================================================================

/**
 * Perform deep post-mortem analysis on a closed trade
 * Embeds results into RAG for future learning
 */
export async function analyzeTradePostMortem(
  tradeId: string,
  options: {
    embedToRAG?: boolean;
  } = {}
): Promise<TradePostMortem> {
  const { embedToRAG = true } = options;

  console.log(`[PostMortem] Starting analysis for trade ${tradeId}`);

  // Fetch trade data
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .single();

  if (tradeError || !trade) {
    throw new Error(`Trade ${tradeId} not found`);
  }

  const typedTrade = trade as ClosedTradeData;

  // Verify trade is closed
  if (typedTrade.status !== "closed" || typedTrade.realized_pnl == null) {
    throw new Error(`Trade ${tradeId} is not closed or missing P&L data`);
  }

  // Calculate trade metrics
  const entryDate = new Date(typedTrade.entry_date);
  const exitDate = new Date(typedTrade.exit_date);
  const daysHeld = Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
  const outcome: "win" | "loss" = typedTrade.realized_pnl > 0 ? "win" : "loss";

  let creditsUsed = 0;

  console.log(
    `[PostMortem] ${typedTrade.symbol} - ${outcome.toUpperCase()} (${daysHeld} days, P&L: $${typedTrade.realized_pnl})`
  );

  // Fetch historical context during trade period
  const tradeLifecycleData = await fetchTradeLifecycleContext(
    typedTrade,
    entryDate,
    exitDate,
    daysHeld
  );
  creditsUsed += tradeLifecycleData.creditsUsed;

  // Analyze what happened during the trade
  const lifecycleEvents = analyzeLifecycleEvents(
    tradeLifecycleData,
    typedTrade,
    outcome
  );

  // Extract lessons learned
  const lessonsLearned = await generateLessonsLearned({
    trade: typedTrade,
    outcome,
    daysHeld,
    lifecycleEvents,
    lifecycleData: tradeLifecycleData,
  });

  // Analyze IPS effectiveness
  const ipsEffectiveness = analyzeIPSEffectiveness(
    typedTrade,
    outcome,
    lifecycleEvents
  );

  // Generate AI-powered analysis
  const aiAnalysis = await generateAIPostMortem({
    trade: typedTrade,
    outcome,
    daysHeld,
    lessonsLearned,
    ipsEffectiveness,
    lifecycleEvents,
  });

  // Build post-mortem report
  const postMortem: TradePostMortem = {
    trade_id: tradeId,
    symbol: typedTrade.symbol,
    outcome,
    realized_pnl: typedTrade.realized_pnl,
    realized_pnl_percent: typedTrade.realized_pl_percent || 0,
    days_held: daysHeld,
    trade_lifecycle: {
      entry_context: `Entered ${typedTrade.strategy_type} on ${entryDate.toLocaleDateString()} with IPS score ${typedTrade.ips_score || "N/A"}%`,
      during_trade_events: lifecycleEvents,
      exit_context: `Exited on ${exitDate.toLocaleDateString()} with ${outcome === "win" ? "profit" : "loss"} of $${typedTrade.realized_pnl} (${typedTrade.realized_pl_percent?.toFixed(1) || "N/A"}%)`,
    },
    lessons_learned: lessonsLearned,
    ips_effectiveness: ipsEffectiveness,
    research_summary: {
      total_news_articles: tradeLifecycleData.allNews.length,
      key_events_detected: lifecycleEvents.length,
      analyst_activity: tradeLifecycleData.analysts.length,
      sec_filings: tradeLifecycleData.sec.length,
    },
    ai_analysis: aiAnalysis,
    credits_used: creditsUsed,
    created_at: new Date().toISOString(),
  };

  // Store post-mortem
  await storePostMortem(tradeId, postMortem);

  // Embed to RAG if requested
  if (embedToRAG) {
    console.log(`[PostMortem] Embedding to RAG for future learning`);
    await embedPostMortemToRAG(typedTrade, postMortem);
  }

  console.log(`[PostMortem] Analysis complete. Credits used: ${creditsUsed}`);

  return postMortem;
}

// ============================================================================
// Lifecycle Context Fetching
// ============================================================================

async function fetchTradeLifecycleContext(
  trade: ClosedTradeData,
  entryDate: Date,
  exitDate: Date,
  daysHeld: number
): Promise<{
  catalysts: any[];
  analysts: any[];
  sec: any[];
  risks: any[];
  allNews: any[];
  creditsUsed: number;
}> {
  console.log(
    `[PostMortem] Fetching lifecycle context for ${trade.symbol} (${daysHeld} days)`
  );

  let creditsUsed = 0;

  // Use appropriate lookback window (max 90 days for practical purposes)
  const lookbackDays = Math.min(daysHeld + 7, 90); // Include 7 days after exit for context

  // Parallel research queries
  const [catalysts, analysts, sec, risks, allNews] = await Promise.all([
    queryCatalysts(trade.symbol, lookbackDays).then((r) => {
      creditsUsed += 6; // 3 queries × 2 credits
      return r;
    }),
    queryAnalystActivity(trade.symbol, lookbackDays).then((r) => {
      creditsUsed += 6;
      return r;
    }),
    querySECFilings(trade.symbol, lookbackDays).then((r) => {
      creditsUsed += 6;
      return r;
    }),
    queryOperationalRisks(trade.symbol, lookbackDays).then((r) => {
      creditsUsed += 8;
      return r;
    }),
    tavilySearch(`${trade.symbol} stock news`, {
      topic: "news",
      search_depth: "advanced",
      days: lookbackDays,
      max_results: 20,
    }).then((r) => {
      creditsUsed += 2;
      return r.results || [];
    }),
  ]);

  return {
    catalysts,
    analysts,
    sec,
    risks,
    allNews,
    creditsUsed,
  };
}

// ============================================================================
// Lifecycle Event Analysis
// ============================================================================

function analyzeLifecycleEvents(
  data: {
    catalysts: any[];
    analysts: any[];
    sec: any[];
    risks: any[];
    allNews: any[];
  },
  trade: ClosedTradeData,
  outcome: "win" | "loss"
): Array<{
  date: string;
  event_type: string;
  description: string;
  impact: "positive" | "negative" | "neutral";
}> {
  const events: Array<{
    date: string;
    event_type: string;
    description: string;
    impact: "positive" | "negative" | "neutral";
  }> = [];

  // Parse all events with dates
  const allItems = [
    ...data.catalysts.map((c) => ({ ...c, category: "CATALYST" })),
    ...data.analysts.map((a) => ({ ...a, category: "ANALYST" })),
    ...data.sec.map((s) => ({ ...s, category: "SEC_FILING" })),
    ...data.risks.map((r) => ({ ...r, category: "OPERATIONAL_RISK" })),
  ];

  // Filter and sort by date
  const datedEvents = allItems
    .filter((item) => item.publishedAt || item.published_at)
    .map((item) => {
      const date = item.publishedAt || item.published_at;
      const title = item.title || "Untitled";
      const snippet = item.snippet || "";

      // Determine impact based on keywords
      let impact: "positive" | "negative" | "neutral" = "neutral";

      const positiveKeywords = [
        "upgrade",
        "beat",
        "exceed",
        "strong",
        "growth",
        "raise",
        "positive",
      ];
      const negativeKeywords = [
        "downgrade",
        "miss",
        "weak",
        "decline",
        "cut",
        "lower",
        "negative",
        "lawsuit",
        "investigation",
      ];

      const text = (title + " " + snippet).toLowerCase();

      const hasPositive = positiveKeywords.some((kw) => text.includes(kw));
      const hasNegative = negativeKeywords.some((kw) => text.includes(kw));

      if (hasPositive && !hasNegative) impact = "positive";
      else if (hasNegative && !hasPositive) impact = "negative";

      return {
        date,
        event_type: item.category,
        description: `${title}: ${snippet.substring(0, 150)}`,
        impact,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Take top 10 most significant events
  return datedEvents.slice(0, 10);
}

// ============================================================================
// Lessons Learned Extraction
// ============================================================================

async function generateLessonsLearned(context: {
  trade: ClosedTradeData;
  outcome: "win" | "loss";
  daysHeld: number;
  lifecycleEvents: any[];
  lifecycleData: any;
}): Promise<{
  what_worked: string[];
  what_didnt_work: string[];
  key_insight: string;
}> {
  const whatWorked: string[] = [];
  const whatDidntWork: string[] = [];

  // Analyze based on outcome
  if (context.outcome === "win") {
    // What worked
    if (context.trade.ips_score && context.trade.ips_score >= 70) {
      whatWorked.push(`High IPS score (${context.trade.ips_score}%) correctly predicted favorable setup`);
    }

    const positiveEvents = context.lifecycleEvents.filter((e) => e.impact === "positive");
    if (positiveEvents.length > 0) {
      whatWorked.push(
        `Positive market sentiment during hold period (${positiveEvents.length} bullish events)`
      );
    }

    if (context.daysHeld <= 21) {
      whatWorked.push("Exited efficiently before theta decay accelerated");
    }

    const hasUpgrade = context.lifecycleData.analysts.some((a: any) =>
      ["upgrade", "raise"].some((kw) => (a.title || "").toLowerCase().includes(kw))
    );
    if (hasUpgrade) {
      whatWorked.push("Analyst upgrades validated bullish thesis");
    }

    // What could be improved
    if (context.daysHeld > 30) {
      whatDidntWork.push("Held longer than optimal - could have exited earlier with similar profit");
    }
  } else {
    // Loss - what didn't work
    if (context.trade.ips_score && context.trade.ips_score < 60) {
      whatDidntWork.push(`Low IPS score (${context.trade.ips_score}%) should have been a red flag`);
    }

    const negativeEvents = context.lifecycleEvents.filter((e) => e.impact === "negative");
    if (negativeEvents.length > 0) {
      whatDidntWork.push(
        `Negative events occurred during trade (${negativeEvents.length} bearish signals)`
      );
    }

    const hasDowngrade = context.lifecycleData.analysts.some((a: any) =>
      ["downgrade", "cut", "lower"].some((kw) => (a.title || "").toLowerCase().includes(kw))
    );
    if (hasDowngrade) {
      whatDidntWork.push("Analyst downgrades - should have exited when detected");
    }

    const hasEarnings = context.lifecycleData.catalysts.some((c: any) =>
      ["earnings", "report"].some((kw) => (c.title || "").toLowerCase().includes(kw))
    );
    if (hasEarnings) {
      whatDidntWork.push("Held through earnings - high risk event not properly managed");
    }

    // What worked (damage control)
    if (context.trade.realized_pnl > -(context.trade.credit_received || 100) * 0.5) {
      whatWorked.push("Limited loss to less than max risk - good exit discipline");
    }
  }

  // Generate key insight using AI
  const prompt = `Analyze this completed trade and provide ONE key insight (1-2 sentences).

Trade: ${context.trade.symbol} ${context.trade.strategy_type}
Outcome: ${context.outcome.toUpperCase()} ($${context.trade.realized_pnl}, ${context.trade.realized_pl_percent?.toFixed(1)}%)
Days Held: ${context.daysHeld}
IPS Score at Entry: ${context.trade.ips_score || "N/A"}%

What Worked:
${whatWorked.map((w) => `- ${w}`).join("\n") || "- Nothing notable"}

What Didn't Work:
${whatDidntWork.map((w) => `- ${w}`).join("\n") || "- Nothing notable"}

Key Events:
${context.lifecycleEvents.slice(0, 3).map((e) => `- [${e.impact.toUpperCase()}] ${e.description}`).join("\n")}

Provide ONE actionable insight for future trades. Be specific and data-driven.`;

  let keyInsight = "";
  try {
    keyInsight = await rationaleLLM(prompt);
  } catch (error) {
    keyInsight = `${context.outcome === "win" ? "Successful trade" : "Loss"} - review entry criteria and risk management for similar setups`;
  }

  return {
    what_worked: whatWorked.length > 0 ? whatWorked : ["Review needed"],
    what_didnt_work: whatDidntWork.length > 0 ? whatDidntWork : ["Review needed"],
    key_insight: keyInsight,
  };
}

// ============================================================================
// IPS Effectiveness Analysis
// ============================================================================

function analyzeIPSEffectiveness(
  trade: ClosedTradeData,
  outcome: "win" | "loss",
  lifecycleEvents: any[]
): {
  entry_ips_score: number | null;
  ips_factors_validated: string[];
  ips_factors_failed: string[];
} {
  const validated: string[] = [];
  const failed: string[] = [];

  // Check if IPS score predicted outcome correctly
  if (trade.ips_score != null) {
    if (trade.ips_score >= 70 && outcome === "win") {
      validated.push("High IPS score correctly predicted winning trade");
    } else if (trade.ips_score < 60 && outcome === "loss") {
      validated.push("Low IPS score correctly predicted challenging trade");
    } else if (trade.ips_score >= 70 && outcome === "loss") {
      failed.push("High IPS score failed to predict loss - review factor weightings");
    } else if (trade.ips_score < 60 && outcome === "win") {
      validated.push("Trade succeeded despite low IPS score - potential false negative");
    }
  }

  // Analyze specific factors (if we had detailed factor data, we'd check each)
  const hasNegativeNews = lifecycleEvents.some((e) => e.impact === "negative");
  if (hasNegativeNews && outcome === "loss") {
    failed.push("News sentiment factor - negative events correlated with loss");
  }

  const hasPositiveNews = lifecycleEvents.some((e) => e.impact === "positive");
  if (hasPositiveNews && outcome === "win") {
    validated.push("News sentiment factor - positive events correlated with win");
  }

  return {
    entry_ips_score: trade.ips_score,
    ips_factors_validated: validated.length > 0 ? validated : ["No specific factors identified"],
    ips_factors_failed: failed.length > 0 ? failed : ["No specific factors identified"],
  };
}

// ============================================================================
// AI Post-Mortem Generation
// ============================================================================

async function generateAIPostMortem(context: {
  trade: ClosedTradeData;
  outcome: "win" | "loss";
  daysHeld: number;
  lessonsLearned: any;
  ipsEffectiveness: any;
  lifecycleEvents: any[];
}): Promise<string> {
  const prompt = `You are a professional options trader conducting a post-mortem analysis. Write a comprehensive but concise summary (3-4 paragraphs).

**Trade Summary:**
- Symbol: ${context.trade.symbol}
- Strategy: ${context.trade.strategy_type}
- Outcome: ${context.outcome.toUpperCase()} - $${context.trade.realized_pnl} (${context.trade.realized_pl_percent?.toFixed(1)}%)
- Days Held: ${context.daysHeld}
- Entry IPS Score: ${context.trade.ips_score || "N/A"}%

**What Worked:**
${context.lessonsLearned.what_worked.map((w: string) => `- ${w}`).join("\n")}

**What Didn't Work:**
${context.lessonsLearned.what_didnt_work.map((w: string) => `- ${w}`).join("\n")}

**Key Insight:**
${context.lessonsLearned.key_insight}

**IPS Analysis:**
- Validated: ${context.ipsEffectiveness.ips_factors_validated.join(", ")}
- Failed: ${context.ipsEffectiveness.ips_factors_failed.join(", ")}

**Key Events During Trade:**
${context.lifecycleEvents.slice(0, 5).map((e) => `- [${e.event_type}] ${e.description.substring(0, 100)}`).join("\n")}

Write a professional post-mortem with:
1. Trade outcome context and key metrics
2. Analysis of what drove the result (market conditions, events, strategy execution)
3. Lessons for future similar trades
4. Actionable recommendations for IPS refinement (if applicable)

Be direct, data-driven, and actionable. This will be embedded in the knowledge base for future reference.`;

  try {
    const analysis = await rationaleLLM(prompt);
    return analysis;
  } catch (error) {
    console.error("[PostMortem] Failed to generate AI analysis:", error);
    return `Trade ${context.outcome} analysis: ${context.trade.symbol} ${context.trade.strategy_type} resulted in ${context.outcome === "win" ? "profit" : "loss"} of $${context.trade.realized_pnl} over ${context.daysHeld} days. ${context.lessonsLearned.key_insight}`;
  }
}

// ============================================================================
// RAG Embedding
// ============================================================================

async function embedPostMortemToRAG(
  trade: ClosedTradeData,
  postMortem: TradePostMortem
): Promise<void> {
  try {
    // Build enriched context for embedding
    const enrichedTrade = {
      ...trade,
      post_mortem_analysis: postMortem.ai_analysis,
      lessons_learned: postMortem.lessons_learned,
      key_events: postMortem.trade_lifecycle.during_trade_events,
    };

    await embedTradeOutcome(enrichedTrade);
    console.log(`[PostMortem] Successfully embedded to RAG`);
  } catch (error) {
    console.error("[PostMortem] Failed to embed to RAG:", error);
  }
}

// ============================================================================
// Storage
// ============================================================================

async function storePostMortem(
  tradeId: string,
  postMortem: TradePostMortem
): Promise<void> {
  const { error } = await supabase.from("trade_postmortems").insert({
    trade_id: tradeId,
    post_mortem_data: postMortem,
    created_at: postMortem.created_at,
  });

  if (error) {
    console.error("[PostMortem] Failed to store post-mortem:", error);
    throw error;
  }

  console.log(`[PostMortem] Stored post-mortem for trade ${tradeId}`);
}

/**
 * Retrieve post-mortem for a trade
 */
export async function getTradePostMortem(
  tradeId: string
): Promise<TradePostMortem | null> {
  const { data, error } = await supabase
    .from("trade_postmortems")
    .select("*")
    .eq("trade_id", tradeId)
    .single();

  if (error || !data) return null;

  return data.post_mortem_data as TradePostMortem;
}
