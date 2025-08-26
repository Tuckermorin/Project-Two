// Fixed src/app/api/ips/route.ts
// Use the same environment variables as the frontend

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the same environment variables as the frontend
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type NewFactor = { 
  factor_id: string; 
  factor_name?: string;
  name?: string;
  weight: number; 
  target_value?: number | string | null;
  target_operator?: string | null;
  preference_direction?: string | null;
  enabled?: boolean;
};

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
    const factorRows = factors.map(f => ({ 
      ips_id, 
      factor_id: f.factor_id,
      factor_name: f.factor_name || f.name || '', // Add factor_name field
      weight: f.weight,
      target_value: f.target_value ?? null,
      target_operator: f.target_operator || null,
      preference_direction: f.preference_direction || null,
      enabled: f.enabled !== undefined ? f.enabled : true
    }));
    
    // Insert the factors into the database
    const { error: facErr } = await supabase.from('ips_factors').insert(factorRows);
    
    if (facErr) {
      console.error('Insert ips_factors failed:', facErr);
      return new Response(JSON.stringify({ error: facErr.message, ips_id }), { status: 500 });
    }

    // 2.5) Update the counts in ips_configurations
    const enabledFactors = factorRows.filter(f => f.enabled);
    const totalWeight = factorRows.reduce((sum, f) => sum + f.weight, 0);
    const avgWeight = factorRows.length > 0 ? totalWeight / factorRows.length : 0;

    const { error: updateErr } = await supabase
      .from('ips_configurations')
      .update({
        total_factors: factorRows.length,
        active_factors: enabledFactors.length,
        total_weight: totalWeight,
        avg_weight: avgWeight
      })
      .eq('id', ips_id);

    if (updateErr) {
      console.error('Failed to update factor counts:', updateErr);
      // Continue anyway - counts can be fixed later
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
  // 1) Fetch IPS rows
 const { data: ipsRows } = await supabase.from('ips_configurations').select('*').order('created_at', { ascending: false });

const { data: facRows } = await supabase
  .from('ips_factors')
  .select('ips_id, enabled, collection_method');

type C = { total: number; active: number; api: number; manual: number };
const counts = new Map<string, C>();

for (const r of facRows ?? []) {
  const id = (r as any).ips_id as string;
  const enabled = (r as any).enabled;
  const method = (r as any).collection_method as string | null;

  const c = counts.get(id) ?? { total: 0, active: 0, api: 0, manual: 0 };
  c.total += 1;
  if (enabled !== false) c.active += 1;
  if (method === 'api') c.api += 1; else c.manual += 1;
  counts.set(id, c);
}

const out = (ipsRows ?? []).map((row: any) => {
  const c = counts.get(row.id);
  return {
    ...row,
    total_factors:  c ? c.total  : (row.total_factors  ?? 0),
    active_factors: c ? c.active : (row.active_factors ?? 0),
    api_factors:    c ? c.api    : (row.api_factors    ?? 0),
    manual_factors: c ? c.manual : (row.manual_factors ?? 0),
  };
});

return new Response(JSON.stringify(out), { status: 200 });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      description,
      is_active = true,
      factors = [] as NewFactor[],
    } = body || {};

    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    }

    // Update IPS configuration
    const { error: ipsErr } = await supabase
      .from('ips_configurations')
      .update({ name, description, is_active })
      .eq('id', id);

    if (ipsErr) {
      console.error('Update ips_configurations failed:', ipsErr);
      return new Response(JSON.stringify({ error: ipsErr.message }), { status: 500 });
    }

    // Replace factor rows
    await supabase.from('ips_factors').delete().eq('ips_id', id);

    const factorRows = factors.map(f => ({
      ips_id: id,
      factor_id: f.factor_id,
      factor_name: f.factor_name || f.name || '',
      weight: f.weight,
      target_value: f.target_value ?? null,
      target_operator: f.target_operator || null,
      preference_direction: f.preference_direction || null,
      enabled: f.enabled !== false
    }));

    if (factorRows.length > 0) {
      const { error: facErr } = await supabase.from('ips_factors').insert(factorRows);
      if (facErr) {
        console.error('Insert ips_factors failed:', facErr);
        return new Response(JSON.stringify({ error: facErr.message, ips_id: id }), { status: 500 });
      }
    }

    // Update counts
    const enabledFactors = factorRows.filter(f => f.enabled);
    const totalWeight = factorRows.reduce((sum, f) => sum + f.weight, 0);
    const avgWeight = factorRows.length > 0 ? totalWeight / factorRows.length : 0;

    const { error: updateErr } = await supabase
      .from('ips_configurations')
      .update({
        total_factors: factorRows.length,
        active_factors: enabledFactors.length,
        total_weight: totalWeight,
        avg_weight: avgWeight
      })
      .eq('id', id);

    if (updateErr) {
      console.error('Failed to update factor counts:', updateErr);
    }

    const { data, error } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Select ips_configurations failed:', error);
      return new Response(JSON.stringify({ error: error.message, ips_id: id }), { status: 500 });
    }

    return new Response(JSON.stringify({ ips_id: id, data }), { status: 200 });
  } catch (e: any) {
    console.error('API Route: Unexpected error in PUT:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

