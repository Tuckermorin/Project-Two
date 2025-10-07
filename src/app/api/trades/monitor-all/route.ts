// API Route: Monitor All Active Trades
// GET /api/trades/monitor-all - Monitor all active trades for current user

import { NextRequest, NextResponse } from "next/server";
import { monitorAllActiveTrades } from "@/lib/agent/active-trade-monitor";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get user ID from query or auth (simplified - in production, use proper auth)
    const userId = searchParams.get("userId") || "default-user";

    // Parse options from query params
    const daysBack = parseInt(searchParams.get("daysBack") || "7");
    const useCache = searchParams.get("useCache") !== "false";

    console.log(`[API /trades/monitor-all] Monitoring all trades for user ${userId}`, {
      daysBack,
      useCache,
    });

    const result = await monitorAllActiveTrades(userId, {
      daysBack,
      useCache,
    });

    return NextResponse.json({
      success: true,
      data: result,
      summary: {
        total_trades: result.total_trades,
        monitored: result.monitored,
        risk_summary: result.risk_summary,
        total_credits: result.total_credits_used,
        avg_credits_per_trade: result.monitored > 0
          ? (result.total_credits_used / result.monitored).toFixed(1)
          : 0,
      },
    });
  } catch (error: any) {
    console.error("[API /trades/monitor-all] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to monitor trades",
      },
      { status: 500 }
    );
  }
}
