Trade Close/Expiration Details — Requirements Needed

Goal: Add a third action “Enter Close Details” so we can capture final outcomes when a trade is manually closed or expires, and persist them for analytics/history.

Decisions To Confirm
- Persistence: Confirm we should persist close details in Supabase (recommended) rather than only localStorage. If yes, approve the schema below.
- Close Methods: Confirm allowed values for how a trade ends: manual_close, expired_worthless, expired_itm_assigned, rolled, stop_hit, target_hit, risk_rules_exit, other.
- Required Fields: Confirm the minimal fields to require for save (see per‑strategy list). Do we require commissions/fees?
- Label/Placement: Confirm the button label “Enter Close Details” and that it appears:
  - In historic trades list row actions (currently “View Details” and “Add Lesson”).
  - In active trades when clicking “Close” (show the same dialog before status changes).
- Auto‑expiration: When DTE < 0, should we auto‑create a closure with default reason “expired_worthless” and cost 0, or leave as closed with “details needed” and prompt the user?

Close Details Fields
- Base (all strategies): close_date, close_method, underlying_price_at_close, commissions_total, fees_total, realized_pl_dollar, realized_pl_percent, notes.
- Spreads (put-credit-spread, call-credit-spread, iron-condor): cost_to_close_per_spread, contracts_closed (default = number_of_contracts).
- Long options (long-call, long-put): exit_premium_per_contract, contracts_closed.
- Covered calls: indicate outcome one of [closed_call, assigned, expired], exit_premium_per_contract (if closed), assigned_shares, assigned_strike (if assigned).
- Buy/hold shares: shares_sold, sell_price, commissions_total, fees_total.

P&L Formulas (server will recompute to avoid client tampering)
- Credit spread: realized = (credit_received − cost_to_close) × contracts × 100; pct = realized / (credit_received × contracts × 100).
- Long option: realized = (exit_premium − debit_paid) × contracts × 100; pct = realized / (debit_paid × contracts × 100).
- Buy/hold: realized = (sell_price − entry_price) × shares; pct = realized / (entry_price × shares).
- Covered call: depends on outcome; if assigned, include equity P&L + option premium.

API Contract (proposed)
- POST /api/trades/close
  - Input: trade_id, close_method, close_date, strategy_type, per‑strategy inputs above, optional notes.
  - Behavior: compute realized P&L server‑side; upsert close record; set trades.status = 'closed' and trades.closed_at = close_date; persist realized totals to trades for quick queries.
- GET /api/trades?status=closed should include embedded close_details.
- PATCH /api/trades can still move status, but if provided close payload, perform the same work as POST /close.

DB Schema (proposed)
- Add/ensure on trades:
  - closed_at timestamptz null
  - realized_pl numeric null
  - realized_pl_percent numeric null
  - status allows 'action_needed' (update check/enum if present)
- New table trade_closures (one row per trade):
  create table if not exists public.trade_closures (
    id uuid primary key default gen_random_uuid(),
    trade_id uuid not null unique references public.trades(id) on delete cascade,
    close_method text not null check (close_method in (
      'manual_close','expired_worthless','expired_itm_assigned','rolled','stop_hit','target_hit','risk_rules_exit','other'
    )),
    close_date timestamptz not null,
    underlying_price_at_close numeric null,
    -- Strategy‑specific captured values
    cost_to_close_per_spread numeric null,
    exit_premium_per_contract numeric null,
    contracts_closed integer null,
    shares_sold integer null,
    sell_price numeric null,
    assigned_shares integer null,
    assigned_strike numeric null,
    -- Totals
    commissions_total numeric null,
    fees_total numeric null,
    realized_pl numeric null,
    realized_pl_percent numeric null,
    notes text null,
    raw jsonb null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists idx_trade_closures_trade on public.trade_closures(trade_id);

UI Entry Points
- Historic: Add “Enter Close Details” in src/components/dashboard/historic-trades-dashboard.tsx row actions; open dialog to view/edit closure details. Pre‑fill from server; fallback: prefill from localStorage key 'tenxiv:trade-closures' if present.
- Active: Replace the immediate “Close” action with an “Enter Close Details” dialog; on confirm, call POST /api/trades/close and then refresh lists.
- Dialog fields should adapt to strategy_type; show computed realized P&L live.

Migration/Backfill
- Backfill existing closure data saved in localStorage 'tenxiv:trade-closures' by offering a one‑time import action that posts each entry to /api/trades/close.
- When a trade auto‑closes due to expiry, create a placeholder close record and surface a “Details needed” badge in history until edited.

Edge Cases
- Partial closes/rolls: if we want multiple events per trade, shift to trade_close_events with quantity fields; otherwise keep one closure per trade (current proposal) and record rolled_to_trade_id in raw jsonb.
- Timezone: confirm if dates should be stored in UTC; UI will display locale.
- Permissions: confirm we use the existing service role for server‑side writes; client will only call Next.js API.

Acceptance Criteria
- Users can add/edit close details for both manually closed and auto‑expired trades.
- Data persists in Supabase and is returned with closed trades.
- Realized P&L appears in Historic Trades and any performance summaries.

If you approve the above, I’ll implement: DB migration, API endpoints, UI dialogs and wiring, and a backfill/import from localStorage.

SQL Migration (run once in Supabase SQL editor)
- Copy/paste and run the following to create the new table and columns and allow the new status value:

-- 1) Add columns to trades (safe, idempotent)
alter table public.trades add column if not exists closed_at timestamptz null;
alter table public.trades add column if not exists realized_pl numeric null;
alter table public.trades add column if not exists realized_pl_percent numeric null;

-- 2) Ensure status allows 'action_needed'
-- If status is an enum type (e.g., trade_status), add the new label; ignore errors if it already exists
do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'trade_status'
  ) then
    -- add value if missing
    begin
      execute 'alter type trade_status add value if not exists \u0027action_needed\u0027';
    exception when others then null;
    end;
  end if;
end $$;

-- If status is text with a check constraint, drop/recreate; update the constraint name to match your DB if needed
do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_namespace ns on ns.oid = cl.relnamespace
  where ns.nspname = 'public' and cl.relname = 'trades' and c.contype = 'c' and c.conname like 'trades_status_check%';

  if conname is not null then
    execute format('alter table public.trades drop constraint %I', conname);
    execute $$alter table public.trades add constraint trades_status_check_v2
      check (status in ('prospective','active','action_needed','closed','expired','cancelled'))$$;
  end if;
end $$;

-- 3) trade_closures table (idempotent)
create table if not exists public.trade_closures (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null unique references public.trades(id) on delete cascade,
  close_method text not null,
  close_date timestamptz not null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trade_closures_trade on public.trade_closures(trade_id);
