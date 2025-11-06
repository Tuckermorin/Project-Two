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

    // Fetch IPS configuration with factors
    const { data: ipsData, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('*, ips_factors(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (ipsError) {
      console.error('Error fetching IPS:', ipsError);
      return new Response(JSON.stringify({ error: ipsError.message }), { status: 500 });
    }

    if (!ipsData) {
      return new Response(JSON.stringify({ error: 'IPS not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(ipsData), { status: 200 });
  } catch (e: any) {
    console.error('Unexpected error in GET /api/ips/[id]:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = await ctx.params;

    // RLS automatically enforces user ownership
    const { error } = await supabase
      .from('ips_configurations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting IPS:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e: any) {
    console.error('Unexpected error deleting IPS:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
