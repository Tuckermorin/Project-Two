// API Route: RAG Enrichment
// POST /api/agent/rag/enrich - Enrich RAG with fresh Tavily research for symbols

import { NextRequest, NextResponse } from "next/server";
import { batchIntelligentResearch } from "@/lib/agent/rag-router";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      symbols = [], // Array of symbols to enrich
      context = "general", // Research context (general, catalyst, analyst, etc.)
      forceRefresh = false, // Force Tavily fetch even if RAG has data
    } = body;

    // If no symbols provided, use watchlist
    let symbolsToEnrich = symbols;

    if (symbolsToEnrich.length === 0) {
      console.log("[API /agent/rag/enrich] No symbols provided, using watchlist");

      // Get watchlist for default user (in production, use proper auth)
      const { data: watchlistItems, error } = await supabase
        .from("watchlist_items")
        .select("symbol")
        .eq("user_id", "default-user") // TODO: Replace with actual user auth
        .limit(20);

      if (error || !watchlistItems) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to fetch watchlist",
          },
          { status: 500 }
        );
      }

      symbolsToEnrich = watchlistItems.map((item) => item.symbol);
    }

    if (symbolsToEnrich.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No symbols to enrich",
      });
    }

    console.log(
      `[API /agent/rag/enrich] Enriching ${symbolsToEnrich.length} symbols`,
      {
        context,
        forceRefresh,
      }
    );

    const results = await batchIntelligentResearch(symbolsToEnrich, context, {
      forceRefresh,
      enableHybrid: true,
    });

    // Calculate statistics
    const totalCredits = Object.values(results).reduce(
      (sum, r) => sum + r.credits_used,
      0
    );
    const ragHits = Object.values(results).filter((r) => r.source === "rag").length;
    const tavilyFetches = Object.values(results).filter(
      (r) => r.source === "tavily"
    ).length;
    const hybridQueries = Object.values(results).filter(
      (r) => r.source === "hybrid"
    ).length;
    const cacheHitRate = (ragHits / symbolsToEnrich.length) * 100;

    return NextResponse.json({
      success: true,
      data: {
        symbols_enriched: symbolsToEnrich.length,
        results,
        statistics: {
          total_credits_used: totalCredits,
          avg_credits_per_symbol:
            symbolsToEnrich.length > 0
              ? (totalCredits / symbolsToEnrich.length).toFixed(1)
              : 0,
          rag_hits: ragHits,
          tavily_fetches: tavilyFetches,
          hybrid_queries: hybridQueries,
          cache_hit_rate: cacheHitRate.toFixed(1) + "%",
        },
      },
      message: `Enriched ${symbolsToEnrich.length} symbols (${totalCredits} credits, ${cacheHitRate.toFixed(0)}% cache hit rate)`,
    });
  } catch (error: any) {
    console.error("[API /agent/rag/enrich] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to enrich RAG",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check enrichment status
export async function GET(request: NextRequest) {
  try {
    // Return count of recent embeddings
    const { data, error } = await supabase
      .from("trade_embeddings")
      .select("created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    // Group by symbol
    const symbolCounts: Record<string, number> = {};
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    let recentCount = 0;

    (data || []).forEach((item) => {
      const symbol = item.metadata?.symbol || "unknown";
      symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;

      if (new Date(item.created_at).getTime() > last24h) {
        recentCount++;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        total_embeddings: data?.length || 0,
        embeddings_last_24h: recentCount,
        symbols_with_embeddings: Object.keys(symbolCounts).length,
        top_symbols: Object.entries(symbolCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([symbol, count]) => ({ symbol, count })),
      },
    });
  } catch (error: any) {
    console.error("[API /agent/rag/enrich GET] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get enrichment status",
      },
      { status: 500 }
    );
  }
}
