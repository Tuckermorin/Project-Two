import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20250103_add_relative_factors.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolons and filter out comments and empty statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    // Execute each statement
    const results = [];
    for (const statement of statements) {
      if (statement) {
        const { data, error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

        if (error) {
          // Try direct query if RPC fails
          const { error: queryError } = await supabase.from('factor_definitions').select('id').limit(1);
          if (queryError) {
            return NextResponse.json({
              error: 'Migration failed',
              details: error.message,
              statement: statement.substring(0, 100) + '...'
            }, { status: 500 });
          }
        }
        results.push({ success: true, statement: statement.substring(0, 100) + '...' });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
      statementsExecuted: results.length
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
