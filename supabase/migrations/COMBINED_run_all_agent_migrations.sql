-- COMBINED MIGRATION SCRIPT
-- Run this in Supabase SQL Editor to set up all agent tables
-- This combines three migrations in the correct order

-- ============================================================================
-- MIGRATION 1: Create Base Agent Tables (20250930)
-- ============================================================================

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

-- ============================================================================
-- MIGRATION 2: Add user_id columns and RLS (20251119)
-- ============================================================================

-- Add user_id column to agent_runs
ALTER TABLE agent_runs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for efficient querying by user_id
CREATE INDEX IF NOT EXISTS agent_runs_user_id_idx ON agent_runs(user_id, finished_at DESC);

-- Enable RLS
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own agent runs" ON agent_runs;
DROP POLICY IF EXISTS "Service role can insert agent runs" ON agent_runs;
DROP POLICY IF EXISTS "Service role can update agent runs" ON agent_runs;

-- Policy: Users can view their own agent runs
CREATE POLICY "Users can view own agent runs"
  ON agent_runs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can insert agent runs (for background jobs)
CREATE POLICY "Service role can insert agent runs"
  ON agent_runs
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update agent runs (for background jobs)
CREATE POLICY "Service role can update agent runs"
  ON agent_runs
  FOR UPDATE
  USING (true);

-- Add user_id column to trade_candidates
ALTER TABLE trade_candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add created_at column to trade_candidates if it doesn't exist
ALTER TABLE trade_candidates
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Create index for trade_candidates
CREATE INDEX IF NOT EXISTS trade_candidates_user_id_idx ON trade_candidates(user_id, created_at DESC);

-- Enable RLS on trade_candidates
ALTER TABLE trade_candidates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own trade candidates" ON trade_candidates;
DROP POLICY IF EXISTS "Service role can insert trade candidates" ON trade_candidates;
DROP POLICY IF EXISTS "Service role can update trade candidates" ON trade_candidates;

-- Policy: Users can view their own trade candidates
CREATE POLICY "Users can view own trade candidates"
  ON trade_candidates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can insert trade candidates
CREATE POLICY "Service role can insert trade candidates"
  ON trade_candidates
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update trade candidates
CREATE POLICY "Service role can update trade candidates"
  ON trade_candidates
  FOR UPDATE
  USING (true);
