-- Agent tables for options trading system
-- Run this in Supabase SQL Editor

create table if not exists option_chains_raw (
  id bigserial primary key,
  symbol text not null,
  asof timestamptz not null,
  payload jsonb not null,
  provider text not null default 'alpha_vantage',
  unique(symbol, asof, provider)
);

create table if not exists option_contracts (
  id bigserial primary key,
  symbol text not null,
  expiry date not null,
  strike numeric not null,
  option_type text not null check (option_type in ('C','P')),
  bid numeric,
  ask numeric,
  last numeric,
  iv numeric,
  delta numeric,
  gamma numeric,
  theta numeric,
  vega numeric,
  oi numeric,
  volume numeric,
  asof timestamptz not null,
  unique(symbol, expiry, strike, option_type, asof)
);

create index if not exists idx_option_contracts_symbol_asof on option_contracts(symbol, asof desc);

create table if not exists macro_series (
  series_id text not null,
  asof date not null,
  value numeric not null,
  primary key (series_id, asof)
);

create table if not exists datausa_series (
  data_key text not null,
  metric text not null,
  period date not null,
  value numeric not null,
  primary key (data_key, metric, period)
);

create table if not exists features_snapshot (
  id bigserial primary key,
  run_id uuid not null,
  symbol text not null,
  asof timestamptz not null,
  dte int,
  iv_rank numeric,
  term_slope numeric,
  put_skew numeric,
  volume_oi_ratio numeric,
  macro_regime text,
  custom jsonb
);

create table if not exists scores (
  id bigserial primary key,
  run_id uuid not null,
  symbol text not null,
  strategy text not null,
  score numeric not null,
  breakdown jsonb not null,
  version text not null
);

create table if not exists trade_candidates (
  id uuid primary key,
  run_id uuid not null,
  symbol text not null,
  strategy text not null,
  contract_legs jsonb not null,
  entry_mid numeric,
  est_pop numeric,
  breakeven numeric,
  max_loss numeric,
  max_profit numeric,
  rationale text,
  guardrail_flags jsonb
);

create table if not exists agent_runs (
  run_id uuid primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null check (mode in ('backtest','paper','live')),
  watchlist jsonb,
  data_hash text,
  outcome jsonb
);

create table if not exists tool_invocations (
  id bigserial primary key,
  run_id uuid not null,
  tool text not null,
  input jsonb not null,
  output_summary jsonb,
  latency_ms int,
  error text,
  created_at timestamptz default now()
);

create table if not exists trade_outcomes (
  candidate_id uuid references trade_candidates(id),
  opened_at timestamptz,
  closed_at timestamptz,
  pnl numeric,
  mdd numeric,
  notes text,
  primary key (candidate_id)
);
