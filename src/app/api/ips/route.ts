// Fixed src/app/api/ips/route.ts
// Use SSR client with user context for RLS

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

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

function norm(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function resolveFactorIds(
  supabase: any,
  factors: NewFactor[]
): Promise<{ ok: boolean; rows?: any[]; error?: string }>{
  // Collect provided ids and names
  const ids = Array.from(
    new Set(
      factors
        .map((f) => (f.factor_id || '').trim())
        .filter((x) => x)
    )
  );
  const names = Array.from(
    new Set(
      factors
        .map((f) => (f.factor_name || f.name || '').trim())
        .filter((x) => x)
    )
  );

  // Fetch by ids and names to build a lookup
  const lookups = new Map<string, string>(); // key: lowercased name -> id
  const idSet = new Set<string>();

  if (ids.length > 0) {
    const { data: byId, error } = await supabase
      .from('factor_definitions')
      .select('id, name')
      .in('id', ids as any);
    if (!error) {
      for (const row of byId || []) {
        idSet.add(row.id);
        lookups.set(String(row.name || '').toLowerCase(), row.id);
      }
    }
  }

  if (names.length > 0) {
    const { data: byName, error } = await supabase
      .from('factor_definitions')
      .select('id, name')
      .in('name', names as any);
    if (!error) {
      for (const row of byName || []) {
        lookups.set(String(row.name || '').toLowerCase(), row.id);
        idSet.add(row.id);
      }
    }
  }

  // Build resolved rows; prefer matching by exact name; fallback to id if it exists
  let rows: any[] = [];
  let unresolved: { display: string; raw: NewFactor }[] = [];
  const toNum = (v: any) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t);
      return isNaN(n) ? v : n;
    }
    return v ?? null;
  };

  for (const f of factors) {
    const name = (f.factor_name || f.name || '').trim();
    const idCandidate = (f.factor_id || '').trim();
    const byName = name ? lookups.get(name.toLowerCase()) : undefined;
    const resolvedId = byName || (idCandidate && idSet.has(idCandidate) ? idCandidate : undefined);
    if (!resolvedId) {
      unresolved.push({ display: name || idCandidate || '(unknown factor)', raw: f });
      continue;
    }
    rows.push({
      factor_id: resolvedId,
      factor_name: name || null,
      weight: f.weight,
      target_value: toNum((f as any).target_value),
      target_value_max: toNum((f as any).target_value_max),
      target_operator: f.target_operator || null,
      preference_direction: f.preference_direction || null,
      enabled: f.enabled !== false,
    });
  }

  if (rows.length > 0) {
    const factorIds = rows.map((row) => row.factor_id);
    const { data: definitionRows, error: defErr } = await supabase
      .from('factor_definitions')
      .select('id, source')
      .in('id', factorIds as any);

    const sourceMap = new Map<string, string | null>();
    if (!defErr && Array.isArray(definitionRows)) {
      for (const def of definitionRows) {
        sourceMap.set(def.id, def.source ?? null);
      }
    }

    rows = rows.map((row) => {
      const lowerName = String(row.factor_name || '').toLowerCase();
      const source = sourceMap.get(row.factor_id) ?? null;
      const isOptionFactor = row.factor_id.startsWith('opt-') || lowerName.includes('implied volatility') || lowerName.includes('delta') || lowerName.includes('gamma') || lowerName.includes('theta') || lowerName.includes('vega') || lowerName.includes('rho') || lowerName.includes('open interest') || lowerName.includes('bid-ask') || lowerName.includes('time value') || lowerName.includes('intrinsic value');
      const collectionMethod = (source === 'alpha_vantage' || source === 'alpha_vantage_options' || isOptionFactor) ? 'api' : 'manual';
      return { ...row, collection_method: collectionMethod };
    });
  }

  // If unresolved remain, try normalized matching against full catalog
  if (unresolved.length > 0) {
    const { data: allDefs, error: allErr } = await supabase
      .from('factor_definitions')
      .select('id, name');
    if (!allErr && Array.isArray(allDefs)) {
      const normMap = new Map<string, string>();
      for (const row of allDefs) {
        normMap.set(norm(row.name), row.id);
      }
      const stillUnresolved: string[] = [];
      const newlyResolved: any[] = [];
      for (const u of unresolved) {
        const desiredName = (u.raw.factor_name || u.raw.name || '').trim();
        const idCandidate = (u.raw.factor_id || '').trim();
        const byNorm = desiredName ? normMap.get(norm(desiredName)) : undefined;
        const resolvedId = byNorm || (idCandidate && idSet.has(idCandidate) ? idCandidate : undefined);
        if (!resolvedId) {
          stillUnresolved.push(u.display);
        } else {
          newlyResolved.push({
            factor_id: resolvedId,
            factor_name: desiredName || null,
            weight: u.raw.weight,
            target_value: toNum((u.raw as any).target_value),
            target_value_max: toNum((u.raw as any).target_value_max),
            target_operator: u.raw.target_operator || null,
            preference_direction: u.raw.preference_direction || null,
            enabled: u.raw.enabled !== false,
          });
        }
      }
      rows = rows.concat(newlyResolved);
      unresolved = stillUnresolved.map((d) => ({ display: d, raw: { factor_id: '', factor_name: d, weight: 0 } as any }));
    }
  }

  if (unresolved.length > 0) {
    return { ok: false, error: `Unknown factor(s): ${unresolved.map((u) => u.display).join(', ')}` };
  }

  return { ok: true, rows };
}

