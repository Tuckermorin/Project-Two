import type { SupabaseClient } from "@supabase/supabase-js";

type BenchmarkParams = {
  supabase: SupabaseClient;
  symbol: string | null | undefined;
  strategy: string | null | undefined;
  dte: number | null;
  volRank: number | null;
};

type BenchmarkResult = {
  win_rate: number | null;
  median_pl: number | null;
  sample_size: number;
  dte_bucket: string;
  iv_rank_bucket: string;
  delta_bucket: string;
};

const SAMPLE_LIMIT = 400;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const differenceInDays = (later: Date | null, earlier: Date | null): number | null => {
  if (!later || !earlier) return null;
  const diffMs = later.getTime() - earlier.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
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

const bucketDelta = (delta: number | null): string => {
  if (delta === null || Number.isNaN(delta)) return "unknown";
  const abs = Math.abs(delta);
  if (abs <= 0.15) return "low";
  if (abs <= 0.35) return "mid";
  return "high";
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

type VolCacheKey = string;

type VolCache = Map<VolCacheKey, number | null>;

const extractVolFromRow = (row: any): number | null => {
  const candidates = [
    row?.hv30_rank,
    row?.hv_rank,
    row?.vol_rank,
    row?.atr_pct_rank,
    row?.iv_rank,
    row?.analytics?.hv30_rank,
    row?.analytics?.atr_pct_rank,
    row?.meta?.hv30_rank,
    row?.meta?.atr_pct_rank,
    row?.meta?.vol_rank,
    row?.attributes?.hv30_rank,
    row?.attributes?.vol_rank,
    row?.features?.hv30_rank,
    row?.features?.atr_pct_rank,
    row?.features?.vol_rank,
  ];

  for (const candidate of candidates) {
    const numeric = toNumber(candidate);
    if (numeric !== null) return numeric;
  }
  return null;
};

const extractDeltaFromRow = (row: any): number | null => {
  const candidates = [
    row?.short_delta,
    row?.delta,
    row?.meta?.short_delta,
    row?.meta?.delta,
    row?.attributes?.short_delta,
    row?.attributes?.delta,
    row?.analytics?.short_delta,
    row?.features?.short_delta,
  ];

  for (const candidate of candidates) {
    const numeric = toNumber(candidate);
    if (numeric !== null) return numeric;
  }
  return null;
};

const cacheKey = (symbol: string | null, date: string | null): VolCacheKey => {
  const cleanSymbol = symbol ? symbol.toUpperCase() : "";
  const cleanDate = date ?? "latest";
  return `${cleanSymbol}|${cleanDate}`;
};

const ensureVolRankForDate = async (
  supabase: SupabaseClient,
  symbol: string | null,
  entryDate: Date | null,
  cache: VolCache
): Promise<number | null> => {
  if (!symbol) return null;
  const dateIso = entryDate ? entryDate.toISOString().slice(0, 10) : null;
  const key = cacheKey(symbol, dateIso);

  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  try {
    let query = supabase
      .from("vol_regime_daily")
      .select("hv30_rank,atr_pct_rank")
      .eq("symbol", symbol.toUpperCase())
      .order("as_of_date", { ascending: false })
      .limit(1);

    if (dateIso) {
      query = query.lte("as_of_date", dateIso);
    }

    const { data, error } = await query;

    if (error) {
      console.error("vol_regime_daily lookup failed", error);
      cache.set(key, null);
      return null;
    }

    if (!data || !data.length) {
      cache.set(key, null);
      return null;
    }

    const row = data[0] as any;
    const hv = toNumber(row?.hv30_rank);
    const atr = toNumber(row?.atr_pct_rank);
    const resolved = hv !== null ? hv : atr;
    cache.set(key, resolved);
    return resolved;
  } catch (error) {
    console.error("Unexpected vol_regime_daily lookup error", error);
    cache.set(key, null);
    return null;
  }
};

export async function getBenchmarks(params: BenchmarkParams): Promise<BenchmarkResult> {
  const strategy = String(params.strategy || "").toLowerCase();
  const symbol = params.symbol ? String(params.symbol).toUpperCase() : null;
  const targetDteBucket = bucketDte(params.dte ?? null);
  const targetVolBucket = bucketVol(params.volRank ?? null);

  if (!strategy) {
    return {
      win_rate: null,
      median_pl: null,
      sample_size: 0,
      dte_bucket: targetDteBucket,
      iv_rank_bucket: targetVolBucket,
      delta_bucket: "unknown",
    };
  }

  try {
    const { data, error } = await params.supabase
      .from("trades")
      .select(
        `id, symbol, contract_type, entry_date, expiration_date, created_at, meta, attributes, analytics,
         trade_closures(realized_pl, close_date)`
      )
      .eq("status", "closed")
      .eq("contract_type", strategy)
      .order("entry_date", { ascending: false })
      .limit(SAMPLE_LIMIT);

    if (error) {
      console.error("Benchmarks query error", error);
      return {
        win_rate: null,
        median_pl: null,
        sample_size: 0,
        dte_bucket: targetDteBucket,
        iv_rank_bucket: targetVolBucket,
        delta_bucket: "unknown",
      };
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      return {
        win_rate: null,
        median_pl: null,
        sample_size: 0,
        dte_bucket: targetDteBucket,
        iv_rank_bucket: targetVolBucket,
        delta_bucket: "unknown",
      };
    }

    const volCache: VolCache = new Map();
    const normalized: Array<{
      realizedPL: number;
      dteBucket: string;
      volBucket: string;
      deltaBucket: string;
    }> = [];

    for (const row of rows) {
      const closure = Array.isArray(row?.trade_closures) ? row.trade_closures[row.trade_closures.length - 1] : row?.trade_closures;
      const realizedPL = toNumber(closure?.realized_pl);
      if (realizedPL === null) continue;

      const entryDate = toDate(row?.entry_date ?? row?.created_at);
      const expiryDate = toDate(row?.expiration_date);
      const dteAtEntry = differenceInDays(expiryDate, entryDate);
      const dteBucket = bucketDte(dteAtEntry);

      let volRank = extractVolFromRow(row);
      if (volRank === null) {
        volRank = await ensureVolRankForDate(params.supabase, row?.symbol ?? symbol, entryDate, volCache);
      }
      const volBucket = bucketVol(volRank);

      const delta = extractDeltaFromRow(row);
      const deltaBucket = bucketDelta(delta);

      normalized.push({
        realizedPL,
        dteBucket,
        volBucket,
        deltaBucket,
      });
    }

    if (!normalized.length) {
      return {
        win_rate: null,
        median_pl: null,
        sample_size: 0,
        dte_bucket: targetDteBucket,
        iv_rank_bucket: targetVolBucket,
        delta_bucket: "unknown",
      };
    }

    const dteMatches = normalized.filter((row) => row.dteBucket === targetDteBucket);
    const volMatches = targetVolBucket === "unknown"
      ? dteMatches
      : dteMatches.filter((row) => row.volBucket === targetVolBucket);

    const sample = volMatches.length >= 10
      ? volMatches
      : dteMatches.length
        ? dteMatches
        : normalized;

    const results = sample.map((row) => row.realizedPL);
    const wins = results.filter((pl) => pl > 0).length;

    const winRate = results.length ? wins / results.length : null;
    const medianPL = median(results);
    const sampleSize = sample.length;

    const deltaBucketSummary = sample.length
      ? sample.reduce<{ counts: Record<string, number>; dominant: string }>((acc, row) => {
          acc.counts[row.deltaBucket] = (acc.counts[row.deltaBucket] ?? 0) + 1;
          if (!acc.dominant || acc.counts[row.deltaBucket] > acc.counts[acc.dominant]) {
            acc.dominant = row.deltaBucket;
          }
          return acc;
        }, { counts: {}, dominant: "unknown" }).dominant
      : "unknown";

    return {
      win_rate: winRate,
      median_pl: medianPL,
      sample_size: sampleSize,
      dte_bucket: targetDteBucket,
      iv_rank_bucket: targetVolBucket,
      delta_bucket: deltaBucketSummary ?? "unknown",
    };
  } catch (err) {
    console.error("Unexpected benchmark error", err);
    return {
      win_rate: null,
      median_pl: null,
      sample_size: 0,
      dte_bucket: bucketDte(params.dte ?? null),
      iv_rank_bucket: bucketVol(params.volRank ?? null),
      delta_bucket: "unknown",
    };
  }
}
