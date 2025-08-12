import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { data, error } = await supabase
      .from('investment_performance_systems')
      .insert(body)
      .select()
      .single();

    if (error) {
      console.error('Error inserting IPS:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Inserted IPS:', data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('Unexpected error inserting IPS:', err);
    return NextResponse.json({ error: 'Failed to insert IPS' }, { status: 500 });
  }
}

