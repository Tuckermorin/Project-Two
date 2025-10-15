import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";

/**
 * GET /api/agent/latest
 *
 * Fetch the most recent completed agent run for the authenticated user,
 * including all trade candidates and their details.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fetch the most recent completed agent run for this user
    const { data: latestRun, error: runError } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("user_id", user.id)
      .not("finished_at", "is", null) // Only completed runs
      .order("finished_at", { ascending: false })
      .limit(1)
      .single();

    if (runError) {
      // No runs found is not an error, just return empty
      if (runError.code === "PGRST116") {
        return NextResponse.json({
          ok: true,
          hasCache: false,
          run: null,
          candidates: [],
        });
      }
      throw runError;
    }

    if (!latestRun) {
      return NextResponse.json({
        ok: true,
        hasCache: false,
        run: null,
        candidates: [],
      });
    }

    // Fetch all trade candidates for this run
    const { data: candidates, error: candidatesError } = await supabase
      .from("trade_candidates")
      .select("*")
      .eq("run_id", latestRun.run_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (candidatesError) {
      throw candidatesError;
    }

    // Parse the outcome JSON to get selected candidates with full details
    let selectedCandidates = candidates || [];

    // If outcome has selected array with more details, merge them
    if (latestRun.outcome?.selected && Array.isArray(latestRun.outcome.selected)) {
      const outcomeMap = new Map(
        latestRun.outcome.selected.map((c: any) => [c.id, c])
      );

      selectedCandidates = (candidates || []).map((dbCandidate) => {
        const outcomeCandidate = outcomeMap.get(dbCandidate.id);
        if (outcomeCandidate) {
          // Merge database record with outcome details
          return {
            ...dbCandidate,
            ...outcomeCandidate,
            // Ensure we keep the database fields
            id: dbCandidate.id,
            run_id: dbCandidate.run_id,
            created_at: dbCandidate.created_at,
          };
        }
        return dbCandidate;
      });
    }

    return NextResponse.json({
      ok: true,
      hasCache: true,
      run: {
        runId: latestRun.run_id,
        startedAt: latestRun.started_at,
        finishedAt: latestRun.finished_at,
        mode: latestRun.mode,
        watchlist: latestRun.watchlist,
      },
      candidates: selectedCandidates,
      candidatesCount: selectedCandidates.length,
    });
  } catch (e: any) {
    console.error("[API] Failed to fetch latest agent run:", e);
    return NextResponse.json(
      { error: e.message || "Failed to fetch latest agent run" },
      { status: 500 }
    );
  }
}
