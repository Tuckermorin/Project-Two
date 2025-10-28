/**
 * AI Backtest Analyzer
 *
 * Analyzes backtest results and generates actionable optimization suggestions
 * Uses your configured LLM (Ollama gpt-oss) to identify patterns and recommend IPS improvements
 */

import { ChatOllama } from "@langchain/ollama";
import { createClient } from "@/lib/supabase/server-client";

const normalizeBaseUrl = (raw?: string | null): string => {
  const fallback = "http://golem:11434";
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const url = new URL(trimmed);
    if (url.pathname && url.pathname !== "/") {
      url.pathname = "/";
    }
    url.search = "";
    url.hash = "";
    const base = url.origin + (url.pathname === "/" ? "" : url.pathname);
    return base.replace(/\/$/, "");
  } catch (error) {
    return trimmed.replace(/\/api\/chat$/i, "").replace(/\/$/, "") || fallback;
  }
};

const ollamaBaseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST);

const llm = new ChatOllama({
  model: "gpt-oss:20b",
  temperature: 0.3,
  baseUrl: ollamaBaseUrl,
  numCtx: 32768,
});

export interface OptimizationSuggestion {
  category: "factor_adjustment" | "exit_strategy" | "entry_criteria" | "sentiment_timing" | "symbol_selection";
  priority: "high" | "medium" | "low";
  title: string;
  finding: string; // What the AI discovered
  suggestion: string; // What to change
  expectedImpact: string; // Estimated improvement
  currentValue?: any;
  suggestedValue?: any;
  supportingData: {
    sampleSize: number;
    currentWinRate?: number;
    projectedWinRate?: number;
    currentAvgRoi?: number;
    projectedAvgRoi?: number;
  };
}

export interface BacktestAnalysis {
  summary: string;
  overallAssessment: "excellent" | "good" | "fair" | "needs_improvement";
  strengths: string[];
  weaknesses: string[];
  optimizations: OptimizationSuggestion[];
  riskWarnings: string[];
  marketRegimeInsights?: string;
  sentimentInsights?: string;
}

/**
 * Analyze backtest results with AI
 */
export async function analyzeBacktestWithAI(runId: string): Promise<BacktestAnalysis> {
  const supabase = await createClient();

  // Fetch comprehensive backtest data
  const { data: run } = await supabase
    .from("ips_backtest_runs")
    .select("*")
    .eq("id", runId)
    .single();

  const { data: results } = await supabase
    .from("ips_backtest_results")
    .select("*")
    .eq("run_id", runId)
    .single();

  const { data: tradeMatches } = await supabase
    .from("ips_backtest_trade_matches")
    .select("*")
    .eq("run_id", runId)
    .order("realized_roi", { ascending: false });

  if (!run || !results || !tradeMatches) {
    throw new Error("Backtest data not found");
  }

  // Prepare context for AI
  const context = buildAnalysisContext(run, results, tradeMatches);

  // Call Claude for analysis
  const analysis = await callClaudeForAnalysis(context);

  return analysis;
}

/**
 * Build rich context from backtest data for AI analysis
 */
