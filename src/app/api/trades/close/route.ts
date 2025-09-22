import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role key required server-side to update trades + closures
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/trades/close
 * Persist final close/expiration details and mark trade as closed.
 * Expects JSON body with:
 * - tradeId (uuid)
 * - closeMethod (string)
 * - closeDate (ISO string)
 * - underlyingPriceAtClose (number | null)
 * - costToClosePerSpread (number | null)
 * - exitPremiumPerContract (number | null)
 * - contractsClosed (number | null)
 * - sharesSold (number | null)
 * - sellPrice (number | null)
 * - assignedShares (number | null)
 * - assignedStrike (number | null)
 * - commissionsTotal (number | null)
 * - feesTotal (number | null)
 * - notes (string | null)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tradeId,
      closeMethod,
      closeDate,
      underlyingPriceAtClose,
      costToClosePerSpread,
      exitPremiumPerContract,
      contractsClosed,
      sharesSold,
      sellPrice,
      assignedShares,
      assignedStrike,
      commissionsTotal,
      feesTotal,
      notes,
    } = body || {};

    if (!tradeId || !closeMethod || !closeDate) {
      return NextResponse.json({ error: 'tradeId, closeMethod, closeDate are required' }, { status: 400 });
    }

    // Load trade to infer strategy + entry economics
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();
    if (tradeError || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const contractType = String(trade.contract_type || trade.strategy_type || '').toLowerCase();
    const contracts = Number(contractsClosed ?? trade.number_of_contracts ?? 0) || 0;
    const credit = typeof trade.credit_received === 'number' ? trade.credit_received : null;

    // Compute realized P/L server-side (best-effort based on inputs + trade data)
    let realizedPL: number | null = null;
    let realizedPLPercent: number | null = null;

    const safe = (n: any) => (typeof n === 'number' && !Number.isNaN(n) ? n : null);
    const cc = safe(costToClosePerSpread);
    const exitPrem = safe(exitPremiumPerContract);
    const debitPaid = safe((trade as any).debit_paid); // may not exist in schema

    if ((/put-credit-spread|call-credit-spread|iron-condor/).test(contractType)) {
      if (credit != null && cc != null && contracts > 0) {
        realizedPL = (credit - cc) * contracts * 100;
        const denom = credit * contracts * 100;
        realizedPLPercent = denom !== 0 ? (realizedPL / denom) * 100 : null;
      }
    } else if ((/long-call|long-put/).test(contractType)) {
      const basis = debitPaid ?? safe((body && body.debitPaid));
      if (basis != null && exitPrem != null && contracts > 0) {
        realizedPL = (exitPrem - basis) * contracts * 100;
        const denom = basis * contracts * 100;
        realizedPLPercent = denom !== 0 ? (realizedPL / denom) * 100 : null;
      }
    } else if (/buy-hold/.test(contractType)) {
      const entryPrice = safe((trade as any).entry_price ?? (body && body.entryPrice));
      const shares = safe((body && body.sharesSold) ?? (trade as any).shares) || 0;
      if (entryPrice != null && sellPrice != null && shares > 0) {
        realizedPL = (sellPrice - entryPrice) * shares;
        const denom = entryPrice * shares;
        realizedPLPercent = denom !== 0 ? (realizedPL / denom) * 100 : null;
      }
    } else if (/covered-call/.test(contractType)) {
      // Basic option-leg accounting; assignment equity leg not computed here
      if (exitPrem != null && credit != null && contracts > 0) {
        realizedPL = (exitPrem - credit) * contracts * 100; // if closed for debit, exitPrem ~ buyback
        const denom = Math.abs(credit) * contracts * 100 || 1;
        realizedPLPercent = (realizedPL / denom) * 100;
      }
    }

    // Insert/Upsert trade_closures
    const closure = {
      trade_id: tradeId,
      close_method: closeMethod,
      close_date: new Date(closeDate).toISOString(),
      ips_name: trade.ips_name ?? null,
      underlying_price_at_close: safe(underlyingPriceAtClose),
      cost_to_close_per_spread: cc,
      exit_premium_per_contract: exitPrem,
      contracts_closed: contracts || null,
      shares_sold: safe(sharesSold),
      sell_price: safe(sellPrice),
      assigned_shares: safe(assignedShares),
      assigned_strike: safe(assignedStrike),
      commissions_total: safe(commissionsTotal),
      fees_total: safe(feesTotal),
      realized_pl: safe(realizedPL),
      realized_pl_percent: safe(realizedPLPercent),
      notes: notes || null,
      raw: body || null,
      updated_at: new Date().toISOString(),
    } as any;

    // Ensure single closure per trade (idempotent behavior)
    const { error: upsertErr } = await supabase
      .from('trade_closures')
      .upsert(closure, { onConflict: 'trade_id' });
    if (upsertErr) {
      console.error('trade_closures upsert failed:', upsertErr);
      return NextResponse.json({ error: 'Failed to save close details' }, { status: 500 });
    }

    // Update trade status + realized P/L
    const { error: updateErr } = await supabase
      .from('trades')
      .update({
        status: 'closed',
        closed_at: new Date(closeDate).toISOString(),
        ips_name: trade.ips_name ?? null,
        realized_pl: safe(realizedPL),
        realized_pl_percent: safe(realizedPLPercent),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId);
    if (updateErr) {
      console.error('trades update failed:', updateErr);
      return NextResponse.json({ error: 'Failed to finalize trade close' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { tradeId, realizedPL, realizedPLPercent } });
  } catch (e) {
    console.error('POST /api/trades/close failed:', e);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
