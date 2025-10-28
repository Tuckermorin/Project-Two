/**
 * API: Index Backtest Lessons into RAG
 * POST /api/backtest/[id]/index-rag
 *
 * Generates embeddings from backtest results and stores them for AI learning
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";
import { indexBacktestLessons } from "@/lib/services/backtest-rag-integration";

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

    // Check if already indexed
    if (run.rag_indexed) {
      return NextResponse.json({
        success: true,
        message: "Backtest already indexed",
        alreadyIndexed: true,
      });
    }

    // Check if completed
    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Backtest must be completed before indexing" },
        { status: 400 }
      );
    }

    // Generate and index lessons
    await indexBacktestLessons(runId);

    return NextResponse.json({
      success: true,
      message: "Backtest lessons indexed successfully",
      runId,
    });
  } catch (error: any) {
    console.error("[Index RAG API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
