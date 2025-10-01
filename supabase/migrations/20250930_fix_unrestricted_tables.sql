-- Fix unrestricted tables by adding/fixing user_id and enabling RLS
-- This migration handles:
-- 1. Tables missing user_id: ai_trade_analyses, ips_score_calculations, ips_factors
-- 2. Tables with wrong user_id type: trades, ips_configurations

-- ============================================================================
-- PART 1: Add user_id to tables that don't have it
-- ============================================================================

DO $$
DECLARE
  first_user_id uuid;
BEGIN
  -- Get the first user from auth.users to use for backfilling
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;

  IF first_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users. Please create at least one user before running this migration.';
  END IF;

  RAISE NOTICE 'Using user ID % for backfilling existing data', first_user_id;

  -- 1. ai_trade_analyses
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_trade_analyses' AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'Adding user_id to ai_trade_analyses';

    ALTER TABLE public.ai_trade_analyses ADD COLUMN user_id uuid;

    -- Backfill existing rows
    UPDATE public.ai_trade_analyses SET user_id = first_user_id WHERE user_id IS NULL;

    -- Set constraints
    ALTER TABLE public.ai_trade_analyses ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE public.ai_trade_analyses ALTER COLUMN user_id SET DEFAULT auth.uid();

    -- Add foreign key
    ALTER TABLE public.ai_trade_analyses
      ADD CONSTRAINT ai_trade_analyses_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Create index
    CREATE INDEX ai_trade_analyses_user_id_idx ON public.ai_trade_analyses(user_id);

    RAISE NOTICE 'Successfully added user_id to ai_trade_analyses';
  END IF;

  -- 2. ips_score_calculations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ips_score_calculations' AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'Adding user_id to ips_score_calculations';

    ALTER TABLE public.ips_score_calculations ADD COLUMN user_id uuid;

    -- Backfill existing rows
    UPDATE public.ips_score_calculations SET user_id = first_user_id WHERE user_id IS NULL;

    -- Set constraints
    ALTER TABLE public.ips_score_calculations ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE public.ips_score_calculations ALTER COLUMN user_id SET DEFAULT auth.uid();

    -- Add foreign key
    ALTER TABLE public.ips_score_calculations
      ADD CONSTRAINT ips_score_calculations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Create index
    CREATE INDEX ips_score_calculations_user_id_idx ON public.ips_score_calculations(user_id);

    RAISE NOTICE 'Successfully added user_id to ips_score_calculations';
  END IF;

  -- 3. ips_factors
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ips_factors' AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'Adding user_id to ips_factors';

    ALTER TABLE public.ips_factors ADD COLUMN user_id uuid;

    -- Backfill existing rows
    UPDATE public.ips_factors SET user_id = first_user_id WHERE user_id IS NULL;

    -- Set constraints
    ALTER TABLE public.ips_factors ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE public.ips_factors ALTER COLUMN user_id SET DEFAULT auth.uid();

    -- Add foreign key
    ALTER TABLE public.ips_factors
      ADD CONSTRAINT ips_factors_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Create index
    CREATE INDEX ips_factors_user_id_idx ON public.ips_factors(user_id);

    RAISE NOTICE 'Successfully added user_id to ips_factors';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Fix user_id type on tables that have it as TEXT
-- ============================================================================

DO $$
DECLARE
  first_user_id uuid;
BEGIN
  -- Get the first user from auth.users
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;

  IF first_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users. Please create at least one user before running this migration.';
  END IF;

  -- 1. Fix trades table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trades'
      AND column_name = 'user_id'
      AND data_type = 'text'
  ) THEN
    RAISE NOTICE 'Converting trades.user_id from TEXT to UUID';

    -- Drop existing indexes and constraints
    DROP INDEX IF EXISTS idx_trades_user_id;
    DROP INDEX IF EXISTS idx_trades_user_status;

    -- Add new UUID column
    ALTER TABLE public.trades ADD COLUMN user_id_uuid uuid;

    -- Backfill: Set all rows to first user
    UPDATE public.trades SET user_id_uuid = first_user_id;

    -- Drop old column and rename new one
    ALTER TABLE public.trades DROP COLUMN user_id;
    ALTER TABLE public.trades RENAME COLUMN user_id_uuid TO user_id;

    -- Set constraints
    ALTER TABLE public.trades ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE public.trades ALTER COLUMN user_id SET DEFAULT auth.uid();

    -- Add foreign key
    ALTER TABLE public.trades
      ADD CONSTRAINT trades_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Recreate indexes
    CREATE INDEX idx_trades_user_id ON public.trades(user_id);
    CREATE INDEX idx_trades_user_status ON public.trades(user_id, status);

    RAISE NOTICE 'Successfully converted trades.user_id to UUID';
  END IF;

  -- 2. Fix ips_configurations table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ips_configurations'
      AND column_name = 'user_id'
      AND data_type = 'text'
  ) THEN
    RAISE NOTICE 'Converting ips_configurations.user_id from TEXT to UUID';

    -- Add new UUID column
    ALTER TABLE public.ips_configurations ADD COLUMN user_id_uuid uuid;

    -- Backfill: Set all rows to first user
    UPDATE public.ips_configurations SET user_id_uuid = first_user_id;

    -- Drop old column and rename new one
    ALTER TABLE public.ips_configurations DROP COLUMN user_id;
    ALTER TABLE public.ips_configurations RENAME COLUMN user_id_uuid TO user_id;

    -- Set constraints
    ALTER TABLE public.ips_configurations ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE public.ips_configurations ALTER COLUMN user_id SET DEFAULT auth.uid();

    -- Add foreign key
    ALTER TABLE public.ips_configurations
      ADD CONSTRAINT ips_configurations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- Create index
    CREATE INDEX ips_configurations_user_id_idx ON public.ips_configurations(user_id);

    RAISE NOTICE 'Successfully converted ips_configurations.user_id to UUID';
  END IF;
END $$;

-- ============================================================================
-- PART 3: Enable RLS and create policies for all affected tables
-- ============================================================================

DO $$
DECLARE
  t text;
  tables_to_secure text[] := ARRAY[
    'ai_trade_analyses',
    'ips_score_calculations',
    'ips_factors',
    'trades',
    'ips_configurations',
    'watchlist_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_secure LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    RAISE NOTICE 'Enabled RLS on %', t;

    -- Drop existing policies if any
    EXECUTE format('DROP POLICY IF EXISTS "Users can manage their rows" ON %I;', t);

    -- Create policy: Users can only access their own data
    EXECUTE format(
      'CREATE POLICY "Users can manage their rows" ON %I
       FOR ALL
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);',
      t
    );
    RAISE NOTICE 'Created RLS policy for %', t;
  END LOOP;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'Migration Complete!';
  RAISE NOTICE '==========================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables Secured:';
  RAISE NOTICE '  ✓ ai_trade_analyses - Added user_id uuid with RLS';
  RAISE NOTICE '  ✓ ips_score_calculations - Added user_id uuid with RLS';
  RAISE NOTICE '  ✓ ips_factors - Added user_id uuid with RLS';
  RAISE NOTICE '  ✓ trades - Converted user_id from TEXT to UUID with RLS';
  RAISE NOTICE '  ✓ ips_configurations - Converted user_id from TEXT to UUID with RLS';
  RAISE NOTICE '  ✓ watchlist_items - Enabled RLS (user_id already correct)';
  RAISE NOTICE '';
  RAISE NOTICE 'All tables now have proper RLS policies enforcing user isolation.';
  RAISE NOTICE 'All existing data has been assigned to the first user in auth.users.';
  RAISE NOTICE '==========================================================';
END $$;