export async function POST(req: NextRequest) {
  console.log('API Route: Received IPS creation request');
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    console.log('API Route: Request body:', JSON.stringify(body, null, 2));
    const {
      name,
      description,
      is_active = true,
      strategies = [] as string[],
      factors = [] as NewFactor[],
      min_dte,
      max_dte,
      ai_weight = 20,
    } = body || {};

    if (!name || !Array.isArray(factors)) {
      return new Response(JSON.stringify({ error: 'name and factors[] required' }), { status: 400 });
    }

    // Validate DTE configuration - required fields
    if (typeof min_dte !== 'number' || typeof max_dte !== 'number') {
      return new Response(JSON.stringify({ error: 'min_dte and max_dte are required and must be numbers' }), { status: 400 });
    }
    if (min_dte < 0) {
      return new Response(JSON.stringify({ error: 'min_dte must be at least 0 days' }), { status: 400 });
    }
    if (max_dte < min_dte) {
      return new Response(JSON.stringify({ error: 'max_dte must be greater than or equal to min_dte' }), { status: 400 });
    }
    // Removed hardcoded max_dte limit - users can set any reasonable value

    const user_id = user.id;

    // simple validation (allow resolving by name if id missing)
    for (const f of factors) {
      const hasIdentifier = Boolean((f as any).factor_id || (f as any).factor_name || (f as any).name);
      if (!hasIdentifier) {
        return new Response(
          JSON.stringify({ error: 'Each factor must include factor_id or factor_name' }),
          { status: 400 }
        );
      }
      // Remove hardcoded weight limits - allow any positive number
      if (typeof f.weight !== 'number' || f.weight < 0) {
        return new Response(JSON.stringify({ error: `weight must be a positive number for ${(f as any).factor_name || (f as any).name || (f as any).factor_id}` }), { status: 400 });
      }
    }

    // 1) create IPS config - Use the same table as the frontend
    const exit_strategies = (body as any).exit_strategies || null;
    const watch_criteria = (body as any).watch_criteria || null;

    const { data: ipsRows, error: ipsErr } = await supabase
      .from('ips_configurations')
      .insert([{ user_id, name, description, is_active, strategies, exit_strategies, watch_criteria, min_dte, max_dte, ai_weight }])
      .select('id')
      .single();

    if (ipsErr) {
      console.error('Insert ips_configurations failed:', ipsErr);
      return new Response(JSON.stringify({ error: ipsErr.message }), { status: 500 });
    }

    const ips_id = ipsRows.id as string;

    // 2) Resolve factor ids (map names or given ids to DB ids)
    const resolved = await resolveFactorIds(supabase, factors);
    if (!resolved.ok) {
      return new Response(
        JSON.stringify({ error: resolved.error, ips_id }),
        { status: 400 }
      );
    }
    const factorRows = (resolved.rows || []).map((r) => ({
      ips_id,
      ...r,
    }));
    
    // Insert the factors into the database
    const { error: facErr } = await supabase.from('ips_factors').insert(factorRows);
    
    if (facErr) {
      console.error('Insert ips_factors failed:', facErr);
      return new Response(JSON.stringify({ error: facErr.message, ips_id }), { status: 500 });
    }

    // 2.5) Update the counts in ips_configurations
    const enabledFactors = factorRows.filter((f: any) => f.enabled);
    const totalWeight = factorRows.reduce((sum: number, f: any) => sum + f.weight, 0);
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
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // RLS automatically filters by user_id - no need for .eq('user_id', user.id)
    const { data: ipsRows } = await supabase
      .from('ips_configurations')
      .select('*')
      .order('created_at', { ascending: false });

const { data: facRows } = await supabase
  .from('ips_factors')
  .select('ips_id, enabled, collection_method');

// Fetch trade statistics for each IPS
const { data: tradeStats } = await supabase
  .from('trades')
  .select('ips_id, status, profit_loss')
  .eq('user_id', user.id);

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

// Calculate trade statistics per IPS
type TradeStats = { total: number; closed: number; wins: number; total_roi: number };
const tradeStatsMap = new Map<string, TradeStats>();

for (const trade of tradeStats ?? []) {
  const ipsId = trade.ips_id;
  if (!ipsId) continue;

  const stats = tradeStatsMap.get(ipsId) ?? { total: 0, closed: 0, wins: 0, total_roi: 0 };
  stats.total += 1;

  if (trade.status === 'closed') {
    stats.closed += 1;
    const profitLoss = Number(trade.profit_loss) || 0;
    stats.total_roi += profitLoss;
    if (profitLoss > 0) {
      stats.wins += 1;
    }
  }

  tradeStatsMap.set(ipsId, stats);
}

const out = (ipsRows ?? []).map((row: any) => {
  const c = counts.get(row.id);
  const stats = tradeStatsMap.get(row.id);

  return {
    ...row,
    total_factors:  c ? c.total  : (row.total_factors  ?? 0),
    active_factors: c ? c.active : (row.active_factors ?? 0),
    api_factors:    c ? c.api    : (row.api_factors    ?? 0),
    manual_factors: c ? c.manual : (row.manual_factors ?? 0),
    // Calculate win rate and avg ROI from closed trades
    total_trades: stats ? stats.total : 0,
    win_rate: stats && stats.closed > 0 ? (stats.wins / stats.closed) * 100 : null,
    avg_roi: stats && stats.closed > 0 ? stats.total_roi / stats.closed : null,
  };
});

    return new Response(JSON.stringify(out), { status: 200 });
  } catch (e: any) {
    console.error('API Route: Unexpected error in GET:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const {
      id,
      name,
      description,
      is_active = true,
      strategies = [] as string[],
      factors = [] as NewFactor[],
      exit_strategies = null,
      watch_criteria = null,
      min_dte,
      max_dte,
      ai_weight = 20,
    } = body || {};

    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
    }

    // Validate DTE if provided
    if (min_dte !== undefined && max_dte !== undefined) {
      if (typeof min_dte !== 'number' || typeof max_dte !== 'number') {
        return new Response(JSON.stringify({ error: 'min_dte and max_dte must be numbers' }), { status: 400 });
      }
      if (min_dte < 0) {
        return new Response(JSON.stringify({ error: 'min_dte must be at least 0 days' }), { status: 400 });
      }
      if (max_dte < min_dte) {
        return new Response(JSON.stringify({ error: 'max_dte must be greater than or equal to min_dte' }), { status: 400 });
      }
      // Removed hardcoded max_dte limit - users can set any reasonable value
    }

    // Build update object
    const updateData: any = { name, description, is_active, strategies, exit_strategies, watch_criteria };
    if (min_dte !== undefined) updateData.min_dte = min_dte;
    if (max_dte !== undefined) updateData.max_dte = max_dte;
    if (ai_weight !== undefined) updateData.ai_weight = ai_weight;

    // RLS automatically enforces user ownership - no need for .eq('user_id', user.id)
    const { error: ipsErr } = await supabase
      .from('ips_configurations')
      .update(updateData)
      .eq('id', id);

    if (ipsErr) {
      console.error('Update ips_configurations failed:', ipsErr);
      return new Response(JSON.stringify({ error: ipsErr.message }), { status: 500 });
    }

    // Replace factor rows
    await supabase.from('ips_factors').delete().eq('ips_id', id);

    const resolved = await resolveFactorIds(supabase, factors);
    if (!resolved.ok) {
      return new Response(
        JSON.stringify({ error: resolved.error, ips_id: id }),
        { status: 400 }
      );
    }
    const factorRows = (resolved.rows || []).map((r) => ({
      ips_id: id,
      ...r,
    }));

    if (factorRows.length > 0) {
      const { error: facErr } = await supabase.from('ips_factors').insert(factorRows);
      if (facErr) {
        console.error('Insert ips_factors failed:', facErr);
        return new Response(JSON.stringify({ error: facErr.message, ips_id: id }), { status: 500 });
      }
    }

    // Update counts
    const enabledFactors = factorRows.filter((f: any) => f.enabled);
    const totalWeight = factorRows.reduce((sum: number, f: any) => sum + f.weight, 0);
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

