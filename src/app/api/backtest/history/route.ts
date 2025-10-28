/**
 * API: Get Backtest History
 * GET /api/backtest/history
 *
 * Returns all backtest runs for the current user
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";

export async function GET(request: NextRequest) {
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

    // Get optional IPS ID filter from query params
    const { searchParams } = new URL(request.url);
    const ipsId = searchParams.get("ipsId");

    // Build query
    let query = supabase
      .from("ips_backtest_runs")
      .select("*")
      .eq("user_id", user.id);

    // Filter by IPS ID if provided
    if (ipsId) {
      query = query.eq("ips_id", ipsId);
    }

    const { data: backtests, error: backtestError } = await query
      .order("created_at", { ascending: false });

    if (backtestError) {
      console.error("[Backtest History API] Error:", backtestError);
      return NextResponse.json(
        { error: "Failed to fetch backtest history" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      runs: backtests || [],
    });
  } catch (error: any) {
    console.error("[Backtest History API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
