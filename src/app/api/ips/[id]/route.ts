// src/app/api/ips/[id]/route.ts
import { createClient } from '@/lib/supabase/server-client';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = await ctx.params;

    // RLS automatically enforces user ownership
    const { data, error } = await supabase
      .from('ips_with_factors')
      .select('*')
      .eq('ips_id', id);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
