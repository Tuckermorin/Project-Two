import { NextRequest, NextResponse } from "next/server";
import { seedTradeEmbeddings } from "@/lib/agent/rag-embeddings";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let userId = body.userId;

    // If no userId provided, seed for ALL users with closed trades
    if (!userId) {
      console.log(`[RAG Seed] No userId provided, seeding for all users`);

      // Get all unique user IDs with closed trades
      const { data: users, error } = await supabase
        .from("trades")
        .select("user_id")
        .eq("status", "closed")
        .not("realized_pnl", "is", null);

      if (error) {
        return NextResponse.json(
          { error: `Failed to fetch users: ${error.message}` },
          { status: 500 }
        );
      }

      const uniqueUserIds = [...new Set(users?.map((u: any) => u.user_id) || [])];

      if (uniqueUserIds.length === 0) {
        return NextResponse.json({
          ok: true,
          message: "No users with closed trades found",
          embedded_count: 0,
        });
      }

      console.log(`[RAG Seed] Found ${uniqueUserIds.length} users with closed trades`);

      let totalEmbedded = 0;
      const results: any[] = [];

      for (const uid of uniqueUserIds) {
        try {
          const embeddedCount = await seedTradeEmbeddings(uid as string);
          totalEmbedded += embeddedCount;
          results.push({ userId: uid, embedded: embeddedCount });
        } catch (err: any) {
          console.error(`[RAG Seed] Failed for user ${uid}:`, err.message);
          results.push({ userId: uid, error: err.message });
        }
      }

      return NextResponse.json({
        ok: true,
        users_processed: uniqueUserIds.length,
        total_embedded: totalEmbedded,
        results,
      });
    }

    console.log(`[RAG Seed] Starting embedding seed for user ${userId}`);

    // Seed embeddings for specific user
    const embeddedCount = await seedTradeEmbeddings(userId);

    // Get total stats
    const { data: stats } = await supabase
      .from("trade_embeddings")
      .select("id", { count: "exact" })
      .eq("user_id", userId);

    return NextResponse.json({
      ok: true,
      user_id: userId,
      embedded_count: embeddedCount,
      total_embeddings: stats?.length || 0,
    });
  } catch (e: any) {
    console.error("RAG seed failed:", e);
    return NextResponse.json(
      { error: e.message ?? "seed failed" },
      { status: 500 }
    );
  }
}
