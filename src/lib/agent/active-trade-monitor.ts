// Active Trade Monitoring System
// Provides real-time context and risk alerts for open positions using deep Tavily research

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

export interface TradeMonitorResult {
  trade_id: string;
  symbol: string;
  status: string;
  days_held: number;
  current_context: {
    catalysts: any[];
    analyst_activity: any[];
    sec_filings: any[];
    operational_risks: any[];
    news_summary: string;
  };
  risk_alerts: {
    level: "low" | "medium" | "high" | "critical";
    alerts: Array<{
      type: string;
      severity: "low" | "medium" | "high" | "critical";
      message: string;
      detected_at: string;
    }>;
  };
  recommendations: string[];
  ai_summary: string;
  credits_used: number;
  cached_results: number;
}

export interface ActiveTradeData {
  id: string;
  symbol: string;
  strategy_type: string;
  entry_date: string;
  expiration_date: string;
  current_price: number | null;
  short_strike: number | null;
  long_strike: number | null;
  credit_received: number | null;
  ips_score: number | null;
  status: string;
}

// ============================================================================
// Core Monitoring Function
// ============================================================================

/**
 * Monitor an active trade with deep Tavily research
 * Returns comprehensive context and risk alerts
 */
export async function monitorActiveTrade(
  tradeId: string,
  options: {
    daysBack?: number;
    useCache?: boolean;
    forceRefresh?: boolean;
  } = {}
): Promise<TradeMonitorResult> {
  const { daysBack = 7, useCache = true, forceRefresh = false } = options;

  console.log(`[ActiveMonitor] Starting deep analysis for trade ${tradeId}`);

  // Fetch trade data
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .eq("status", "active")
    .single();

  if (tradeError || !trade) {
    throw new Error(`Trade ${tradeId} not found or not active`);
  }

  const typedTrade = trade as ActiveTradeData;

  // Check if we should skip (already monitored recently and no force refresh)
  if (useCache && !forceRefresh) {
    const recentMonitor = await getRecentMonitorData(tradeId);
    if (recentMonitor && isMonitorFresh(recentMonitor, 12)) {
      // Within 12 hours
      console.log(`[ActiveMonitor] Using cached monitor data (${recentMonitor.hours_old}h old)`);
      return recentMonitor.data;
    }
  }

  // Calculate days held
  const entryDate = new Date(typedTrade.entry_date);
  const today = new Date();
  const daysHeld = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

  let creditsUsed = 0;
  let cachedResults = 0;

  // Parallel deep research queries
  console.log(`[ActiveMonitor] Fetching context for ${typedTrade.symbol} (${daysBack}d lookback)`);

  const [catalysts, analysts, sec, risks, generalNews] = await Promise.all([
    queryCatalysts(typedTrade.symbol, daysBack).then((r) => {
      creditsUsed += 6; // 3 queries × 2 credits (advanced)
      return r;
    }),
    queryAnalystActivity(typedTrade.symbol, daysBack).then((r) => {
      creditsUsed += 6; // 3 queries × 2 credits
      return r;
    }),
    querySECFilings(typedTrade.symbol, 30).then((r) => {
      creditsUsed += 6; // 3 queries × 2 credits
      return r;
    }),
    queryOperationalRisks(typedTrade.symbol, daysBack).then((r) => {
      creditsUsed += 8; // 4 queries × 2 credits
      return r;
    }),
    tavilySearch(`${typedTrade.symbol} stock news last ${daysBack} days`, {
      topic: "news",
      search_depth: "advanced",
      days: daysBack,
      max_results: 15,
    }).then((r) => {
      creditsUsed += 2;
      return r.results || [];
    }),
  ]);

  console.log(`[ActiveMonitor] Research complete. Credits used: ${creditsUsed}`);

  // Analyze results and generate risk alerts
  const riskAlerts = analyzeRiskSignals({
    catalysts,
    analysts,
    sec,
    risks,
    generalNews,
    trade: typedTrade,
    daysHeld,
  });

  // Generate recommendations
  const recommendations = generateRecommendations({
    riskAlerts,
    trade: typedTrade,
    daysHeld,
    catalysts,
    analysts,
  });

  // Build news summary
  const newsSummary = summarizeNews(generalNews, catalysts, analysts);

  // Generate AI-powered summary
  const aiSummary = await generateAISummary({
    trade: typedTrade,
    daysHeld,
    riskAlerts,
    newsSummary,
    catalysts,
    analysts,
  });

  const result: TradeMonitorResult = {
    trade_id: tradeId,
    symbol: typedTrade.symbol,
    status: typedTrade.status,
    days_held: daysHeld,
    current_context: {
      catalysts,
      analyst_activity: analysts,
      sec_filings: sec,
      operational_risks: risks,
      news_summary: newsSummary,
    },
    risk_alerts: riskAlerts,
    recommendations,
    ai_summary: aiSummary,
    credits_used: creditsUsed,
    cached_results: cachedResults,
  };

  // Store monitoring result for caching
  await storeMonitorData(tradeId, result);

  return result;
}

