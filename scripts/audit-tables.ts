// Script to audit all Supabase tables and their schemas
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials!');
  console.error('SUPABASE_URL:', supabaseUrl);
  console.error('SUPABASE_KEY:', supabaseKey ? 'Present' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface TableInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableStats {
  table_name: string;
  row_count: number;
}

async function auditTables() {
  console.log('='.repeat(80));
  console.log('SUPABASE TABLE AUDIT');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Get all public tables
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_all_public_tables');

    if (tablesError) {
      // Fallback: Query information_schema directly
      console.log('Using information_schema query...');

      const { data: tableNames, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .order('table_name');

      if (error) {
        console.error('Error fetching tables:', error);

        // Use manual list from migrations
        const manualTables = [
          'trades',
          'ips_configurations',
          'ips_factors',
          'factor_definitions',
          'watchlist_items',
          'trade_snapshots',
          'trade_embeddings',
          'snapshot_embeddings',
          'trade_postmortems',
          'trade_monitor_cache',
          'iv_cache',
          'vol_regime_daily',
          'api_sync_log',
          'news_sentiment_history',
          'insider_transactions_history',
          'daily_market_context',
          'reddit_sentiment',
        ];

        await auditManualTables(manualTables);
        return;
      }
    }

    // For each table, get detailed schema
    await getDetailedSchemas();

  } catch (error) {
    console.error('Audit failed:', error);
  }
}

async function auditManualTables(tableNames: string[]) {
  const results: any = {};

  console.log(`\nAuditing ${tableNames.length} tables...\n`);

  for (const tableName of tableNames) {
    try {
      // Get row count
      const { count, error: countError } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      // Get sample row to infer schema
      const { data: sample, error: sampleError } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (countError) {
        console.log(`❌ ${tableName}: Error - ${countError.message}`);
        continue;
      }

      const columns = sample && sample.length > 0
        ? Object.keys(sample[0])
        : [];

      results[tableName] = {
        row_count: count || 0,
        columns: columns,
        sample: sample && sample.length > 0 ? sample[0] : null
      };

      console.log(`✅ ${tableName}: ${count || 0} rows, ${columns.length} columns`);
      console.log(`   Columns: ${columns.join(', ')}`);
      console.log('');

    } catch (error: any) {
      console.log(`❌ ${tableName}: ${error.message}`);
    }
  }

  // Write results to file
  const output = JSON.stringify(results, null, 2);
  fs.writeFileSync('table-audit-results.json', output);
  console.log('\n✅ Results written to table-audit-results.json');

  // Analyze for redundancies
  analyzeRedundancies(results);
}

function analyzeRedundancies(results: any) {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('REDUNDANCY ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  // Group tables by common patterns
  const groups: Record<string, string[]> = {
    'Trade Related': [],
    'IPS Related': [],
    'Market Data': [],
    'Sentiment/News': [],
    'Cache/Sync': [],
    'RAG/Embeddings': [],
    'Monitoring': [],
  };

  Object.keys(results).forEach(table => {
    if (table.includes('trade') || table.includes('postmortem')) {
      groups['Trade Related'].push(table);
    } else if (table.includes('ips') || table.includes('factor')) {
      groups['IPS Related'].push(table);
    } else if (table.includes('iv_') || table.includes('vol_') || table.includes('watchlist')) {
      groups['Market Data'].push(table);
    } else if (table.includes('sentiment') || table.includes('news') || table.includes('insider')) {
      groups['Sentiment/News'].push(table);
    } else if (table.includes('cache') || table.includes('sync')) {
      groups['Cache/Sync'].push(table);
    } else if (table.includes('embedding')) {
      groups['RAG/Embeddings'].push(table);
    } else if (table.includes('monitor')) {
      groups['Monitoring'].push(table);
    }
  });

  // Print groups
  Object.entries(groups).forEach(([category, tables]) => {
    if (tables.length > 0) {
      console.log(`\n${category}:`);
      tables.forEach(table => {
        const info = results[table];
        console.log(`  - ${table} (${info.row_count} rows, ${info.columns.length} cols)`);
      });
    }
  });

  // Look for common columns across tables
  console.log('\n\nCOMMON COLUMN PATTERNS:');
  const columnFrequency: Record<string, string[]> = {};

  Object.entries(results).forEach(([table, info]: [string, any]) => {
    info.columns.forEach((col: string) => {
      if (!columnFrequency[col]) {
        columnFrequency[col] = [];
      }
      columnFrequency[col].push(table);
    });
  });

  // Show columns that appear in multiple tables
  const commonColumns = Object.entries(columnFrequency)
    .filter(([col, tables]) => tables.length > 3 && col !== 'id' && col !== 'created_at' && col !== 'updated_at')
    .sort((a, b) => b[1].length - a[1].length);

  commonColumns.slice(0, 10).forEach(([col, tables]) => {
    console.log(`\n${col} (${tables.length} tables):`);
    console.log(`  ${tables.join(', ')}`);
  });
}

async function getDetailedSchemas() {
  // This would require a custom SQL function or RPC call
  console.log('Detailed schema query not available via Supabase client');
  console.log('Using fallback method...');
}

// Run the audit
auditTables();
