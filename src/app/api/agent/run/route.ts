import { NextRequest, NextResponse } from "next/server";
import { runAgentV3 } from "@/lib/agent/options-agent-v3";
import { runAgentOnce } from "@/lib/agent/options-agent-graph"; // Keep old version as fallback

export async function POST(req: NextRequest) {
  try {
    const { symbols, mode, ipsId, useV3 = true } = await req.json();

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: "symbols[] required" },
        { status: 400 }
      );
    }

    if (!ipsId) {
      return NextResponse.json(
        { error: "ipsId required" },
        { status: 400 }
      );
    }

    // Allow toggling between agent versions
    const agentFn = useV3 ? runAgentV3 : runAgentOnce;
    const agentVersion = useV3 ? "v3" : "v1";

    console.log(`[API] Running agent ${agentVersion} with ${symbols.length} symbols`);

    const result = await agentFn({
      symbols,
      mode: mode ?? "paper",
      ipsId,
    });

    // Log what we're returning to help debug IPS display
    console.log(`[API] Agent ${agentVersion} returned ${result?.selected?.length || 0} selected candidates`);

    if (result?.selected && result.selected.length > 0) {
      const firstCandidate = result.selected[0];
      console.log(`[API] First candidate data check:`, {
        symbol: firstCandidate.symbol,
        composite_score: firstCandidate.composite_score,
        ips_score: firstCandidate.ips_score,
        has_historical_analysis: !!firstCandidate.historical_analysis,
        diversification_warnings: firstCandidate.diversification_warnings?.length || 0,
      });
    }

    // Log reasoning decisions for V3
    if (useV3 && result?.reasoningDecisions) {
      console.log(`[API] Reasoning decisions:`, result.reasoningDecisions);
    }

    return NextResponse.json({
      ok: true,
      version: agentVersion,
      runId: result?.runId ?? "n/a",
      selected: result?.selected ?? [],
      candidates_total: result?.candidates?.length || 0,
      reasoning_decisions: result?.reasoningDecisions || [],
      errors: result?.errors || [],
    });
  } catch (e: any) {
    console.error("Agent run failed:", e);
    return NextResponse.json(
      { error: e.message ?? "agent failed" },
      { status: 500 }
    );
  }
}
