// API Route: Refresh All Active Trades
// POST /api/trades/refresh-active - Updates all active trades with current market data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use shared refresh logic
    const { executeRefreshLogic } = await import('@/lib/dashboard/refresh-logic');
    const result = await executeRefreshLogic(supabase, user.id);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[Refresh Active Trades] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to refresh trades'
      },
      { status: 500 }
    );
  }
}
