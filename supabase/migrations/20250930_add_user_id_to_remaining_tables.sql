-- Add user_id to all remaining tables and set up Row Level Security
-- This migration handles all tables that don't yet have user_id

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
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
  FOREACH t IN ARRAY tables LOOP
    -- Add column if missing
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = t
        AND column_name  = 'user_id'
    ) THEN
      RAISE NOTICE 'Adding user_id to table: %', t;

      -- Add user_id column with default auth.uid()
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id uuid DEFAULT auth.uid();', t);

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
  END LOOP;
END
$$;

-- Enable Row Level Security on all tables
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE datausa_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE factor_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE factor_score_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE features_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE macro_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_chains_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vol_regime_daily ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
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
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can manage their rows" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can read shared data" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role can manage data" ON %I;', t);
  END LOOP;
END
$$;

-- Create RLS policies for all tables
-- agent_runs
CREATE POLICY "Users can manage their rows"
ON agent_runs
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- datausa_series (shared reference data - read-only for users)
CREATE POLICY "Users can read shared data"
ON datausa_series
FOR SELECT
USING (true); -- All authenticated users can read

CREATE POLICY "Service role can manage data"
ON datausa_series
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- factor_definitions (shared reference data - read-only for users)
CREATE POLICY "Users can read shared data"
ON factor_definitions
FOR SELECT
USING (true); -- All authenticated users can read

CREATE POLICY "Service role can manage data"
ON factor_definitions
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- factor_score_details
CREATE POLICY "Users can manage their rows"
ON factor_score_details
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- features_snapshot
CREATE POLICY "Users can manage their rows"
ON features_snapshot
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- journal_entries
CREATE POLICY "Users can manage their rows"
ON journal_entries
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- macro_series (shared reference data - read-only for users)
CREATE POLICY "Users can read shared data"
ON macro_series
FOR SELECT
USING (true); -- All authenticated users can read

CREATE POLICY "Service role can manage data"
ON macro_series
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- option_chains_raw
CREATE POLICY "Users can manage their rows"
ON option_chains_raw
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- option_contracts
CREATE POLICY "Users can manage their rows"
ON option_contracts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- scores
CREATE POLICY "Users can manage their rows"
ON scores
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- tool_invocations
CREATE POLICY "Users can manage their rows"
ON tool_invocations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- trade_candidates
CREATE POLICY "Users can manage their rows"
ON trade_candidates
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- trade_closures
CREATE POLICY "Users can manage their rows"
ON trade_closures
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- trade_factors
CREATE POLICY "Users can manage their rows"
ON trade_factors
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- trade_outcomes
CREATE POLICY "Users can manage their rows"
ON trade_outcomes
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- vol_regime_daily (shared reference data - read-only for users)
CREATE POLICY "Users can read shared data"
ON vol_regime_daily
FOR SELECT
USING (true); -- All authenticated users can read

CREATE POLICY "Service role can manage data"
ON vol_regime_daily
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Summary of RLS policies:
-- ========================
-- User-specific tables (users can only see/modify their own data):
--   - agent_runs, factor_score_details, features_snapshot, journal_entries
--   - option_chains_raw, option_contracts, scores, tool_invocations
--   - trade_candidates, trade_closures, trade_factors, trade_outcomes
--
-- Shared reference data tables (all users can read, only service role can write):
--   - factor_definitions, macro_series, datausa_series, vol_regime_daily
