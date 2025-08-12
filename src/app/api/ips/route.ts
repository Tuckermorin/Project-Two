// src/app/api/ips/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

type NewFactor = { factor_id: string; weight: number; target_value?: number | null };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      user_id = 'test-user-123', // until you wire auth
      name,
      description,
      is_active = true,
      factors = [] as NewFactor[],
    } = body || {};

    if (!name || !Array.isArray(factors)) {
      return new Response(JSON.stringify({ error: 'name and factors[] required' }), { status: 400 });
    }

    // simple validation
    for (const f of factors) {
      if (!f.factor_id) return new Response(JSON.stringify({ error: 'factor_id required' }), { status: 400 });
      if (typeof f.weight !== 'number' || f.weight < 1 || f.weight > 10) {
        return new Response(JSON.stringify({ error: `weight must be 1..10 for ${f.factor_id}` }), { status: 400 });
      }
    }

    // 1) create IPS config
    const { data: ipsRows, error: ipsErr } = await supabase
      .from('ips_configurations')
      .insert([{ user_id, name, description, is_active }])
      .select('id')
      .single();

    if (ipsErr) {
      console.error('Insert ips_configurations failed:', ipsErr);
      return new Response(JSON.stringify({ error: ipsErr.message }), { status: 500 });
    }

    const ips_id = ipsRows.id as string;

    // 2) link factors
    const factorRows = factors.map(f => ({ ips_id, factor_id: f.factor_id, weight: f.weight, target_value: f.target_value ?? null }));
    const { error: facErr } = await supabase.from('ips_factors').insert(factorRows);
    if (facErr) {
      console.error('Insert ips_factors failed:', facErr);
      return new Response(JSON.stringify({ error: facErr.message, ips_id }), { status: 500 });
    }

    // 3) return hydrated IPS (from the view for convenience)
    const { data, error } = await supabase
      .from('ips_with_factors')
      .select('*')
      .eq('ips_id', ips_id);

    if (error) {
      console.error('Select ips_with_factors failed:', error);
      return new Response(JSON.stringify({ error: error.message, ips_id }), { status: 500 });
    }

    return new Response(JSON.stringify({ ips_id, rows: data }), { status: 201 });
  } catch (e: any) {
    console.error('Unexpected /api/ips POST error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function GET() {
  // list all IPS with factor summaries (one row per factor; fine for now)
  const { data, error } = await supabase.from('ips_with_factors').select('*').order('ips_name', { ascending: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data), { status: 200 });
}
