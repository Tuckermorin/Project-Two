// src/app/api/preferences/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/preferences?key=dashboard_columns
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const preferenceKey = searchParams.get('key');

    if (!preferenceKey) {
      return NextResponse.json({ error: 'Preference key is required' }, { status: 400 });
    }

    // Fetch preference from database
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preference_value')
      .eq('user_id', user.id)
      .eq('preference_key', preferenceKey)
      .single();

    if (error) {
      // If not found, return null (not an error)
      if (error.code === 'PGRST116') {
        return NextResponse.json({ key: preferenceKey, value: null });
      }
      throw error;
    }

    return NextResponse.json({
      key: preferenceKey,
      value: data?.preference_value || null
    });

  } catch (error: any) {
    console.error('Error fetching user preference:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch preference' },
      { status: 500 }
    );
  }
}

// POST /api/preferences
// Body: { key: string, value: any }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json({ error: 'Preference key is required' }, { status: 400 });
    }

    // Upsert preference (insert or update if exists)
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        preference_key: key,
        preference_value: value,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,preference_key'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      key,
      value: data.preference_value
    });

  } catch (error: any) {
    console.error('Error saving user preference:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save preference' },
      { status: 500 }
    );
  }
}

// DELETE /api/preferences?key=dashboard_columns
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const preferenceKey = searchParams.get('key');

    if (!preferenceKey) {
      return NextResponse.json({ error: 'Preference key is required' }, { status: 400 });
    }

    // Delete preference
    const { error } = await supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', user.id)
      .eq('preference_key', preferenceKey);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Preference deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting user preference:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete preference' },
      { status: 500 }
    );
  }
}