// ============================================================================
// Risk Analysis
// ============================================================================

function analyzeRiskSignals(context: {
  catalysts: any[];
  analysts: any[];
  sec: any[];
  risks: any[];
  generalNews: any[];
  trade: ActiveTradeData;
  daysHeld: number;
}): {
  level: "low" | "medium" | "high" | "critical";
  alerts: Array<{
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    detected_at: string;
  }>;
} {
  const alerts: Array<{
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    detected_at: string;
  }> = [];

  const now = new Date().toISOString();

  // Check for upcoming earnings (critical risk)
  const earningsKeywords = ["earnings", "guidance", "report", "quarterly results"];
  const hasEarnings = context.catalysts.some((c) =>
    earningsKeywords.some((kw) => (c.snippet || c.title || "").toLowerCase().includes(kw))
  );

  if (hasEarnings) {
    alerts.push({
      type: "EARNINGS_RISK",
      severity: "critical",
      message: `Earnings event detected for ${context.trade.symbol} - high volatility expected`,
      detected_at: now,
    });
  }

  // Check for analyst downgrades (high risk)
  const downgradeKeywords = ["downgrade", "lower", "cut", "reduce"];
  const hasDowngrade = context.analysts.some((a) =>
    downgradeKeywords.some((kw) => (a.snippet || a.title || "").toLowerCase().includes(kw))
  );

  if (hasDowngrade) {
    alerts.push({
      type: "ANALYST_DOWNGRADE",
      severity: "high",
      message: `Analyst downgrade detected for ${context.trade.symbol}`,
      detected_at: now,
    });
  }

  // Check for operational risks (medium-high risk)
  const riskKeywords = ["lawsuit", "investigation", "recall", "disruption", "shortage"];
  const operationalRisk = context.risks.some((r) =>
    riskKeywords.some((kw) => (r.snippet || r.title || "").toLowerCase().includes(kw))
  );

  if (operationalRisk) {
    alerts.push({
      type: "OPERATIONAL_RISK",
      severity: "high",
      message: `Operational risk event detected (supply chain, legal, or competitive threat)`,
      detected_at: now,
    });
  }

  // Check for high news volume (medium risk - unusual activity)
  if (context.generalNews.length > 10) {
    alerts.push({
      type: "HIGH_NEWS_VOLUME",
      severity: "medium",
      message: `Unusually high news volume (${context.generalNews.length} articles in ${context.daysHeld} days)`,
      detected_at: now,
    });
  }

  // Check days to expiration (if approaching)
  if (context.trade.expiration_date) {
    const expiryDate = new Date(context.trade.expiration_date);
    const daysToExpiry = Math.floor(
      (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysToExpiry <= 7) {
      alerts.push({
        type: "EXPIRATION_APPROACHING",
        severity: daysToExpiry <= 3 ? "high" : "medium",
        message: `Option expiration in ${daysToExpiry} days`,
        detected_at: now,
      });
    }
  }

  // Check if price is approaching strikes
  if (context.trade.current_price && context.trade.short_strike) {
    const percentToShort =
      ((context.trade.short_strike - context.trade.current_price) / context.trade.current_price) *
      100;

    if (percentToShort < 5) {
      alerts.push({
        type: "PRICE_NEAR_SHORT_STRIKE",
        severity: percentToShort < 2 ? "critical" : "high",
        message: `Price within ${percentToShort.toFixed(1)}% of short strike ($${context.trade.short_strike})`,
        detected_at: now,
      });
    }
  }

  // Determine overall risk level
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const mediumCount = alerts.filter((a) => a.severity === "medium").length;

  let level: "low" | "medium" | "high" | "critical" = "low";
  if (criticalCount > 0) level = "critical";
  else if (highCount >= 2) level = "critical";
  else if (highCount >= 1) level = "high";
  else if (mediumCount >= 2) level = "high";
  else if (mediumCount >= 1) level = "medium";

  return { level, alerts };
}

// ============================================================================
// Recommendations
// ============================================================================

function generateRecommendations(context: {
  riskAlerts: { level: string; alerts: any[] };
  trade: ActiveTradeData;
  daysHeld: number;
  catalysts: any[];
  analysts: any[];
}): string[] {
  const recommendations: string[] = [];

  // Risk-based recommendations
  if (context.riskAlerts.level === "critical") {
    recommendations.push(
      "⚠️ CRITICAL: Consider closing position or rolling to different strikes"
    );
    recommendations.push("Monitor price action closely - set alerts on brokerage platform");
  } else if (context.riskAlerts.level === "high") {
    recommendations.push("⚠️ HIGH RISK: Review exit criteria and adjust stops if needed");
    recommendations.push("Consider taking profits early if trade is profitable");
  }

  // Earnings-specific
  const hasEarnings = context.riskAlerts.alerts.some((a) => a.type === "EARNINGS_RISK");
  if (hasEarnings) {
    recommendations.push(
      "📊 Close before earnings or roll position to post-earnings expiration"
    );
  }

  // Strike proximity
  const nearStrike = context.riskAlerts.alerts.some((a) => a.type === "PRICE_NEAR_SHORT_STRIKE");
  if (nearStrike) {
    recommendations.push(
      "📍 Price approaching short strike - consider rolling or closing to avoid assignment"
    );
  }

  // Time-based
  if (context.daysHeld >= 21) {
    recommendations.push(
      "⏰ Trade held for 21+ days - consider taking profits if target achieved (50%+ of max profit)"
    );
  }

  // Analyst activity
  const hasUpgrade = context.analysts.some((a) =>
    ["upgrade", "raise", "increase"].some((kw) => (a.snippet || a.title || "").toLowerCase().includes(kw))
  );

  if (hasUpgrade && context.trade.strategy_type === "put-credit-spreads") {
    recommendations.push("📈 Positive analyst activity - bullish signal supports put credit spreads");
  }

  // Default if all quiet
  if (recommendations.length === 0) {
    recommendations.push("✅ No significant risks detected - monitor regularly");
    recommendations.push("Continue managing according to IPS exit criteria");
  }

  return recommendations;
}

// ============================================================================
// News Summarization
// ============================================================================

function summarizeNews(
  generalNews: any[],
  catalysts: any[],
  analysts: any[]
): string {
  const allNews = [...generalNews, ...catalysts, ...analysts];

  if (allNews.length === 0) {
    return "No significant news found in the monitoring period.";
  }

  // Deduplicate by URL
  const uniqueNews = Array.from(new Map(allNews.map((n) => [n.url, n])).values());

  // Sort by score/date and take top 5
  const topNews = uniqueNews
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);

  return topNews
    .map((n) => {
      const title = n.title || "Untitled";
      const snippet = n.snippet || "";
      const date = n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : "Recent";
      return `• ${title} (${date}): ${snippet.substring(0, 150)}...`;
    })
    .join("\n");
}

