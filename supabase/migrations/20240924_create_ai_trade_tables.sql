-- Create table to persist AI analysis outputs
create table if not exists ai_trade_analyses (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references trades(id) on delete set null,
  ips_score_calculation_id uuid references ips_score_calculations(id) on delete set null,
  baseline_score numeric,
  ai_raw_score numeric,
  final_score numeric,
  ai_adjustment numeric,
  drivers jsonb not null default '[]',
  features jsonb not null default '{}',
  benchmarks jsonb,
  playbook jsonb,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create index if not exists ai_trade_analyses_trade_id_idx on ai_trade_analyses(trade_id);

-- Cache table for volatility regime proxies / IV data
create table if not exists vol_regime_daily (
  symbol text not null,
  as_of_date date not null,
  hv30 double precision,
  hv30_rank double precision,
  atr14 double precision,
  atr_pct double precision,
  atr_pct_rank double precision,
  iv_atm_30d double precision,
  iv_rank double precision,
  provider text not null default 'proxy',
  created_at timestamptz not null default now(),
  primary key (symbol, as_of_date)
);

create index if not exists vol_regime_daily_symbol_date_desc_idx
  on vol_regime_daily(symbol, as_of_date desc);
