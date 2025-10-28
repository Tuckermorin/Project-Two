/**
 * API: AI Backtest Analysis
 * POST /api/backtest/[id]/analyze
 *
 * Analyzes backtest results with AI and generates optimization suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";
import { analyzeBacktestWithAI } from "@/lib/services/backtest-ai-analyzer";

export async function POST(
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

    // Verify ownership
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
        { error: "Backtest must be completed before analysis" },
        { status: 400 }
      );
    }

    // Run AI analysis
    console.log(`[AI Analysis] Starting analysis for backtest ${runId}...`);
    const analysis = await analyzeBacktestWithAI(runId);
    console.log(`[AI Analysis] Completed for backtest ${runId}`);

    // Store analysis in database for future reference
    await supabase
      .from("ips_backtest_runs")
      .update({
        ai_analysis: analysis,
        ai_analysis_generated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    console.error("[AI Analysis API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve cached analysis
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const runId = params.id;

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch run with cached analysis
    const { data: run, error: runError } = await supabase
      .from("ips_backtest_runs")
      .select("ai_analysis, ai_analysis_generated_at")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();

    if (runError || !run) {
      return NextResponse.json(
        { error: "Backtest run not found" },
        { status: 404 }
      );
    }

    if (!run.ai_analysis) {
      return NextResponse.json(
        { error: "No analysis available. Run POST /analyze first." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      analysis: run.ai_analysis,
      generatedAt: run.ai_analysis_generated_at,
    });
  } catch (error: any) {
    console.error("[AI Analysis GET API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
