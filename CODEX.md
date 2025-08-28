-- ─────────────────────────────────────────────────────────────────────────────
-- Make entry_date nullable ONLY if the column exists and is NOT NULL
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'trades'
      and column_name  = 'entry_date'
      and is_nullable  = 'NO'
  ) then
    execute 'alter table public.trades alter column entry_date drop not null';
  end if;
end $$;

-- Add strategy_type if missing + relaxed check constraint
alter table public.trades
  add column if not exists strategy_type text not null default 'unknown';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'trades_strategy_type_check') then
    alter table public.trades drop constraint trades_strategy_type_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_strategy_type_check_v2') then
    alter table public.trades
      add constraint trades_strategy_type_check_v2
      check (
        strategy_type in (
          'buy_hold','put_credit','call_credit','iron_condor','covered_call',
          'cash_secured_put','vertical_spread',
          'put-credit-spreads','call-credit-spreads','iron-condors',
          'covered-calls','long-calls','long-puts','buy-hold-stocks','unknown'
        )
      );
  end if;
end $$;

-- Indexes (remove duplicate ips index; keep one)
create index if not exists idx_trades_user_status on public.trades(user_id, status);
drop index if exists idx_trades_ips_id;
create index if not exists idx_trades_ips on public.trades(ips_id);
create index if not exists idx_trades_user_id on public.trades(user_id);
create index if not exists idx_trades_status on public.trades(status);
create index if not exists idx_trades_symbol on public.trades(symbol);

-- Trigger: create ONLY if it doesn't already exist
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'update_trades_updated_at') then
    create trigger update_trades_updated_at
    before update on public.trades
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- Trade factors table (safe to run repeatedly)
create table if not exists public.trade_factors (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  factor_name text not null,
  factor_value numeric null,
  source text null,         -- api | manual | scored
  confidence numeric null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trade_factors_trade on public.trade_factors(trade_id);
