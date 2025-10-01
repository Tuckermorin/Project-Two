create table public.trade_candidates (
  id uuid not null default gen_random_uuid (),
  run_id uuid not null,
  symbol text not null,
  strategy text not null,
  contract_legs jsonb not null,
  entry_mid numeric null,
  est_pop numeric null,
  breakeven numeric null,
  max_loss numeric null,
  max_profit numeric null,
  rationale text null,
  guardrail_flags jsonb null,
  user_id uuid not null default auth.uid (),
  constraint trade_candidates_pkey primary key (id),
  constraint trade_candidates_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_candidates_runid on public.trade_candidates using btree (run_id) TABLESPACE pg_default;

create index IF not exists trade_candidates_user_id_idx on public.trade_candidates using btree (user_id) TABLESPACE pg_default;

create table public.trade_closures (
  id uuid not null default gen_random_uuid (),
  trade_id uuid not null,
  close_method text not null,
  close_date timestamp with time zone not null,
  underlying_price_at_close numeric null,
  cost_to_close_per_spread numeric null,
  exit_premium_per_contract numeric null,
  contracts_closed integer null,
  shares_sold integer null,
  sell_price numeric null,
  assigned_shares integer null,
  assigned_strike numeric null,
  commissions_total numeric null,
  fees_total numeric null,
  realized_pl numeric null,
  realized_pl_percent numeric null,
  notes text null,
  raw jsonb null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  ips_name text null,
  user_id uuid not null default auth.uid (),
  constraint trade_closures_pkey primary key (id),
  constraint trade_closures_trade_id_key unique (trade_id),
  constraint trade_closures_trade_id_fkey foreign KEY (trade_id) references trades (id) on delete CASCADE,
  constraint trade_closures_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_trade_closures_trade on public.trade_closures using btree (trade_id) TABLESPACE pg_default;

create index IF not exists trade_closures_user_id_idx on public.trade_closures using btree (user_id) TABLESPACE pg_default;

create table public.trade_factors (
  id uuid not null default gen_random_uuid (),
  trade_id uuid not null,
  factor_name text not null,
  factor_value numeric null,
  source text null,
  confidence numeric null,
  created_at timestamp with time zone not null default now(),
  user_id uuid not null default auth.uid (),
  constraint trade_factors_pkey primary key (id),
  constraint trade_factors_trade_id_fkey foreign KEY (trade_id) references trades (id) on delete CASCADE,
  constraint trade_factors_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_trade_factors_trade on public.trade_factors using btree (trade_id) TABLESPACE pg_default;

create index IF not exists trade_factors_user_id_idx on public.trade_factors using btree (user_id) TABLESPACE pg_default;

create table public.trade_outcomes (
  candidate_id uuid not null,
  opened_at timestamp with time zone null,
  closed_at timestamp with time zone null,
  pnl numeric null,
  mdd numeric null,
  notes text null,
  user_id uuid not null default auth.uid (),
  constraint trade_outcomes_pkey primary key (candidate_id),
  constraint trade_outcomes_candidate_id_fkey foreign KEY (candidate_id) references trade_candidates (id),
  constraint trade_outcomes_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists trade_outcomes_user_id_idx on public.trade_outcomes using btree (user_id) TABLESPACE pg_default;

create table public.trades (
  id uuid not null default gen_random_uuid (),
  user_id text not null default 'default-user'::text,
  ips_id uuid null,
  symbol text not null,
  strategy_type text not null,
  entry_date date null,
  expiration_date date null,
  exit_date date null,
  status text not null default 'prospective'::text,
  quantity integer null default 1,
  entry_price numeric null,
  exit_price numeric null,
  strike_price numeric null,
  strike_price_short numeric null,
  strike_price_long numeric null,
  premium_collected numeric null,
  premium_paid numeric null,
  contracts integer null default 1,
  ips_score numeric null,
  factors_met integer null,
  total_factors integer null,
  evaluation_notes text null,
  realized_pnl numeric null,
  commission numeric null default 0,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  ips_score_calculation_id uuid null,
  name text null,
  contract_type text null,
  current_price numeric null,
  number_of_contracts integer null,
  short_strike numeric null,
  long_strike numeric null,
  credit_received numeric null,
  max_gain numeric null,
  max_loss numeric null,
  spread_width numeric null,
  closed_at timestamp with time zone null,
  realized_pl numeric null,
  realized_pl_percent numeric null,
  ips_name text null,
  constraint trades_pkey primary key (id),
  constraint trades_ips_id_fkey foreign KEY (ips_id) references ips_configurations (id) on delete set null,
  constraint trades_status_check check (
    (
      status = any (
        array[
          'prospective'::text,
          'active'::text,
          'closed'::text,
          'expired'::text,
          'cancelled'::text
        ]
      )
    )
  ),
  constraint trades_strategy_type_check_v2 check (
    (
      strategy_type = any (
        array[
          'buy_hold'::text,
          'put_credit'::text,
          'call_credit'::text,
          'iron_condor'::text,
          'covered_call'::text,
          'cash_secured_put'::text,
          'vertical_spread'::text,
          'put-credit-spreads'::text,
          'call-credit-spreads'::text,
          'iron-condors'::text,
          'covered-calls'::text,
          'long-calls'::text,
          'long-puts'::text,
          'buy-hold-stocks'::text,
          'unknown'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_trades_user_status on public.trades using btree (user_id, status) TABLESPACE pg_default;

create index IF not exists idx_trades_ips on public.trades using btree (ips_id) TABLESPACE pg_default;

create index IF not exists idx_trades_user_id on public.trades using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_trades_status on public.trades using btree (status) TABLESPACE pg_default;

create index IF not exists idx_trades_symbol on public.trades using btree (symbol) TABLESPACE pg_default;

create trigger update_trades_updated_at BEFORE
update on trades for EACH row
execute FUNCTION update_updated_at_column ();

create table public.ips_factors (
  id uuid not null default gen_random_uuid (),
  ips_id uuid not null,
  factor_id text not null,
  factor_name text not null,
  weight integer not null,
  target_value numeric null,
  target_operator text null,
  target_value_max numeric null,
  preference_direction text null,
  enabled boolean null default true,
  created_at timestamp with time zone null default now(),
  collection_method text null,
  constraint ips_factors_pkey primary key (id),
  constraint unique_ips_factor unique (ips_id, factor_id),
  constraint ips_factors_factor_id_fkey foreign KEY (factor_id) references factor_definitions (id),
  constraint ips_factors_ips_id_fkey foreign KEY (ips_id) references ips_configurations (id) on delete CASCADE,
  constraint ips_factors_preference_direction_check check (
    (
      preference_direction = any (
        array['higher'::text, 'lower'::text, 'target'::text]
      )
    )
  ),
  constraint ips_factors_collection_method_check check (
    (
      collection_method = any (array['api'::text, 'manual'::text])
    )
  ),
  constraint ips_factors_target_operator_check check (
    (
      target_operator = any (
        array[
          'gte'::text,
          'lte'::text,
          'eq'::text,
          'range'::text
        ]
      )
    )
  ),
  constraint ips_factors_weight_check check (
    (
      (weight >= 1)
      and (weight <= 10)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_ips_factors_collection_method on public.ips_factors using btree (collection_method) TABLESPACE pg_default;

create unique INDEX IF not exists ips_factors_unique_ips_factor on public.ips_factors using btree (ips_id, factor_id) TABLESPACE pg_default;

create index IF not exists idx_ips_factors_ips_id on public.ips_factors using btree (ips_id) TABLESPACE pg_default;

create index IF not exists idx_ips_factors_factor_id on public.ips_factors using btree (factor_id) TABLESPACE pg_default;

create table public.ips_configurations (
  id uuid not null default gen_random_uuid (),
  user_id text not null default 'default-user'::text,
  name text not null,
  description text null,
  is_active boolean null default false,
  total_factors integer null default 0,
  active_factors integer null default 0,
  total_weight numeric null default 0,
  avg_weight numeric null default 0,
  win_rate numeric null,
  avg_roi numeric null,
  total_trades integer null default 0,
  created_at timestamp with time zone null default now(),
  last_modified timestamp with time zone null default now(),
  api_factors integer null default 0,
  manual_factors integer null default 0,
  strategies jsonb not null default '[]'::jsonb,
  constraint ips_configurations_pkey primary key (id)
) TABLESPACE pg_default;

create trigger update_ips_configurations_last_modified BEFORE
update on ips_configurations for EACH row
execute FUNCTION update_last_modified_column ();