function buildAnalysisContext(run: any, results: any, trades: any[]): string {
  const ipsConfig = run.ips_config;

  // Factor analysis
  const factorsList = ipsConfig.factors?.map((f: any) => {
    return `- ${f.name} (${f.key}): target ${JSON.stringify(f.target)}, weight ${f.weight}`;
  }).join("\n") || "No factors defined";

  // Exit strategies (stored as object with loss/time/profit keys)
  const exitStrategies = ipsConfig.exit_strategies || {};
  const exitList = Object.entries(exitStrategies)
    .map(([key, value]: [string, any]) => {
      if (!value || !value.enabled) return null;
      return `- ${key}: ${value.description || JSON.stringify(value)}`;
    })
    .filter(Boolean)
    .join("\n") || "No exit strategies defined";

  // Top winners analysis
  const topWinners = trades
    .filter(t => t.realized_roi > 0)
    .slice(0, 20)
    .map(t => ({
      symbol: t.factor_scores?.symbol || "unknown",
      delta: t.factor_scores?.delta?.value,
      iv: t.factor_scores?.implied_volatility?.value,
      dte: t.factor_scores?.dte?.value,
      sentiment: t.sentiment_at_entry,
      roi: t.realized_roi,
      daysHeld: t.days_held,
    }));

  // Top losers analysis
  const topLosers = trades
    .filter(t => t.realized_roi < 0)
    .slice(-20)
    .map(t => ({
      symbol: t.factor_scores?.symbol || "unknown",
      delta: t.factor_scores?.delta?.value,
      iv: t.factor_scores?.implied_volatility?.value,
      dte: t.factor_scores?.dte?.value,
      sentiment: t.sentiment_at_entry,
      roi: t.realized_roi,
      daysHeld: t.days_held,
    }));

  // Strategy performance breakdown
  const strategyPerf = results.strategy_performance || {};
  const strategyAnalysis = Object.entries(strategyPerf).map(([strat, perf]: [string, any]) => {
    return `${strat}: ${perf.total} trades, ${perf.winRate?.toFixed(1)}% win rate, ${perf.avgRoi?.toFixed(1)}% avg ROI`;
  }).join("\n");

  // Symbol performance breakdown
  const symbolPerf = results.symbol_performance || {};
  const symbolAnalysis = Object.entries(symbolPerf).map(([sym, perf]: [string, any]) => {
    return `${sym}: ${perf.total} trades, ${perf.winRate?.toFixed(1)}% win rate, ${perf.avgRoi?.toFixed(1)}% avg ROI`;
  }).join("\n");

  // Sentiment correlation
  const sentimentCorr = results.sentiment_correlation || {};
  const sentimentAnalysis = run.include_sentiment
    ? `
Sentiment Analysis:
- Bullish Sentiment Win Rate: ${sentimentCorr.bullish_win_rate?.toFixed(1) || "N/A"}%
- Neutral Sentiment Win Rate: ${sentimentCorr.neutral_win_rate?.toFixed(1) || "N/A"}%
- Bearish Sentiment Win Rate: ${sentimentCorr.bearish_win_rate?.toFixed(1) || "N/A"}%

ROI by Sentiment:
${sentimentCorr.avg_roi_by_sentiment ? JSON.stringify(sentimentCorr.avg_roi_by_sentiment, null, 2) : "N/A"}

Optimal Sentiment Range:
${results.optimal_sentiment_range ? JSON.stringify(results.optimal_sentiment_range, null, 2) : "N/A"}
`
    : "Sentiment analysis was not included in this backtest.";

  return `
# IPS Backtest Analysis Request

## IPS Configuration
Name: ${run.ips_name}
Period Tested: ${run.start_date} to ${run.end_date} (${run.total_days} days)
Symbols: ${run.symbols?.join(", ") || "All available"}

### Factors:
${factorsList}

### Exit Strategies:
${exitList}

### Strategy Filters:
${ipsConfig.strategies?.join(", ") || "All strategies allowed"}

DTE Range: ${ipsConfig.min_dte} - ${ipsConfig.max_dte} days

## Performance Results

### Overall Metrics:
- Total Trades: ${results.total_trades}
- Win Rate: ${results.win_rate?.toFixed(2)}%
- Average ROI: ${results.avg_roi?.toFixed(2)}%
- Median ROI: ${results.median_roi?.toFixed(2)}%
- Sharpe Ratio: ${results.sharpe_ratio?.toFixed(2) || "N/A"}
- Sortino Ratio: ${results.sortino_ratio?.toFixed(2) || "N/A"}
- Max Drawdown: ${results.max_drawdown || "N/A"}
- Profit Factor: ${results.profit_factor?.toFixed(2) || "N/A"}

### Consistency:
- Max Win Streak: ${results.win_streak_max || "N/A"}
- Max Loss Streak: ${results.loss_streak_max || "N/A"}
- Avg Days Held: ${results.avg_days_held?.toFixed(1) || "N/A"}

### Strategy Performance:
${strategyAnalysis || "N/A"}

### Symbol Performance:
${symbolAnalysis || "N/A"}

${sentimentAnalysis}

## Top 20 Winning Trades:
${JSON.stringify(topWinners, null, 2)}

## Top 20 Losing Trades:
${JSON.stringify(topLosers, null, 2)}

## Factor Importance:
${results.factor_importance ? JSON.stringify(results.factor_importance, null, 2) : "N/A"}

## Factor Correlation:
${results.factor_correlation ? JSON.stringify(results.factor_correlation, null, 2) : "N/A"}

---

Please analyze this backtest data and provide:

1. **Overall Assessment**: Is this IPS configuration excellent, good, fair, or needs improvement?

2. **Key Strengths**: What's working well? (2-3 bullet points)

3. **Key Weaknesses**: What's underperforming? (2-3 bullet points)

4. **Optimization Suggestions**: Specific, actionable changes to improve performance. For each suggestion:
   - Category (factor_adjustment, exit_strategy, entry_criteria, sentiment_timing, or symbol_selection)
   - Priority (high, medium, low)
   - Title (brief description)
   - Finding (what pattern you discovered in the data)
   - Suggestion (specific change to make)
   - Expected Impact (estimated improvement)
   - Current vs Suggested values
   - Supporting data (sample size, win rates, ROIs)

   Examples of good suggestions:
   - "Exit strategy: Change profit target from 50% to 40% (40% exits showed 100% win rate in 45 trades)"
   - "Delta range: Narrow to 0.28-0.32 (this range had 78% win rate vs 65% overall)"
   - "Sentiment timing: Only enter during neutral sentiment (72% win rate vs 58% during bullish)"
   - "Symbol filtering: Avoid TSLA with this IPS (only 48% win rate vs 70% on NVDA)"

5. **Risk Warnings**: Any concerning patterns (e.g., small sample size, high drawdown, strategy overfitting)

6. **Market Regime Insights**: How did the IPS perform across different market conditions in this period?

Format your response as a structured JSON object with keys: summary, overallAssessment, strengths, weaknesses, optimizations (array), riskWarnings, marketRegimeInsights, sentimentInsights.
`.trim();
}

