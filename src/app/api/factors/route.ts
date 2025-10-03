// src/app/api/factors/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user (optional - factors may be public)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // For now, allow unauthenticated access to factor definitions
    // You can add auth check here if needed: if (authError || !user) { return 401 }

    // Fetch all active factor definitions
    const { data: factors, error } = await supabase
      .from('factor_definitions')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching factor definitions:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify(factors || []), { status: 200 });
  } catch (e: any) {
    console.error('API Route: Unexpected error in GET /api/factors:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
