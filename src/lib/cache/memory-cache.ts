// src/lib/cache/memory-cache.ts
type Cached<T> = { value: T; updatedAt: number };

class MemoryCache<T> {
  private store = new Map<string, Cached<T>>();
  constructor(private ttlMs: number) {}

  get(key: string): { value: T; fromCache: boolean } | null {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() - item.updatedAt > this.ttlMs) return null;
    return { value: item.value, fromCache: true };
    // note: fromCache=true only indicates it was served within TTL
  }

  set(key: string, value: T) {
    this.store.set(key, { value, updatedAt: Date.now() });
  }

  getStale(key: string): T | null {
    // returns any cached value, even stale, for graceful fallback
    const item = this.store.get(key);
    return item ? item.value : null;
  }
}

class DailyCounter {
  private count = 0;
  private dayKey = this.currentDayKey();

  private currentDayKey() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }

  private maybeReset() {
    const nowKey = this.currentDayKey();
    if (nowKey !== this.dayKey) {
      this.dayKey = nowKey;
      this.count = 0;
    }
  }

  inc(): number {
    this.maybeReset();
    this.count += 1;
    return this.count;
  }

  value(): number {
    this.maybeReset();
    return this.count;
  }
}

export const marketCache = new MemoryCache<any>(3 * 60 * 60 * 1000); // 3 hour TTL
export const dailyCounter = new DailyCounter();

// configuration
// With upgraded Alpha Vantage tier (150 rpm), raise local budget guard.
// Optionally override via env ALPHA_VANTAGE_DAILY_BUDGET.
export const DAILY_BUDGET = Number(process.env.ALPHA_VANTAGE_DAILY_BUDGET || 50000);
