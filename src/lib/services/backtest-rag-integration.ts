/**
 * Backtest RAG Integration
 *
 * Generates embeddings from backtest results and feeds them into the RAG system
 * This allows the AI to learn from historical patterns and reference backtests
 * in future trade recommendations
 */

import { createClient } from "@/lib/supabase/server-client";
import { generateEmbedding } from "@/lib/agent/rag-embeddings";

export interface BacktestLesson {
  runId: string;
  ipsId: string;
  ipsName: string;
  lessonType:
    | "winning_pattern"
    | "losing_pattern"
    | "factor_insight"
    | "sentiment_insight"
    | "strategy_performance";
  description: string;
  context: string; // Full text for embedding
  metrics: Record<string, any>;
  confidence: number; // 0-1, based on sample size
}

/**
 * Generate RAG lessons from a completed backtest
 */
export async function generateBacktestLessons(
  runId: string
): Promise<BacktestLesson[]> {
  const supabase = await createClient();
  const lessons: BacktestLesson[] = [];

  // Fetch backtest run and results
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

  if (!run || !results) {
    throw new Error(`Backtest run ${runId} not found`);
  }

  // Lesson 1: Overall IPS Performance
  if (results.total_trades >= 30) {
    // Minimum sample size
    const confidence = Math.min(
      1.0,
      results.total_trades / 100
    ); // More trades = higher confidence

    lessons.push({
      runId,
      ipsId: run.ips_id,
      ipsName: run.ips_name,
      lessonType: "winning_pattern",
      description: `IPS "${run.ips_name}" achieved ${results.win_rate.toFixed(1)}% win rate with ${results.avg_roi.toFixed(1)}% average ROI`,
      context: `
Historical backtest of IPS configuration "${run.ips_name}" from ${run.start_date} to ${run.end_date}:

Performance Summary:
- Total Trades: ${results.total_trades}
- Win Rate: ${results.win_rate.toFixed(1)}%
- Average ROI: ${results.avg_roi.toFixed(1)}%
- Sharpe Ratio: ${results.sharpe_ratio?.toFixed(2) || "N/A"}
- Max Drawdown: ${results.max_drawdown || "N/A"}
- Profit Factor: ${results.profit_factor?.toFixed(2) || "N/A"}

This IPS configuration has been validated against ${results.total_trades} historical trades across ${run.symbols?.length || "multiple"} symbols.
The results show ${results.win_rate >= 65 ? "strong" : results.win_rate >= 55 ? "moderate" : "weak"} predictive power.

Date Range: ${run.start_date} to ${run.end_date}
Symbols Tested: ${run.symbols?.join(", ") || "All available"}
      `.trim(),
      metrics: {
        winRate: results.win_rate,
        avgRoi: results.avg_roi,
        totalTrades: results.total_trades,
        sharpeRatio: results.sharpe_ratio,
        profitFactor: results.profit_factor,
      },
      confidence,
    });
  }

  // Lesson 2: Factor Insights
  if (results.factor_importance) {
    const topFactors = Object.entries(results.factor_importance as Record<string, any>)
      .sort((a, b) => (b[1].importance || 0) - (a[1].importance || 0))
      .slice(0, 3);

    if (topFactors.length > 0) {
      lessons.push({
        runId,
        ipsId: run.ips_id,
        ipsName: run.ips_name,
        lessonType: "factor_insight",
        description: `Most important factors for IPS "${run.ips_name}": ${topFactors.map(([name]) => name).join(", ")}`,
        context: `
Factor Analysis for IPS "${run.ips_name}":

Top Contributing Factors:
${topFactors
  .map(
    ([name, data]: [string, any], i) =>
      `${i + 1}. ${name}: ${(data.importance * 100).toFixed(1)}% importance
   - Correlation with wins: ${data.correlation || "N/A"}
   - Optimal range: ${JSON.stringify(data.optimal_range || {})}`
  )
  .join("\n")}

These factors showed the strongest correlation with winning trades in backtesting.
Consider weighting these factors more heavily in trade evaluation.

Backtest Period: ${run.start_date} to ${run.end_date}
Sample Size: ${results.total_trades} trades
        `.trim(),
        metrics: {
          topFactors: Object.fromEntries(topFactors),
        },
        confidence: 0.8,
      });
    }
  }

  // Lesson 3: Sentiment Insights
  if (run.include_sentiment && results.sentiment_correlation) {
    const sentCorr = results.sentiment_correlation as any;

    lessons.push({
      runId,
      ipsId: run.ips_id,
      ipsName: run.ips_name,
      lessonType: "sentiment_insight",
      description: `Sentiment analysis for IPS "${run.ips_name}" shows best performance during ${sentCorr.best_sentiment || "neutral"} sentiment`,
      context: `
Sentiment Analysis for IPS "${run.ips_name}":

Win Rate by Sentiment:
- Bullish Sentiment: ${sentCorr.bullish_win_rate?.toFixed(1) || "N/A"}%
- Neutral Sentiment: ${sentCorr.neutral_win_rate?.toFixed(1) || "N/A"}%
- Bearish Sentiment: ${sentCorr.bearish_win_rate?.toFixed(1) || "N/A"}%

Average ROI by Sentiment:
${sentCorr.avg_roi_by_sentiment
  ? Object.entries(sentCorr.avg_roi_by_sentiment)
      .map(([bucket, roi]) => `- ${bucket}: ${(roi as number).toFixed(1)}%`)
      .join("\n")
  : "N/A"}

${
  results.optimal_sentiment_range
    ? `Optimal Sentiment Range: ${JSON.stringify(results.optimal_sentiment_range)}`
    : ""
}

This suggests that market sentiment is a ${sentCorr.bullish_win_rate > sentCorr.bearish_win_rate + 10 ? "significant" : "moderate"} factor in trade outcomes.

Backtest Period: ${run.start_date} to ${run.end_date}
Sentiment Data Points: ${run.sentiment_fetched || 0}
      `.trim(),
      metrics: sentCorr,
      confidence: run.sentiment_fetched >= 50 ? 0.85 : 0.6,
    });
  }

  // Lesson 4: Strategy-Specific Performance
  if (results.strategy_performance) {
    const stratPerf = results.strategy_performance as Record<string, any>;

    for (const [strategy, perf] of Object.entries(stratPerf)) {
      if (perf.total >= 10) {
        // Minimum sample size
        lessons.push({
          runId,
          ipsId: run.ips_id,
          ipsName: run.ips_name,
          lessonType: "strategy_performance",
          description: `${strategy} strategy with IPS "${run.ips_name}" achieved ${perf.winRate.toFixed(1)}% win rate`,
          context: `
Strategy Performance: ${strategy}

IPS: "${run.ips_name}"
Period: ${run.start_date} to ${run.end_date}

Results:
- Total Trades: ${perf.total}
- Win Rate: ${perf.winRate.toFixed(1)}%
- Average ROI: ${perf.avgRoi.toFixed(1)}%

This strategy ${
            perf.winRate >= 65
              ? "performed exceptionally well"
              : perf.winRate >= 55
              ? "showed solid results"
              : "underperformed"
          } when paired with this IPS configuration.

${perf.winRate >= 65 ? "Strong recommendation for future trades using this strategy." : ""}
          `.trim(),
          metrics: perf,
          confidence: Math.min(1.0, perf.total / 50),
        });
      }
    }
  }

  // Lesson 5: Symbol-Specific Performance
  if (results.symbol_performance) {
    const symPerf = results.symbol_performance as Record<string, any>;

    for (const [symbol, perf] of Object.entries(symPerf)) {
      if (perf.total >= 10 && (perf.winRate >= 70 || perf.winRate <= 45)) {
        // Only notable performances
        lessons.push({
          runId,
          ipsId: run.ips_id,
          ipsName: run.ips_name,
          lessonType: perf.winRate >= 70 ? "winning_pattern" : "losing_pattern",
          description: `${symbol} ${perf.winRate >= 70 ? "excelled" : "struggled"} with IPS "${run.ips_name}" (${perf.winRate.toFixed(1)}% win rate)`,
          context: `
Symbol Performance: ${symbol}

IPS: "${run.ips_name}"
Period: ${run.start_date} to ${run.end_date}

Results for ${symbol}:
- Total Trades: ${perf.total}
- Win Rate: ${perf.winRate.toFixed(1)}%
- Average ROI: ${perf.avgRoi.toFixed(1)}%

${
  perf.winRate >= 70
    ? `${symbol} showed exceptional compatibility with this IPS configuration. Consider prioritizing ${symbol} when this IPS signals opportunities.`
    : `${symbol} underperformed with this IPS configuration. Exercise caution or avoid ${symbol} when using this IPS.`
}
          `.trim(),
          metrics: perf,
          confidence: Math.min(1.0, perf.total / 30),
        });
      }
    }
  }

  return lessons;
}

