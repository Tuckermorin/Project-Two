/**
 * API: Get Backtest Results
 * GET /api/backtest/[id]/results
 *
 * Returns complete results of a completed backtest
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: runId } = await params;

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch run
    const { data: run, error: runError } = await supabase
      .from("ips_backtest_runs")
      .select("*")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();

    if (runError || !run) {
      return NextResponse.json(
        { error: "Backtest run not found" },
        { status: 404 }
      );
    }

    // Check if completed
    if (run.status !== "completed") {
      return NextResponse.json(
        {
          error: "Backtest not yet completed",
          status: run.status,
          message: run.status === "failed" ? run.error_message : "Backtest is still running",
        },
        { status: 400 }
      );
    }

    // Fetch results
    const { data: results, error: resultsError } = await supabase
      .from("ips_backtest_results")
      .select("*")
      .eq("run_id", runId)
      .single();

    if (resultsError || !results) {
      console.error("[Backtest Results API] Results not found for run", runId);
      console.error("[Backtest Results API] Error:", resultsError);

      // Check if run has trade matches at least
      const { data: tradeMatches, error: matchesError } = await supabase
        .from("ips_backtest_trade_matches")
        .select("count")
        .eq("run_id", runId);

      if (matchesError || !tradeMatches) {
        return NextResponse.json(
          {
            error: "Results not found",
            details: "The backtest completed but did not generate results. This may indicate an error during processing.",
            runStatus: run.status,
            errorMessage: run.error_message
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: "Results calculation in progress",
          details: `Found trade matches but results not yet calculated. Run status: ${run.status}`,
          tradeMatchCount: tradeMatches.length
        },
        { status: 404 }
      );
    }

    // Fetch sample trade matches (top winners and losers)
    const { data: topWinners } = await supabase
      .from("ips_backtest_trade_matches")
      .select("*")
      .eq("run_id", runId)
      .order("realized_roi", { ascending: false })
      .limit(10);

    const { data: topLosers } = await supabase
      .from("ips_backtest_trade_matches")
      .select("*")
      .eq("run_id", runId)
      .order("realized_roi", { ascending: true })
      .limit(10);

    // Build comprehensive response
    const response = {
      runId: run.id,
      ipsId: run.ips_id,
      ipsName: run.ips_name,

      // Overview
      overview: {
        status: run.status,
        startDate: run.start_date,
        endDate: run.end_date,
        totalDays: run.total_days,
        symbols: run.symbols,
        durationSeconds: run.duration_seconds,
      },

      // Performance Metrics
      performance: {
        totalTrades: results.total_trades,
        winningTrades: results.winning_trades,
        losingTrades: results.losing_trades,
        winRate: results.win_rate,
        passRate: run.pass_rate,
      },

      // P&L Metrics
      pnl: {
        total: results.total_pnl,
        average: results.avg_pnl,
        median: results.median_pnl,
        maxWin: results.max_win,
        maxLoss: results.max_loss,
      },

      // ROI Metrics
      roi: {
        average: results.avg_roi,
        median: results.median_roi,
        best: results.best_roi,
        worst: results.worst_roi,
      },

      // Risk Metrics
      risk: {
        sharpeRatio: results.sharpe_ratio,
        sortinoRatio: results.sortino_ratio,
        maxDrawdown: results.max_drawdown,
        maxDrawdownDurationDays: results.max_drawdown_duration_days,
        profitFactor: results.profit_factor,
      },

      // Consistency Metrics
      consistency: {
        maxWinStreak: results.win_streak_max,
        maxLossStreak: results.loss_streak_max,
        avgDaysHeld: results.avg_days_held,
        avgDTE: results.avg_days_to_expiration,
      },

      // Breakdown
      breakdown: {
        byStrategy: results.strategy_performance,
        bySymbol: results.symbol_performance,
        byMonth: results.monthly_performance,
      },

      // Factor Analysis
      factors: {
        correlation: results.factor_correlation,
        importance: results.factor_importance,
      },

      // Sentiment Analysis (if included)
      sentiment: run.include_sentiment
        ? {
            correlation: results.sentiment_correlation,
            optimalRange: results.optimal_sentiment_range,
            dataPoints: run.sentiment_fetched,
          }
        : null,

      // Statistical Confidence
      confidence: {
        winRateLower: results.win_rate_ci_lower,
        winRateUpper: results.win_rate_ci_upper,
        avgRoiLower: results.avg_roi_ci_lower,
        avgRoiUpper: results.avg_roi_ci_upper,
      },

      // Benchmark Comparison
      benchmark: {
        outperformanceVsRandom: results.outperformance_vs_random,
        outperformanceVsMarket: results.outperformance_vs_market,
      },

      // Portfolio Metrics
      portfolio: {
        startingValue: results.starting_portfolio,
        endingValue: results.ending_portfolio,
        totalReturn: results.total_return,
        cagr: results.cagr,
        maxDrawdown: results.portfolio_max_drawdown,
        equityCurve: results.equity_curve,
      },

      // Sample Trades
      sampleTrades: {
        topWinners: topWinners || [],
        topLosers: topLosers || [],
      },

      // Timestamps
      calculatedAt: results.calculated_at,
      completedAt: run.completed_at,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error("[Backtest Results API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
