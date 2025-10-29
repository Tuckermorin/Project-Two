/**
 * API: Start IPS Backtest
 * POST /api/backtest/start
 *
 * Initiates a new backtest run for an IPS configuration
 * Returns immediately with run_id for status polling
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";
import { IPSBacktestingEngine } from "@/lib/services/ips-backtesting-engine";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      ipsId,
      startDate,
      endDate,
      symbols,
      includeSentiment = true,
      useAIFiltering = false, // NEW: Enable AI filtering
      aiRecommendationThreshold = 'buy', // NEW: Minimum recommendation threshold
      minTrades = 10,
    } = body;

    // Validation
    if (!ipsId) {
      return NextResponse.json(
        { error: "ipsId is required" },
        { status: 400 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    // Fetch IPS configuration
    const { data: ipsConfig, error: ipsError } = await supabase
      .from("ips_configurations")
      .select(`
        *,
        ips_factors (*)
      `)
      .eq("id", ipsId)
      .eq("user_id", user.id)
      .single();

    if (ipsError || !ipsConfig) {
      return NextResponse.json(
        { error: "IPS configuration not found" },
        { status: 404 }
      );
    }

    // Build config for backtesting engine
    const backtestConfig = {
      ipsId: ipsConfig.id,
      ipsName: ipsConfig.name,
      ipsConfig: {
        factors: ipsConfig.ips_factors.map((f: any) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          source: f.source,
          weight: f.weight,
          target: f.target,
        })),
        strategies: ipsConfig.strategies || [],
        min_dte: ipsConfig.min_dte,
        max_dte: ipsConfig.max_dte,
        exit_strategies: ipsConfig.exit_strategies,
      },
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      symbols: symbols || undefined,
      includeSentiment,
      useAIFiltering, // NEW
      aiRecommendationThreshold, // NEW
      minTrades,
      userId: user.id,
    };

    // Create backtest run record (status: pending)
    const { data: run, error: runError } = await supabase
      .from("ips_backtest_runs")
      .insert({
        ips_id: ipsConfig.id,
        ips_name: ipsConfig.name,
        ips_config: backtestConfig.ipsConfig,
        start_date: backtestConfig.startDate.toISOString().split('T')[0],
        end_date: backtestConfig.endDate.toISOString().split('T')[0],
        symbols: backtestConfig.symbols,
        min_trades: minTrades,
        include_sentiment: includeSentiment,
        use_ai_filtering: useAIFiltering, // NEW
        ai_recommendation_threshold: aiRecommendationThreshold, // NEW
        user_id: user.id,
        status: "pending",
      })
      .select()
      .single();

    if (runError || !run) {
      console.error("[Backtest API] Error creating run:", runError);
      return NextResponse.json(
        { error: "Failed to create backtest run" },
        { status: 500 }
      );
    }

    // Start backtest in background
    // Note: In production, use a proper job queue (Bull, BullMQ, etc.)
    // For now, we'll run it asynchronously
    runBacktestInBackground(backtestConfig, run.id).catch(error => {
      console.error("[Backtest API] Background error:", error);
    });

    // Return run ID immediately
    return NextResponse.json({
      success: true,
      runId: run.id,
      status: "pending",
      message: "Backtest started. Use /api/backtest/[id]/status to check progress.",
    });

  } catch (error: any) {
    console.error("[Backtest API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Run backtest in background
 * In production, this should be a queued job
 */
async function runBacktestInBackground(config: any, runId: string) {
  const supabase = await createClient();

  try {
    // Update status to "running"
    await supabase
      .from("ips_backtest_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // Create engine with runId and run
    const engine = new IPSBacktestingEngine(config, undefined, runId);
    await engine.run();

    // Update status to "completed"
    await supabase
      .from("ips_backtest_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    console.log(`[Backtest ${runId}] Completed successfully`);
  } catch (error: any) {
    console.error(`[Backtest ${runId}] Failed:`, error);

    // Update status to "failed"
    await supabase
      .from("ips_backtest_runs")
      .update({
        status: "failed",
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }
}
