// API Route: Monitor Active Trade
// GET /api/trades/[id]/monitor - Get deep analysis for an active trade

import { NextRequest, NextResponse } from "next/server";
import { monitorActiveTrade } from "@/lib/agent/active-trade-monitor";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tradeId = params.id;
    const { searchParams } = new URL(request.url);

    // Parse options from query params
    const daysBack = parseInt(searchParams.get("daysBack") || "7");
    const useCache = searchParams.get("useCache") !== "false";
    const forceRefresh = searchParams.get("forceRefresh") === "true";

    console.log(`[API /trades/${tradeId}/monitor] Starting monitor`, {
      daysBack,
      useCache,
      forceRefresh,
    });

    const result = await monitorActiveTrade(tradeId, {
      daysBack,
      useCache,
      forceRefresh,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[API /trades/[id]/monitor] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to monitor trade",
      },
      { status: 500 }
    );
  }
}
