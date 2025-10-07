// API Route: Trade Post-Mortem Analysis
// GET /api/trades/[id]/postmortem - Get post-mortem analysis for a closed trade
// POST /api/trades/[id]/postmortem - Generate post-mortem analysis

import { NextRequest, NextResponse } from "next/server";
import {
  analyzeTradePostMortem,
  getTradePostMortem,
} from "@/lib/agent/trade-postmortem";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tradeId = params.id;

    console.log(`[API /trades/${tradeId}/postmortem] Fetching post-mortem`);

    const postMortem = await getTradePostMortem(tradeId);

    if (!postMortem) {
      return NextResponse.json(
        {
          success: false,
          error: "No post-mortem found for this trade",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: postMortem,
    });
  } catch (error: any) {
    console.error("[API /trades/[id]/postmortem GET] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch post-mortem",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tradeId = params.id;
    const body = await request.json();

    const embedToRAG = body.embedToRAG !== false; // Default true

    console.log(`[API /trades/${tradeId}/postmortem] Generating post-mortem`, {
      embedToRAG,
    });

    const postMortem = await analyzeTradePostMortem(tradeId, { embedToRAG });

    return NextResponse.json({
      success: true,
      data: postMortem,
      message: `Post-mortem generated (${postMortem.credits_used} credits used)`,
    });
  } catch (error: any) {
    console.error("[API /trades/[id]/postmortem POST] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate post-mortem",
      },
      { status: 500 }
    );
  }
}
