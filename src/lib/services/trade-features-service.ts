import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TradeFeaturesContext = {
  symbol: string | null | undefined;
  trade: Record<string, any> | null | undefined;
  price: number | null;
  dte: number | null;
  technicals?: Record<string, any> | null;
  supabase: SupabaseClient;
  asOfDate?: string | null;
};

export type TradeFeatures = Record<string, number | null>;

type DailyBar = {
  date: string;
  close: number;
  high: number;
  low: number;
};

export type VolMetrics = {
  hv30: number | null;
  hv30_rank: number | null;
  atr14: number | null;
  atr_pct: number | null;
  atr_pct_rank: number | null;
  iv_atm_30d: number | null;
  iv_rank: number | null;
};

const VOL_PROVIDER = (process.env.VOL_PROVIDER ?? "none").toLowerCase();

const seriesCache = new Map<string, DailyBar[]>();

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const calcStdDev = (values: number[]): number | null => {
  if (!values.length) return null;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stdev = Math.sqrt(variance);
  return Number.isFinite(stdev) ? stdev : null;
};

const percentileRank = (population: number[], value: number | null): number | null => {
  if (!Number.isFinite(value) || !population.length) return null;
  const val = value as number;
  const count = population.filter((entry) => Number.isFinite(entry) && entry <= val).length;
  return count / population.length;
};

const daysBetween = (targetISO: string | null | undefined): number | null => {
  if (!targetISO) return null;
  const target = new Date(targetISO);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

const bucketDte = (dte: number | null): string => {
  if (!Number.isFinite(dte)) return "unknown";
  const value = dte as number;
  if (value <= 7) return "0-7";
  if (value <= 14) return "8-14";
  if (value <= 30) return "15-30";
  if (value <= 45) return "31-45";
  if (value <= 60) return "46-60";
  return "60+";
};

const bucketVol = (rank: number | null): string => {
  if (!Number.isFinite(rank)) return "unknown";
  const value = rank as number;
  if (value <= 0.33) return "low";
  if (value <= 0.66) return "mid";
  return "high";
};

const computeSpreadWidth = (shortStrike: number | null, longStrike: number | null): number | null => {
  if (!Number.isFinite(shortStrike) || !Number.isFinite(longStrike)) return null;
  return Math.abs((shortStrike as number) - (longStrike as number));
};

const computeLogReturns = (closes: number[]): number[] => {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && curr > 0) {
      out.push(Math.log(curr / prev));
    }
  }
  return out;
};

const computeTrueRanges = (bars: DailyBar[]): number[] => {
  const result: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prevClose = bars[i - 1].close;
    const { high, low } = bars[i];
    const range = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    result.push(range);
  }
  return result;
};

const sliceBars = (bars: DailyBar[], asOfDate: string | null | undefined): DailyBar[] => {
  if (!asOfDate) return bars;
  const cutoff = new Date(asOfDate);
  if (Number.isNaN(cutoff.getTime())) return bars;
  return bars.filter((bar) => new Date(bar.date).getTime() <= cutoff.getTime());
};

const annualizeVol = (logReturns: number[]): number | null => {
  const stdev = calcStdDev(logReturns);
  if (!Number.isFinite(stdev)) return null;
  return (stdev as number) * Math.sqrt(252);
};

const mean = (values: number[]): number | null => {
  if (!values.length) return null;
  return values.reduce((acc, val) => acc + val, 0) / values.length;
};

async function getDailyBars(symbol: string): Promise<DailyBar[]> {
  const key = symbol.toUpperCase();
  if (seriesCache.has(key)) {
    return seriesCache.get(key)!;
  }

  const av = getAlphaVantageClient();
  const rawSeries = await av.getDailyAdjustedSeries(key, "full");
  const bars: DailyBar[] = Object.entries(rawSeries)
    .map(([date, values]) => ({
      date,
      close: Number(values["4. close"]),
      high: Number(values["2. high"] ?? values["3. high"]),
      low: Number(values["3. low"] ?? values["2. low"]),
    }))
    .filter((bar) => Number.isFinite(bar.close) && Number.isFinite(bar.high) && Number.isFinite(bar.low))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  seriesCache.set(key, bars);
  return bars;
}

type CachedVol = {
  metrics: VolMetrics | null;
  asOf: string | null;
};

