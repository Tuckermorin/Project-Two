import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET - Fetch single IPS with factors
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabase
      .from('ips_configurations')
      .select(`
        *,
        ips_factors (*)
      `)
      .eq('id', params.id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'IPS not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching IPS:', error);
    return NextResponse.json(
      { error: 'Failed to fetch IPS' },
      { status: 500 }
    );
  }
}

// PUT - Update IPS configuration
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { name, description, is_active, factors } = body;

    // Update IPS configuration
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    // If factors are provided, update aggregated stats
    if (factors && Array.isArray(factors)) {
      updateData.total_factors = factors.length;
      updateData.active_factors = factors.filter(f => f.enabled !== false).length;
      updateData.total_weight = factors.reduce((sum, f) => sum + f.weight, 0);
      updateData.avg_weight = factors.length > 0 
        ? updateData.total_weight / factors.length 
        : 0;
    }

    const { error: updateError } = await supabase
      .from('ips_configurations')
      .update(updateData)
      .eq('id', params.id);

    if (updateError) {
      throw new Error(`Failed to update IPS: ${updateError.message}`);
    }

    // If factors are provided, update them
    if (factors && Array.isArray(factors)) {
      // Delete existing factors
      await supabase
        .from('ips_factors')
        .delete()
        .eq('ips_id', params.id);

      // Insert new factors
      const factorRows = factors.map(factor => ({
        ips_id: params.id,
        factor_id: factor.factor_id,
        factor_name: factor.factor_name || factor.factor_id,
        weight: factor.weight,
        target_value: factor.target_value || null,
        target_operator: factor.target_operator || null,
        target_value_max: factor.target_value_max || null,
        preference_direction: factor.preference_direction || null,
        enabled: factor.enabled !== false
      }));

      const { error: factorsError } = await supabase
        .from('ips_factors')
        .insert(factorRows);

      if (factorsError) {
        throw new Error(`Failed to update factors: ${factorsError.message}`);
      }
    }

    // Return updated IPS
    const { data, error: fetchError } = await supabase
      .from('ips_configurations')
      .select(`
        *,
        ips_factors (*)
      `)
      .eq('id', params.id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch updated IPS: ${fetchError.message}`);
    }

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error updating IPS:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update IPS' },
      { status: 500 }
    );
  }
}

// DELETE - Delete IPS configuration
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await supabase
      .from('ips_configurations')
      .delete()
      .eq('id', params.id);

    if (error) {
      throw new Error(`Failed to delete IPS: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'IPS deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting IPS:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete IPS' },
      { status: 500 }
    );
  }
}