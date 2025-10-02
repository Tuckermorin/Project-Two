import { NextRequest, NextResponse } from "next/server";
import { runAgentOnce } from "@/lib/agent/options-agent-graph";

export async function POST(req: NextRequest) {
  try {
    const { symbols, mode, ipsId } = await req.json();

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

    const result = await runAgentOnce({
      symbols,
      mode: mode ?? "paper",
      ipsId,
    });

    // Log what we're returning to help debug IPS display
    console.log(`[API] Returning ${result?.selected?.length || 0} selected candidates`);
    if (result?.selected && result.selected.length > 0) {
      const firstCandidate = result.selected[0];
      console.log(`[API] First candidate IPS data check:`, {
        symbol: firstCandidate.symbol,
        has_detailed_analysis: !!firstCandidate.detailed_analysis,
        has_ips_factors: !!firstCandidate.detailed_analysis?.ips_factors,
        ips_factors_count: firstCandidate.detailed_analysis?.ips_factors?.length || 0,
        ips_name: firstCandidate.detailed_analysis?.ips_name || 'N/A',
      });
    }

    return NextResponse.json({
      ok: true,
      runId: result?.runId ?? "n/a",
      selected: result?.selected ?? [],
    });
  } catch (e: any) {
    console.error("Agent run failed:", e);
    return NextResponse.json(
      { error: e.message ?? "agent failed" },
      { status: 500 }
    );
  }
}