// ============================================================================
// AI Summary Generation
// ============================================================================

async function generateAISummary(context: {
  trade: ActiveTradeData;
  daysHeld: number;
  riskAlerts: { level: string; alerts: any[] };
  newsSummary: string;
  catalysts: any[];
  analysts: any[];
}): Promise<string> {
  const prompt = `You are a professional options trader analyzing an active trade. Provide a concise, data-driven summary.

**Trade Details:**
- Symbol: ${context.trade.symbol}
- Strategy: ${context.trade.strategy_type}
- Days Held: ${context.daysHeld}
- Entry IPS Score: ${context.trade.ips_score || "N/A"}%
- Current Risk Level: ${context.riskAlerts.level.toUpperCase()}

**Risk Alerts (${context.riskAlerts.alerts.length}):**
${context.riskAlerts.alerts.map((a) => `- [${a.severity.toUpperCase()}] ${a.message}`).join("\n")}

**Recent News Context:**
${context.newsSummary}

**Analyst Activity:**
${context.analysts.length} analyst-related articles found

**Your Task:**
Write a 2-3 sentence professional summary of this trade's current status. Include:
1. Overall trade health (good standing, caution, or exit consideration)
2. Key risk factor (if any)
3. Suggested action (hold, monitor closely, or consider exit)

Be direct and actionable. Focus on what matters for trade management.`;

  try {
    const summary = await rationaleLLM(prompt);
    return summary;
  } catch (error) {
    console.error("[ActiveMonitor] Failed to generate AI summary:", error);
    return `Trade held for ${context.daysHeld} days with ${context.riskAlerts.level} risk level. ${context.riskAlerts.alerts.length} alerts detected. Review monitoring data for details.`;
  }
}

