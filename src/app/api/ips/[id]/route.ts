// src/app/api/ips/[id]/route.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const { data, error } = await supabase.from('ips_with_factors').select('*').eq('ips_id', id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data), { status: 200 });
}
