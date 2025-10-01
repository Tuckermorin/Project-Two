Got it—here’s a single Postgres/Supabase-safe migration you can paste into Claude. It adds a `user_id` column to every listed table **iff it’s missing**, backfills with a default, makes it `NOT NULL`, and creates an index.

> **Note:** You’ve used `text` + default `'default-user'` in `trades`, so I matched that. If you’d rather use the Supabase-native pattern (`uuid` default `auth.uid()` referencing `auth.users`), I included an alternate snippet below.

### Migration (matches your existing pattern: `text NOT NULL DEFAULT 'default-user'`)

```sql
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agent_runs',
    'ai_trade_analyses',
    'datausa_series',
    'factor_definitions',
    'factor_score_details',
    'features_snapshot',
    'ips_configurations',
    'ips_factors',
    'ips_score_calculations',
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
    'trades',
    'vol_regime_daily',
    'watchlist_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- add column if missing
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = t
        AND column_name  = 'user_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id text DEFAULT %L;', t, 'default-user');
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL;', t);
    END IF;

    -- create index if missing
    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname  = t || ''_user_id_idx''
    ) THEN
      EXECUTE format('CREATE INDEX %I ON public.%I (user_id);', t || '_user_id_idx', t);
    END IF;
  END LOOP;
END
$$;
```

### (Recommended) Supabase-native variant (`uuid` + default `auth.uid()` + FK)

If you want to standardize on the usual Supabase approach going forward:

```sql
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agent_runs',
    'ai_trade_analyses',
    'datausa_series',
    'factor_definitions',
    'factor_score_details',
    'features_snapshot',
    'ips_configurations',
    'ips_factors',
    'ips_score_calculations',
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
    'trades',
    'vol_regime_daily',
    'watchlist_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- add column if missing
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = t
        AND column_name  = 'user_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id uuid DEFAULT auth.uid();', t);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL;', t);
      -- add FK to auth.users if not present
      EXECUTE format(
        'ALTER TABLE public.%I
           ADD CONSTRAINT %I
           FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;',
        t, t || '_user_id_fkey'
      );
    END IF;

    -- create index if missing
    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname  = t || ''_user_id_idx''
    ) THEN
      EXECUTE format('CREATE INDEX %I ON public.%I (user_id);', t || '_user_id_idx', t);
    END IF;
  END LOOP;
END
$$;
```

**Optional next step (when you’re ready for RLS):**

* Enable RLS on each table and add policies like:

```sql
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their rows"
ON public.trades
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```