// ============================================================================
// Caching & Storage
// ============================================================================

async function getRecentMonitorData(
  tradeId: string
): Promise<{ data: TradeMonitorResult; hours_old: number } | null> {
  const { data, error } = await supabase
    .from("trade_monitor_cache")
    .select("*")
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  const hoursOld = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60);

  return {
    data: data.monitor_data as TradeMonitorResult,
    hours_old: hoursOld,
  };
}

function isMonitorFresh(monitor: { hours_old: number }, maxHours: number): boolean {
  return monitor.hours_old < maxHours;
}

async function storeMonitorData(tradeId: string, result: TradeMonitorResult): Promise<void> {
  const { error } = await supabase.from("trade_monitor_cache").insert({
    trade_id: tradeId,
    monitor_data: result,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[ActiveMonitor] Failed to cache monitor data:", error);
  } else {
    console.log(`[ActiveMonitor] Cached monitor data for trade ${tradeId}`);
  }
}

// ============================================================================
// Batch Monitoring
// ============================================================================

/**
 * Monitor all active trades for a user
 * Returns summary of all positions
 */
export async function monitorAllActiveTrades(
  userId: string,
  options: { daysBack?: number; useCache?: boolean } = {}
): Promise<{
  total_trades: number;
  monitored: number;
  risk_summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  total_credits_used: number;
  results: TradeMonitorResult[];
}> {
  console.log(`[ActiveMonitor] Monitoring all active trades for user ${userId}`);

  // Fetch all active trades
  const { data: trades, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to fetch active trades: ${error.message}`);
  }

  if (!trades || trades.length === 0) {
    console.log("[ActiveMonitor] No active trades to monitor");
    return {
      total_trades: 0,
      monitored: 0,
      risk_summary: { critical: 0, high: 0, medium: 0, low: 0 },
      total_credits_used: 0,
      results: [],
    };
  }

  console.log(`[ActiveMonitor] Found ${trades.length} active trades`);

  // Monitor each trade
  const results: TradeMonitorResult[] = [];
  let totalCredits = 0;

  for (const trade of trades) {
    try {
      const result = await monitorActiveTrade(trade.id, options);
      results.push(result);
      totalCredits += result.credits_used;
    } catch (error: any) {
      console.error(`[ActiveMonitor] Failed to monitor trade ${trade.id}:`, error.message);
    }
  }

  // Calculate risk summary
  const riskSummary = {
    critical: results.filter((r) => r.risk_alerts.level === "critical").length,
    high: results.filter((r) => r.risk_alerts.level === "high").length,
    medium: results.filter((r) => r.risk_alerts.level === "medium").length,
    low: results.filter((r) => r.risk_alerts.level === "low").length,
  };

  console.log(`[ActiveMonitor] Monitoring complete. Total credits: ${totalCredits}`);
  console.log(`[ActiveMonitor] Risk summary:`, riskSummary);

  return {
    total_trades: trades.length,
    monitored: results.length,
    risk_summary: riskSummary,
    total_credits_used: totalCredits,
    results,
  };
}
