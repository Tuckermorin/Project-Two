/**
 * API: Get Backtest Status
 * GET /api/backtest/[id]/status
 *
 * Returns current status and progress of a backtest run
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

    // Fetch run status
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

    // Calculate progress percentage
    let progressPercent = 0;
    if (run.status === "completed") {
      progressPercent = 100;
    } else if (run.status === "running") {
      // Estimate based on trades analyzed (rough estimate)
      const estimatedTotal = (run.symbols?.length || 1) * 1000; // Assume ~1000 trades per symbol
      const current = run.total_trades_analyzed || 0;
      progressPercent = Math.min(95, (current / estimatedTotal) * 100);
    }

    // Build response
    const response = {
      runId: run.id,
      status: run.status,
      progress: {
        percent: Math.round(progressPercent),
        tradesAnalyzed: run.total_trades_analyzed || 0,
        tradesMatched: run.trades_matched || 0,
        tradesPassed: run.trades_passed || 0,
        sentimentFetched: run.sentiment_fetched || 0,
      },
      timing: {
        startedAt: run.started_at,
        completedAt: run.completed_at,
        durationSeconds: run.duration_seconds,
      },
      config: {
        ipsName: run.ips_name,
        startDate: run.start_date,
        endDate: run.end_date,
        symbols: run.symbols,
        includeSentiment: run.include_sentiment,
      },
      error: run.error_message,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error("[Backtest Status API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
