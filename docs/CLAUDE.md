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

create table public.agent_runs (
  run_id uuid not null,
  started_at timestamp with time zone not null,
  finished_at timestamp with time zone null,
  mode text not null,
  watchlist jsonb null,
  data_hash text null,
  outcome jsonb null,
  user_id uuid not null default auth.uid (),
  constraint agent_runs_pkey primary key (run_id),
  constraint agent_runs_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint agent_runs_mode_check check (
    (
      mode = any (
        array['backtest'::text, 'paper'::text, 'live'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists agent_runs_user_id_idx on public.agent_runs using btree (user_id) TABLESPACE pg_default;

create table public.ai_trade_analyses (
  id uuid not null default gen_random_uuid (),
  trade_id uuid null,
  ips_score_calculation_id uuid null,
  baseline_score numeric null,
  ai_raw_score numeric null,
  final_score numeric null,
  ai_adjustment numeric null,
  drivers jsonb not null default '[]'::jsonb,
  features jsonb not null default '{}'::jsonb,
  benchmarks jsonb null,
  playbook jsonb null,
  model text null,
  prompt_version text null,
  created_at timestamp with time zone not null default now(),
  constraint ai_trade_analyses_pkey primary key (id),
  constraint ai_trade_analyses_ips_score_calculation_id_fkey foreign KEY (ips_score_calculation_id) references ips_score_calculations (id) on delete set null,
  constraint ai_trade_analyses_trade_id_fkey foreign KEY (trade_id) references trades (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists ai_trade_analyses_trade_id_idx on public.ai_trade_analyses using btree (trade_id) TABLESPACE pg_default;

create table public.datausa_series (
  key text not null,
  metric text not null,
  period date not null,
  value numeric not null,
  user_id uuid null,
  constraint datausa_series_pkey primary key (key, metric, period)
) TABLESPACE pg_default;

create index IF not exists datausa_series_user_id_idx on public.datausa_series using btree (user_id) TABLESPACE pg_default;

create table public.factor_definitions (
  id text not null,
  name text not null,
  type text not null,
  category text not null,
  data_type text not null,
  unit text not null,
  source text null,
  description text null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  user_id uuid null,
  constraint factor_definitions_pkey primary key (id),
  constraint factor_definitions_data_type_check check (
    (
      data_type = any (
        array[
          'numeric'::text,
          'percentage'::text,
          'currency'::text,
          'rating'::text,
          'boolean'::text
        ]
      )
    )
  ),
  constraint factor_definitions_type_check check (
    (
      type = any (
        array[
          'quantitative'::text,
          'qualitative'::text,
          'options'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists factor_definitions_user_id_idx on public.factor_definitions using btree (user_id) TABLESPACE pg_default;

create table public.factor_score_details (
  id uuid not null default gen_random_uuid (),
  ips_score_calculation_id uuid not null,
  factor_name text not null,
  factor_value numeric null,
  weight integer null,
  individual_score numeric null,
  weighted_score numeric null,
  target_met boolean null,
  created_at timestamp with time zone not null default now(),
  user_id uuid not null default auth.uid (),
  constraint factor_score_details_pkey primary key (id),
  constraint factor_score_details_ips_score_calculation_id_fkey foreign KEY (ips_score_calculation_id) references ips_score_calculations (id) on delete CASCADE,
  constraint factor_score_details_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_factor_score_calc on public.factor_score_details using btree (ips_score_calculation_id) TABLESPACE pg_default;

create index IF not exists factor_score_details_user_id_idx on public.factor_score_details using btree (user_id) TABLESPACE pg_default;

create table public.features_snapshot (
  id bigserial not null,
  run_id uuid not null,
  symbol text not null,
  asof timestamp with time zone not null,
  dte integer null,
  iv_rank numeric null,
  term_slope numeric null,
  put_skew numeric null,
  volume_oi_ratio numeric null,
  macro_regime text null,
  custom jsonb null,
  user_id uuid not null default auth.uid (),
  constraint features_snapshot_pkey primary key (id),
  constraint features_snapshot_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_features_symbol_asof on public.features_snapshot using btree (symbol, asof desc) TABLESPACE pg_default;

create index IF not exists features_snapshot_user_id_idx on public.features_snapshot using btree (user_id) TABLESPACE pg_default;

create table public.ips_score_calculations (
  id uuid not null default gen_random_uuid (),
  ips_id uuid not null,
  trade_id uuid null,
  final_score numeric not null,
  total_weight numeric not null,
  factors_used integer not null,
  targets_met integer not null,
  target_percentage numeric not null,
  calculation_details jsonb null,
  created_at timestamp with time zone not null default now(),
  constraint ips_score_calculations_pkey primary key (id),
  constraint ips_score_calculations_ips_id_fkey foreign KEY (ips_id) references ips_configurations (id) on delete CASCADE,
  constraint ips_score_calculations_trade_id_fkey foreign KEY (trade_id) references trades (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_ips_score_calc_ips on public.ips_score_calculations using btree (ips_id) TABLESPACE pg_default;

create table public.journal_entries (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  title text not null,
  content text not null,
  week_of date null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint journal_entries_pkey primary key (id),
  constraint journal_entries_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists journal_entries_user_id_idx on public.journal_entries using btree (user_id) TABLESPACE pg_default;

create trigger trg_journal_updated_at BEFORE
update on journal_entries for EACH row
execute FUNCTION update_watchlist_updated_at ();

create table public.macro_series (
  series_id text not null,
  asof date not null,
  value numeric not null,
  user_id uuid null,
  constraint macro_series_pkey primary key (series_id, asof)
) TABLESPACE pg_default;

create index IF not exists macro_series_user_id_idx on public.macro_series using btree (user_id) TABLESPACE pg_default;

create table public.option_chains_raw (
  id bigserial not null,
  symbol text not null,
  asof timestamp with time zone not null,
  payload jsonb not null,
  provider text not null default 'alpha_vantage'::text,
  user_id uuid not null default auth.uid (),
  constraint option_chains_raw_pkey primary key (id),
  constraint option_chains_raw_symbol_asof_provider_key unique (symbol, asof, provider),
  constraint option_chains_raw_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists option_chains_raw_user_id_idx on public.option_chains_raw using btree (user_id) TABLESPACE pg_default;

create table public.option_contracts (
  id bigserial not null,
  symbol text not null,
  expiry date not null,
  strike numeric not null,
  option_type text not null,
  bid numeric null,
  ask numeric null,
  last numeric null,
  iv numeric null,
  delta numeric null,
  gamma numeric null,
  theta numeric null,
  vega numeric null,
  oi numeric null,
  volume numeric null,
  asof timestamp with time zone not null,
  user_id uuid not null default auth.uid (),
  constraint option_contracts_pkey primary key (id),
  constraint option_contracts_symbol_expiry_strike_option_type_asof_key unique (symbol, expiry, strike, option_type, asof),
  constraint option_contracts_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint option_contracts_option_type_check check ((option_type = any (array['C'::text, 'P'::text])))
) TABLESPACE pg_default;

create index IF not exists idx_option_contracts_symbol_asof on public.option_contracts using btree (symbol, asof desc) TABLESPACE pg_default;

create index IF not exists idx_option_contracts_liquidity on public.option_contracts using btree (symbol, expiry, option_type, oi, volume) TABLESPACE pg_default;

create index IF not exists option_contracts_user_id_idx on public.option_contracts using btree (user_id) TABLESPACE pg_default;

create table public.scores (
  id bigserial not null,
  run_id uuid not null,
  symbol text not null,
  strategy text not null,
  score numeric not null,
  breakdown jsonb not null,
  version text not null,
  user_id uuid not null default auth.uid (),
  constraint scores_pkey primary key (id),
  constraint scores_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_scores_runid on public.scores using btree (run_id) TABLESPACE pg_default;

create index IF not exists scores_user_id_idx on public.scores using btree (user_id) TABLESPACE pg_default;

create table public.tool_invocations (
  id bigserial not null,
  run_id uuid not null,
  tool text not null,
  input jsonb not null,
  output_summary jsonb null,
  latency_ms integer null,
  error text null,
  created_at timestamp with time zone null default now(),
  user_id uuid not null default auth.uid (),
  constraint tool_invocations_pkey primary key (id),
  constraint tool_invocations_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists tool_invocations_user_id_idx on public.tool_invocations using btree (user_id) TABLESPACE pg_default;

create table public.vol_regime_daily (
  symbol text not null,
  as_of_date date not null,
  hv30 double precision null,
  hv30_rank double precision null,
  atr14 double precision null,
  atr_pct double precision null,
  atr_pct_rank double precision null,
  iv_atm_30d double precision null,
  iv_rank double precision null,
  provider text not null default 'proxy'::text,
  created_at timestamp with time zone not null default now(),
  user_id uuid null,
  constraint vol_regime_daily_pkey primary key (symbol, as_of_date)
) TABLESPACE pg_default;

create index IF not exists vol_regime_daily_symbol_date_desc_idx on public.vol_regime_daily using btree (symbol, as_of_date desc) TABLESPACE pg_default;

create index IF not exists vol_regime_daily_user_id_idx on public.vol_regime_daily using btree (user_id) TABLESPACE pg_default;

create table public.watchlist_items (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  symbol text not null,
  company_name text null,
  sector text null,
  notes text null,
  current_price numeric null,
  change numeric null,
  change_percent numeric null,
  market_cap numeric null,
  pe_ratio numeric null,
  dividend_yield numeric null,
  beta numeric null,
  analyst_target_price numeric null,
  eps numeric null,
  volume numeric null,
  currency text null,
  week52_high numeric null,
  week52_low numeric null,
  last_refreshed timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint watchlist_items_pkey primary key (id),
  constraint watchlist_items_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger trg_watchlist_updated_at BEFORE
update on watchlist_items for EACH row
execute FUNCTION update_watchlist_updated_at ();