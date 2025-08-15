import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ALL_FACTORS } from '@/lib/services/ips-data-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET - Fetch all IPS configurations
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('ips_configurations')
      .select(`
        *,
        ips_factors (
          id,
          factor_id,
          factor_name,
          weight,
          target_value,
          target_operator,
          target_value_max,
          preference_direction,
          enabled
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch IPS configurations: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error fetching IPS configurations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch IPS configurations' },
      { status: 500 }
    );
  }
}

// POST - Create new IPS configuration
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      user_id = 'default-user',
      name,
      description,
      is_active = false,
      factors = []
    } = body;

    if (!name || !Array.isArray(factors)) {
      return NextResponse.json(
        { error: 'Name and factors array are required' },
        { status: 400 }
      );
    }

    // Validate factors
    for (const factor of factors) {
      if (!factor.factor_id || !factor.weight) {
        return NextResponse.json(
          { error: 'Each factor must have factor_id and weight' },
          { status: 400 }
        );
      }
      if (factor.weight < 1 || factor.weight > 10) {
        return NextResponse.json(
          { error: 'Factor weight must be between 1 and 10' },
          { status: 400 }
        );
      }
    }

    // Calculate aggregated stats
    const total_factors = factors.length;
    const active_factors = factors.filter(f => f.enabled !== false).length;
    const total_weight = factors.reduce((sum, f) => sum + f.weight, 0);
    const avg_weight = total_factors > 0 ? total_weight / total_factors : 0;

    // 1. Create IPS configuration
    const { data: ipsConfig, error: ipsError } = await supabase
      .from('ips_configurations')
      .insert({
        user_id,
        name,
        description,
        is_active,
        total_factors,
        active_factors,
        total_weight,
        avg_weight
      })
      .select()
      .single();

    if (ipsError) {
      throw new Error(`Failed to create IPS: ${ipsError.message}`);
    }

    // 2. Insert factors
    const factorRows = factors.map(factor => {
      // Get factor info from ALL_FACTORS
      const factorDef = ALL_FACTORS.find(f => f.id === factor.factor_id);
      
      return {
        ips_id: ipsConfig.id,
        factor_id: factor.factor_id,
        factor_name: factorDef?.name || factor.factor_name || factor.factor_id,
        weight: factor.weight,
        target_value: factor.target_value || null,
        target_operator: factor.target_operator || null,
        target_value_max: factor.target_value_max || null,
        preference_direction: factor.preference_direction || null,
        enabled: factor.enabled !== false
      };
    });

    const { error: factorsError } = await supabase
      .from('ips_factors')
      .insert(factorRows);

    if (factorsError) {
      // Rollback - delete the IPS config if factors failed
      await supabase.from('ips_configurations').delete().eq('id', ipsConfig.id);
      throw new Error(`Failed to add factors: ${factorsError.message}`);
    }

    // 3. Return the complete IPS with factors
    const { data: completeIPS, error: fetchError } = await supabase
      .from('ips_configurations')
      .select(`
        *,
        ips_factors (*)
      `)
      .eq('id', ipsConfig.id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch created IPS: ${fetchError.message}`);
    }

    return NextResponse.json({
      success: true,
      data: completeIPS
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating IPS:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create IPS' },
      { status: 500 }
    );
  }
}