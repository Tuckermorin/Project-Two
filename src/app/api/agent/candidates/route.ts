import { NextRequest, NextResponse } from "next/server";
import { latestCandidates } from "@/lib/db/agent";

export async function GET(req: NextRequest) {
  const runId = new URL(req.url).searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  const { data, error } = await latestCandidates(runId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidates: data ?? [] });
}