/**
 * Create embeddings for backtest lessons and store in RAG system
 */
export async function indexBacktestLessons(runId: string): Promise<void> {
  const supabase = await createClient();

  console.log(`[RAG] Generating lessons for backtest ${runId}...`);
  const lessons = await generateBacktestLessons(runId);

  console.log(`[RAG] Generated ${lessons.length} lessons. Creating embeddings...`);

  for (const lesson of lessons) {
    try {
      // Generate embedding from lesson context
      const embedding = await generateEmbedding(lesson.context);

      // Store in trade_rationale_embeddings or create new backtest_lesson_embeddings table
      // For now, use trade_rationale_embeddings with a special type flag
      await supabase.from("trade_rationale_embeddings").insert({
        trade_id: null, // No specific trade
        rationale_text: lesson.context,
        rationale_embedding: embedding,
        embedding_metadata: {
          source: "backtest",
          run_id: runId,
          ips_id: lesson.ipsId,
          ips_name: lesson.ipsName,
          lesson_type: lesson.lessonType,
          metrics: lesson.metrics,
          confidence: lesson.confidence,
        },
      });

      console.log(
        `[RAG] Indexed lesson: ${lesson.lessonType} for ${lesson.ipsName}`
      );
    } catch (error) {
      console.error(`[RAG] Error indexing lesson:`, error);
    }
  }

  console.log(`[RAG] Completed indexing ${lessons.length} lessons for backtest ${runId}`);

  // Update backtest run to mark as indexed
  await supabase
    .from("ips_backtest_runs")
    .update({ rag_indexed: true })
    .eq("id", runId);
}

/**
 * Query backtest lessons for a given context
 */
export async function queryBacktestLessons(
  query: string,
  limit = 5
): Promise<BacktestLesson[]> {
  const supabase = await createClient();

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);

  // Search for similar lessons
  const { data, error } = await supabase.rpc("match_trade_rationales", {
    query_embedding: queryEmbedding,
    match_threshold: 0.7,
    match_count: limit,
  });

  if (error || !data) {
    console.error("[RAG] Error querying lessons:", error);
    return [];
  }

  // Filter for backtest lessons
  const lessons = data
    .filter((item: any) => item.embedding_metadata?.source === "backtest")
    .map(
      (item: any): BacktestLesson => ({
        runId: item.embedding_metadata.run_id,
        ipsId: item.embedding_metadata.ips_id,
        ipsName: item.embedding_metadata.ips_name,
        lessonType: item.embedding_metadata.lesson_type,
        description: "",
        context: item.rationale_text,
        metrics: item.embedding_metadata.metrics || {},
        confidence: item.embedding_metadata.confidence || 0.5,
      })
    );

  return lessons;
}