async function loadVolatilityFromCache(
  symbol: string,
  supabase: SupabaseClient,
  asOfDate: string | null
): Promise<CachedVol> {
  try {
    let query = supabase
      .from("vol_regime_daily")
      .select("as_of_date,hv30,hv30_rank,atr14,atr_pct,atr_pct_rank,iv_atm_30d,iv_rank")
      .eq("symbol", symbol)
      .order("as_of_date", { ascending: false })
      .limit(1);

    if (asOfDate) {
      query = query.lte("as_of_date", asOfDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to load vol_regime_daily", error);
      return { metrics: null, asOf: null };
    }

    if (!data || !data.length) {
      return { metrics: null, asOf: null };
    }

    const row: any = data[0];
    return {
      asOf: row.as_of_date ?? null,
      metrics: {
        hv30: toNumber(row.hv30),
        hv30_rank: toNumber(row.hv30_rank),
        atr14: toNumber(row.atr14),
        atr_pct: toNumber(row.atr_pct),
        atr_pct_rank: toNumber(row.atr_pct_rank),
        iv_atm_30d: toNumber(row.iv_atm_30d),
        iv_rank: toNumber(row.iv_rank),
      },
    };
  } catch (error) {
    console.error("Unexpected vol_regime_daily fetch error", error);
    return { metrics: null, asOf: null };
  }
}

async function computeVolatilityMetrics(
  symbol: string,
  asOfDate: string | null | undefined
): Promise<VolMetrics | null> {
  try {
    const bars = await getDailyBars(symbol);
    const sliced = sliceBars(bars, asOfDate);

    if (sliced.length < 60) {
      return {
        hv30: null,
        hv30_rank: null,
        atr14: null,
        atr_pct: null,
        atr_pct_rank: null,
        iv_atm_30d: null,
        iv_rank: null,
      };
    }

    const closes = sliced.map((bar) => bar.close);
    const logReturns = computeLogReturns(closes);
    if (logReturns.length < 30) {
      return {
        hv30: null,
        hv30_rank: null,
        atr14: null,
        atr_pct: null,
        atr_pct_rank: null,
        iv_atm_30d: null,
        iv_rank: null,
      };
    }

    const hvWindow = logReturns.slice(-30);
    const hv30 = annualizeVol(hvWindow);

    const hvSeries: number[] = [];
    for (let i = 29; i < logReturns.length; i += 1) {
      const window = logReturns.slice(i - 29, i + 1);
      const hv = annualizeVol(window);
      if (Number.isFinite(hv)) {
        hvSeries.push(hv as number);
      }
    }
    const hv30Rank = Number.isFinite(hv30) ? percentileRank(hvSeries, hv30!) : null;

    const trs = computeTrueRanges(sliced);
    const atrPctSeries: number[] = [];
    for (let i = 13; i < trs.length; i += 1) {
      const window = trs.slice(i - 13, i + 1);
      const atr = mean(window);
      if (!Number.isFinite(atr)) continue;
      const close = sliced[i + 1]?.close;
      if (Number.isFinite(close) && close! > 0) {
        atrPctSeries.push((atr as number) / close!);
      }
    }

    const latestAtrPct = atrPctSeries.length ? atrPctSeries[atrPctSeries.length - 1] : null;
    const atrPctRank = Number.isFinite(latestAtrPct) ? percentileRank(atrPctSeries, latestAtrPct!) : null;
    const lastClose = sliced[sliced.length - 1]?.close ?? null;
    const atr14 =
      Number.isFinite(latestAtrPct) && Number.isFinite(lastClose) ? (latestAtrPct as number) * (lastClose as number) : null;

    return {
      hv30: Number.isFinite(hv30) ? hv30! : null,
      hv30_rank: Number.isFinite(hv30Rank) ? hv30Rank! : null,
      atr14: Number.isFinite(atr14) ? atr14! : null,
      atr_pct: Number.isFinite(latestAtrPct) ? latestAtrPct! : null,
      atr_pct_rank: Number.isFinite(atrPctRank) ? atrPctRank! : null,
      iv_atm_30d: null,
      iv_rank: null,
    };
  } catch (error) {
    console.error("Failed computing volatility metrics", error);
    return null;
  }
}

async function ensureVolatilityMetrics(
  symbol: string,
  supabase: SupabaseClient,
  asOfDate?: string | null
): Promise<VolMetrics | null> {
  const targetDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  const upper = symbol.toUpperCase();

  const { metrics: cachedMetrics, asOf } = await loadVolatilityFromCache(upper, supabase, targetDate);

  if (cachedMetrics && asOf === targetDate) {
    return cachedMetrics;
  }

  const computed = await computeVolatilityMetrics(upper, targetDate);
  if (!computed) {
    return cachedMetrics;
  }

  try {
    await supabase.from("vol_regime_daily").upsert(
      {
        symbol: upper,
        as_of_date: targetDate,
        hv30: computed.hv30,
        hv30_rank: computed.hv30_rank,
        atr14: computed.atr14,
        atr_pct: computed.atr_pct,
        atr_pct_rank: computed.atr_pct_rank,
        iv_atm_30d: computed.iv_atm_30d,
        iv_rank: computed.iv_rank,
        provider: VOL_PROVIDER || "proxy",
      },
      {
        onConflict: "symbol,as_of_date",
      }
    );
  } catch (error) {
    console.error("Failed to upsert vol_regime_daily", error);
  }

  return computed;
}

const deriveSpreadMetrics = (trade: Record<string, any> | null | undefined, price: number | null) => {
  const contractType = String(trade?.contractType ?? trade?.strategyType ?? "").toLowerCase();
  const shortStrike = toNumber(trade?.shortPutStrike ?? trade?.shortCallStrike ?? trade?.shortStrike);
  const longStrike = toNumber(trade?.longPutStrike ?? trade?.longCallStrike ?? trade?.longStrike);
  const optionStrike = toNumber(trade?.optionStrike ?? trade?.strike);
  const creditRaw = toNumber(trade?.creditReceived ?? trade?.premiumReceived ?? trade?.netCredit);
  const debitRaw = toNumber(trade?.debitPaid ?? trade?.netDebit);
  const contracts = toNumber(trade?.numberOfContracts ?? trade?.contracts) ?? 1;

  const width = computeSpreadWidth(shortStrike, longStrike);
  const credit = creditRaw ?? (debitRaw != null ? -Math.abs(debitRaw) : null);

  let maxProfit: number | null = null;
  let maxLoss: number | null = null;
  let breakeven1: number | null = null;
  let breakeven2: number | null = null;
  let collateral: number | null = null;

  if (/credit/.test(contractType) && Number.isFinite(width) && Number.isFinite(credit)) {
    const spreadWidth = width as number;
    const netCredit = credit as number;
    maxProfit = netCredit * contracts * 100;
    maxLoss = (spreadWidth - netCredit) * contracts * 100;
    collateral = spreadWidth * contracts * 100;

    if (contractType.includes("put") && Number.isFinite(shortStrike)) {
      breakeven1 = (shortStrike as number) - netCredit;
    } else if (contractType.includes("call") && Number.isFinite(shortStrike)) {
      breakeven1 = (shortStrike as number) + netCredit;
    }
  } else if ((/long-call|long-put/).test(contractType) && debitRaw != null) {
    const netDebit = Math.abs(debitRaw);
    maxProfit = null;
    maxLoss = netDebit * contracts * 100;

    if (contractType.includes("call") && Number.isFinite(optionStrike)) {
      breakeven1 = (optionStrike as number) + netDebit;
    } else if (contractType.includes("put") && Number.isFinite(optionStrike)) {
      breakeven1 = (optionStrike as number) - netDebit;
    }
  } else if (/buy-hold/.test(contractType)) {
    maxProfit = null;
    maxLoss = null;
  }

  const distanceToShort =
    Number.isFinite(price) && Number.isFinite(shortStrike) ? Math.abs((price as number) - (shortStrike as number)) : null;

  return {
    contractType,
    shortStrike,
    longStrike,
    width,
    credit,
    maxProfit,
    maxLoss,
    breakeven1,
    breakeven2,
    collateral,
    contracts,
    distanceToShort,
  };
};

export async function computeTradeFeatures(context: TradeFeaturesContext): Promise<TradeFeatures> {
  const symbol = context.symbol?.toUpperCase();
  if (!symbol) {
    return {};
  }

  const { trade, price, dte, technicals, supabase, asOfDate } = context;

  const spread = deriveSpreadMetrics(trade, price);
  const volMetrics = await ensureVolatilityMetrics(symbol, supabase, asOfDate ?? null);

  const sma50 = toNumber(technicals?.sma50);
  const sma200 = toNumber(technicals?.sma200);
  const rsi14 = toNumber(technicals?.rsi14);
  const macd = toNumber(technicals?.macd);
  const macdSignal = toNumber(technicals?.macd_signal);

  const priceAbove50 =
    technicals?.price_above_50 != null
      ? toNumber(technicals.price_above_50)
      : Number.isFinite(price) && sma50 !== null
        ? (price as number) > sma50
          ? 1
          : 0
        : null;

  const priceAbove200 =
    technicals?.price_above_200 != null
      ? toNumber(technicals.price_above_200)
      : Number.isFinite(price) && sma200 !== null
        ? (price as number) > sma200
          ? 1
          : 0
        : null;

  const goldenCross =
    technicals?.golden_cross != null
      ? toNumber(technicals.golden_cross)
      : sma50 !== null && sma200 !== null
        ? sma50 > sma200
          ? 1
          : 0
        : null;

  const distancePct =
    Number.isFinite(spread.distanceToShort) && Number.isFinite(price) && (price as number) !== 0
      ? (spread.distanceToShort as number) / (price as number)
      : null;

  const atr14 = toNumber(volMetrics?.atr14);
  const distanceAtr =
    Number.isFinite(spread.distanceToShort) && atr14 !== null && atr14 !== 0
      ? (spread.distanceToShort as number) / atr14
      : null;

  const daysToEarnings = daysBetween(trade?.earnings_date ?? trade?.events?.earnings_date);
  const daysToDividend = daysBetween(trade?.ex_div_date ?? trade?.events?.ex_div_date);

  const creditWidthPct =
    Number.isFinite(spread.credit) && Number.isFinite(spread.width) && (spread.width as number) !== 0
      ? (spread.credit as number) / (spread.width as number)
      : null;

  const rrRatio =
    Number.isFinite(spread.maxProfit) && Number.isFinite(spread.maxLoss) && (spread.maxLoss as number) !== 0
      ? (spread.maxProfit as number) / (spread.maxLoss as number)
      : null;

  const hv30 = toNumber(volMetrics?.hv30);
  const hv30Rank = toNumber(volMetrics?.hv30_rank);
  const atrPct = toNumber(volMetrics?.atr_pct);
  const atrPctRank = toNumber(volMetrics?.atr_pct_rank);
  const ivAtm = toNumber(volMetrics?.iv_atm_30d);
  const ivRank = toNumber(volMetrics?.iv_rank);

  const features: TradeFeatures = {
    price: Number.isFinite(price) ? (price as number) : null,
    dte: Number.isFinite(dte) ? (dte as number) : null,
    credit: spread.credit ?? null,
    max_profit: spread.maxProfit ?? null,
    max_loss: spread.maxLoss ?? null,
    rr_ratio: rrRatio,
    width: spread.width ?? null,
    breakeven1: spread.breakeven1 ?? null,
    breakeven2: spread.breakeven2 ?? null,
    collateral_required: spread.collateral ?? null,
    credit_width_pct: creditWidthPct,
    dist_to_short_abs: spread.distanceToShort ?? null,
    dist_to_short_pct: distancePct,
    dist_to_short_atr: distanceAtr,
    sma50,
    sma200,
    rsi14,
    macd,
    macd_signal: macdSignal,
    price_above_50: priceAbove50,
    price_above_200: priceAbove200,
    golden_cross: goldenCross,
    hv30,
    hv30_rank: hv30Rank,
    atr14,
    atr_pct: atrPct,
    atr_pct_rank: atrPctRank,
    iv_atm_30d: ivAtm,
    iv_rank: ivRank,
    days_to_earnings: Number.isFinite(daysToEarnings) ? (daysToEarnings as number) : null,
    days_to_ex_div: Number.isFinite(daysToDividend) ? (daysToDividend as number) : null,
    contracts: Number.isFinite(spread.contracts) ? (spread.contracts as number) : null,
  };

  const sanitized: TradeFeatures = {};
  for (const [key, value] of Object.entries(features)) {
    sanitized[key] = toNumber(value);
  }

  return sanitized;
}

export const deriveVolBuckets = (features: TradeFeatures): { dte_bucket: string; vol_rank_bucket: string } => {
  const dte = features.dte ?? null;
  const hvRank = features.hv30_rank ?? null;
  const atrRank = features.atr_pct_rank ?? null;
  const volRank = Number.isFinite(hvRank) ? (hvRank as number) : Number.isFinite(atrRank) ? (atrRank as number) : null;

  return {
    dte_bucket: bucketDte(dte),
    vol_rank_bucket: bucketVol(volRank),
  };
};
