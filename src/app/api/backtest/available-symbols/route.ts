/**
 * API: Get Available Symbols for Backtesting
 * GET /api/backtest/available-symbols
 *
 * Returns distinct symbols from historical_options_data table
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Query distinct symbols from historical_options_data using RPC for efficiency
    const { data: symbolData, error: symbolError } = await supabase.rpc(
      "get_distinct_historical_symbols"
    );

    if (symbolError) {
      console.error("[Available Symbols API] RPC Error:", symbolError);
      return NextResponse.json(
        { error: "Failed to fetch available symbols", details: symbolError.message },
        { status: 500 }
      );
    }

    console.log("[Available Symbols API] Raw RPC data:", symbolData);

    // RPC function returns array of symbols
    const uniqueSymbols = Array.isArray(symbolData) ? symbolData : [];

    return NextResponse.json({
      symbols: uniqueSymbols,
      count: uniqueSymbols.length,
    });
  } catch (error: any) {
    console.error("[Available Symbols API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
