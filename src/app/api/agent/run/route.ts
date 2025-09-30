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
