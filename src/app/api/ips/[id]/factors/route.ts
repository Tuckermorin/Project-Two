// src/app/api/ips/[id]/factors/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

function normalizeKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: ipsId } = await ctx.params;
    if (!ipsId) {
      return NextResponse.json({ error: 'Missing IPS id' }, { status: 400 });
    }

    // RLS automatically enforces user ownership
    const { data: ipsData, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('user_id')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ipsData) {
      return NextResponse.json({ error: 'IPS not found' }, { status: 403 });
    }

    // Pull factors configured for this IPS with factor metadata
    const { data, error } = await supabase
      .from('ips_factors')
      .select(`
        id,
        ips_id,
        factor_id,
        factor_name,
        weight,
        target_value,
        target_operator,
        target_value_max,
        preference_direction,
        collection_method,
        enabled,
        factor_definitions:factor_definitions (
          id,
          name,
          source,
          data_type,
          category,
          unit
        )
      `)
      .eq('ips_id', ipsId)
      .eq('enabled', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const shaped = (data ?? []).map((row: any) => {
      const meta = Array.isArray(row.factor_definitions) ? row.factor_definitions[0] : row.factor_definitions;
      const name = row.factor_name || meta?.name || 'Factor';
      const method = row.collection_method as string | null;
      const source: 'api' | 'manual' = method === 'api' ? 'api' : 'manual';

      return {
        id: row.factor_id || row.id,
        key: String(row.factor_id || normalizeKey(name)),
        name,
        source,
        weight: row.weight ?? 1,
        target: {
          operator: row.target_operator ?? undefined,
          min: row.target_operator === 'range' ? (row.target_value ?? undefined) : undefined,
          max: row.target_operator === 'range' ? (row.target_value_max ?? undefined) : undefined,
          value: row.target_operator !== 'range' ? (row.target_value ?? undefined) : undefined,
        },
        inputType: 'number' as const,
        options: undefined,
      };
    });

    return NextResponse.json(shaped, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