/**
 * Call LLM to analyze backtest
 */
async function callClaudeForAnalysis(context: string): Promise<BacktestAnalysis> {
  const messages = [
    {
      role: "system" as const,
      content: "You are an expert options trading analyst. Analyze backtest results and provide actionable optimization suggestions. Output ONLY valid JSON in the exact format requested - no markdown formatting, no code blocks, no preamble.",
    },
    {
      role: "user" as const,
      content: context,
    },
  ];

  const response = await llm.invoke(messages);
  const responseText = response.content?.toString().trim() ?? "";

  // Extract JSON from response (AI might wrap it in markdown)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response");
  }

  const analysis: BacktestAnalysis = JSON.parse(jsonMatch[0]);

  return analysis;
}

/**
 * Generate human-readable summary of AI analysis
 */
export function formatAnalysisForUser(analysis: BacktestAnalysis): string {
  const { summary, overallAssessment, strengths, weaknesses, optimizations } = analysis;

  let output = `## AI Analysis Summary\n\n`;
  output += `**Overall Assessment:** ${overallAssessment.toUpperCase()}\n\n`;
  output += `${summary}\n\n`;

  if (strengths.length > 0) {
    output += `### ✅ Strengths\n`;
    strengths.forEach(s => output += `- ${s}\n`);
    output += `\n`;
  }

  if (weaknesses.length > 0) {
    output += `### ⚠️ Weaknesses\n`;
    weaknesses.forEach(w => output += `- ${w}\n`);
    output += `\n`;
  }

  if (optimizations.length > 0) {
    output += `### 💡 Optimization Suggestions\n\n`;

    const highPriority = optimizations.filter(o => o.priority === "high");
    const mediumPriority = optimizations.filter(o => o.priority === "medium");
    const lowPriority = optimizations.filter(o => o.priority === "low");

    if (highPriority.length > 0) {
      output += `**High Priority:**\n`;
      highPriority.forEach(opt => {
        output += `\n**${opt.title}**\n`;
        output += `- Finding: ${opt.finding}\n`;
        output += `- Suggestion: ${opt.suggestion}\n`;
        output += `- Expected Impact: ${opt.expectedImpact}\n`;
        if (opt.currentValue && opt.suggestedValue) {
          output += `- Change: ${JSON.stringify(opt.currentValue)} → ${JSON.stringify(opt.suggestedValue)}\n`;
        }
      });
    }

    if (mediumPriority.length > 0) {
      output += `\n**Medium Priority:**\n`;
      mediumPriority.forEach(opt => {
        output += `\n**${opt.title}**\n`;
        output += `- ${opt.finding}\n`;
        output += `- ${opt.suggestion}\n`;
      });
    }

    if (lowPriority.length > 0) {
      output += `\n**Low Priority:**\n`;
      lowPriority.forEach(opt => {
        output += `- ${opt.title}: ${opt.suggestion}\n`;
      });
    }
  }

  return output;
}
