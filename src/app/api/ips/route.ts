// Fixed src/app/api/ips/route.ts
// Use the same environment variables as the frontend

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the same environment variables as the frontend
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type NewFactor = { factor_id: string; weight: number; target_value?: number | null };

export async function POST(req: NextRequest) {
  console.log('API Route: Received IPS creation request');
  try {
    const body = await req.json();
    console.log('API Route: Request body:', JSON.stringify(body, null, 2));
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

    // 1) create IPS config - Use the same table as the frontend
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

    // 3) return hydrated IPS - Use same table as frontend for consistency
    const { data, error } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', ips_id)
      .single();

    if (error) {
      console.error('Select ips_configurations failed:', error);
      return new Response(JSON.stringify({ error: error.message, ips_id }), { status: 500 });
    }

    return new Response(JSON.stringify({ ips_id, data }), { status: 201 });
  } catch (e: any) {
    console.error('API Route: Unexpected error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function GET() {
  // Use the same table as the frontend for consistency
  const { data, error } = await supabase
    .from('ips_configurations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), { status: 200 });
}