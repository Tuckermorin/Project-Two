-- Add user_id to all remaining tables and set up Row Level Security
-- This migration handles tables with existing data properly

-- First, let's handle shared reference tables separately (they may have existing data)
-- These tables: factor_definitions, macro_series, datausa_series, vol_regime_daily

DO $$
DECLARE
  shared_tables text[] := ARRAY['factor_definitions', 'macro_series', 'datausa_series', 'vol_regime_daily'];
  t text;
BEGIN
  FOREACH t IN ARRAY shared_tables LOOP
    -- Check if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      -- Add column if missing (nullable for now)
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = t
          AND column_name  = 'user_id'
      ) THEN
        RAISE NOTICE 'Adding user_id to shared table: %', t;
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id uuid;', t);

        -- For shared tables, set a special system user ID for existing data
        -- This represents "system-owned" or "shared" data
        EXECUTE format('UPDATE public.%I SET user_id = %L WHERE user_id IS NULL;',
                      t, '00000000-0000-0000-0000-000000000001');

        -- Now set NOT NULL
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL;', t);

        -- Add foreign key with ON DELETE SET NULL (so deleting users doesn't delete shared data)
        EXECUTE format(
          'ALTER TABLE public.%I
             ADD CONSTRAINT %I
             FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;',
          t, t || '_user_id_fkey'
        );
      END IF;

      -- Create index if missing
      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname  = t || '_user_id_idx'
      ) THEN
        RAISE NOTICE 'Creating index on %', t;
        EXECUTE format('CREATE INDEX %I ON public.%I (user_id);', t || '_user_id_idx', t);
      END IF;
    END IF;
  END LOOP;
END
$$;

-- Now handle user-specific tables
DO $$
DECLARE
  t text;
  user_tables text[] := ARRAY[
    'agent_runs',
    'factor_score_details',
    'features_snapshot',
    'journal_entries',
    'option_chains_raw',
    'option_contracts',
    'scores',
    'tool_invocations',
    'trade_candidates',
    'trade_closures',
    'trade_factors',
    'trade_outcomes'
  ];
  first_user_id uuid;
BEGIN
  -- Try to get the first user from auth.users to use as default for existing data
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;

  IF first_user_id IS NULL THEN
    RAISE NOTICE 'No users found in auth.users - skipping user-specific tables';
    RAISE NOTICE 'Please create at least one user account before running this migration';
    RETURN;
  END IF;

  RAISE NOTICE 'Using user ID % for existing data', first_user_id;

  FOREACH t IN ARRAY user_tables LOOP
    -- Check if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      -- Add column if missing
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = t
          AND column_name  = 'user_id'
      ) THEN
        RAISE NOTICE 'Adding user_id to user table: %', t;

        -- Add user_id column (nullable initially)
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id uuid;', t);

        -- Backfill existing rows with first user
        EXECUTE format('UPDATE public.%I SET user_id = %L WHERE user_id IS NULL;', t, first_user_id);

        -- Set default for new rows
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT auth.uid();', t);

        -- Set NOT NULL
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL;', t);

        -- Add foreign key to auth.users
        EXECUTE format(
          'ALTER TABLE public.%I
             ADD CONSTRAINT %I
             FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
          t, t || '_user_id_fkey'
        );
      END IF;

      -- Create index if missing
      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname  = t || '_user_id_idx'
      ) THEN
        RAISE NOTICE 'Creating index on %', t;
        EXECUTE format('CREATE INDEX %I ON public.%I (user_id);', t || '_user_id_idx', t);
      END IF;
    END IF;
  END LOOP;
END
$$;

-- Enable Row Level Security on all tables (only if they exist)
DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'agent_runs',
    'datausa_series',
    'factor_definitions',
    'factor_score_details',
    'features_snapshot',
    'journal_entries',
    'macro_series',
    'option_chains_raw',
    'option_contracts',
    'scores',
    'tool_invocations',
    'trade_candidates',
    'trade_closures',
    'trade_factors',
    'trade_outcomes',
    'vol_regime_daily'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      RAISE NOTICE 'Enabled RLS on %', t;
    END IF;
  END LOOP;
END
$$;

-- Drop existing policies if they exist (to avoid conflicts)
DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'agent_runs',
    'datausa_series',
    'factor_definitions',
    'factor_score_details',
    'features_snapshot',
    'journal_entries',
    'macro_series',
    'option_chains_raw',
    'option_contracts',
    'scores',
    'tool_invocations',
    'trade_candidates',
    'trade_closures',
    'trade_factors',
    'trade_outcomes',
    'vol_regime_daily'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "Users can manage their rows" ON %I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "Users can read shared data" ON %I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "Service role can manage data" ON %I;', t);
    END IF;
  END LOOP;
END
$$;

-- Create RLS policies for user-specific tables
DO $$
DECLARE
  t text;
  user_tables text[] := ARRAY[
    'agent_runs',
    'factor_score_details',
    'features_snapshot',
    'journal_entries',
    'option_chains_raw',
    'option_contracts',
    'scores',
    'tool_invocations',
    'trade_candidates',
    'trade_closures',
    'trade_factors',
    'trade_outcomes'
  ];
BEGIN
  FOREACH t IN ARRAY user_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format(
        'CREATE POLICY "Users can manage their rows" ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
        t
      );
      RAISE NOTICE 'Created user policy for %', t;
    END IF;
  END LOOP;
END
$$;

-- Create RLS policies for shared reference data tables
DO $$
DECLARE
  t text;
  shared_tables text[] := ARRAY['factor_definitions', 'macro_series', 'datausa_series', 'vol_regime_daily'];
BEGIN
  FOREACH t IN ARRAY shared_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      -- Everyone can read
      EXECUTE format(
        'CREATE POLICY "Users can read shared data" ON %I FOR SELECT USING (true);',
        t
      );
      -- Only service role can write
      EXECUTE format(
        'CREATE POLICY "Service role can manage data" ON %I FOR ALL USING (auth.jwt() ->> ''role'' = ''service_role'') WITH CHECK (auth.jwt() ->> ''role'' = ''service_role'');',
        t
      );
      RAISE NOTICE 'Created shared data policies for %', t;
    END IF;
  END LOOP;
END
$$;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'User-specific tables: Users can only see their own data';
  RAISE NOTICE '  - agent_runs, factor_score_details, features_snapshot, journal_entries';
  RAISE NOTICE '  - option_chains_raw, option_contracts, scores, tool_invocations';
  RAISE NOTICE '  - trade_candidates, trade_closures, trade_factors, trade_outcomes';
  RAISE NOTICE '';
  RAISE NOTICE 'Shared reference data tables: All users can read, only service role can write';
  RAISE NOTICE '  - factor_definitions, macro_series, datausa_series, vol_regime_daily';
  RAISE NOTICE '==============================================';
END
$$;
