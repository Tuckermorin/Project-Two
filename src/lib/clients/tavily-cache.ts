/**
 * Cache layer for Tavily API calls
 * - Search cache by query fingerprint (6-24h TTL)
 * - Extract cache by URL content hash/etag
 * - In-memory LRU cache with optional Redis backend
 */

import crypto from "crypto";

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  etag?: string;
}

/**
 * In-memory LRU cache implementation
 */
class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];

  constructor(private maxSize: number = 1000) {}

  set(key: string, value: T, ttlMs: number, etag?: string): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data: value,
      cachedAt: now,
      expiresAt: now + ttlMs,
      etag,
    };

    // Remove if already exists
    if (this.cache.has(key)) {
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }

    // Add to cache
    this.cache.set(key, entry);
    this.accessOrder.push(key);

    // Evict oldest if over limit
    if (this.cache.size > this.maxSize) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }
  }

  get(key: string): { data: T; etag?: string } | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return null;
    }

    // Update access order (move to end)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    return { data: entry.data, etag: entry.etag };
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Global caches
 */
const searchCache = new LRUCache<any>(500);  // 500 search queries
const extractCache = new LRUCache<any>(1000); // 1000 extracted URLs

/**
 * Cache key generation for search
 */
function generateSearchCacheKey(
  query: string,
  options: {
    topic?: string;
    search_depth?: string;
    days?: number;
    include_domains?: string[];
    exclude_domains?: string[];
    max_results?: number;
  }
): string {
  const normalized = {
    query: query.trim().toLowerCase(),
    topic: options.topic || "general",
    depth: options.search_depth || "basic",
    days: options.days || 7,
    include_domains: (options.include_domains || []).sort().join(","),
    exclude_domains: (options.exclude_domains || []).sort().join(","),
    max_results: options.max_results || 5,
  };

  const fingerprint = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

/**
 * Cache key generation for extract (URL-based)
 */
function generateExtractCacheKey(url: string, depth?: string): string {
  const normalized = `${url}:${depth || "basic"}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generate etag from content
 */
function generateETag(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * Search cache operations
 */
export const SearchCache = {
  get(
    query: string,
    options: {
      topic?: string;
      search_depth?: string;
      days?: number;
      include_domains?: string[];
      exclude_domains?: string[];
      max_results?: number;
    }
  ): any | null {
    const key = generateSearchCacheKey(query, options);
    const cached = searchCache.get(key);

    if (cached) {
      console.log(`[Cache HIT] Search: "${query}" (topic: ${options.topic || "general"})`);
      return cached.data;
    }

    console.log(`[Cache MISS] Search: "${query}" (topic: ${options.topic || "general"})`);
    return null;
  },

  set(
    query: string,
    options: {
      topic?: string;
      search_depth?: string;
      days?: number;
      include_domains?: string[];
      exclude_domains?: string[];
      max_results?: number;
    },
    data: any,
    ttlMs: number = 6 * 60 * 60 * 1000 // Default 6 hours
  ): void {
    const key = generateSearchCacheKey(query, options);
    searchCache.set(key, data, ttlMs);
    console.log(`[Cache SET] Search: "${query}" (TTL: ${ttlMs / 1000 / 60}min)`);
  },

  clear(): void {
    searchCache.clear();
    console.log(`[Cache CLEAR] Search cache cleared`);
  },

  size(): number {
    return searchCache.size();
  },
};

/**
 * Extract cache operations
 */
export const ExtractCache = {
  get(url: string, depth?: string): { data: any; etag?: string } | null {
    const key = generateExtractCacheKey(url, depth);
    const cached = extractCache.get(key);

    if (cached) {
      console.log(`[Cache HIT] Extract: ${url}`);
      return cached;
    }

    console.log(`[Cache MISS] Extract: ${url}`);
    return null;
  },

  set(
    url: string,
    data: any,
    depth?: string,
    ttlMs: number = 24 * 60 * 60 * 1000 // Default 24 hours
  ): void {
    const key = generateExtractCacheKey(url, depth);

    // Generate etag from content if available
    let etag: string | undefined;
    if (data.raw_content || data.content) {
      etag = generateETag(data.raw_content || data.content);
    }

    extractCache.set(key, data, ttlMs, etag);
    console.log(`[Cache SET] Extract: ${url} (TTL: ${ttlMs / 1000 / 60 / 60}h, etag: ${etag?.substring(0, 8)}...)`);
  },

  /**
   * Check if content has changed (by etag)
   */
  hasChanged(url: string, newContent: string, depth?: string): boolean {
    const key = generateExtractCacheKey(url, depth);
    const cached = extractCache.get(key);

    if (!cached || !cached.etag) {
      return true; // No cached version or no etag, consider changed
    }

    const newETag = generateETag(newContent);
    return cached.etag !== newETag;
  },

  clear(): void {
    extractCache.clear();
    console.log(`[Cache CLEAR] Extract cache cleared`);
  },

  size(): number {
    return extractCache.size();
  },
};

/**
 * Cache statistics for monitoring
 */
export function getCacheStats() {
  return {
    search: {
      size: searchCache.size(),
      keys: searchCache.keys().length,
    },
    extract: {
      size: extractCache.size(),
      keys: extractCache.keys().length,
    },
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  SearchCache.clear();
  ExtractCache.clear();
}

/**
 * Warm cache helper for common queries
 */
export async function warmCache(
  symbols: string[],
  queryFn: (symbol: string) => Promise<any>
) {
  console.log(`[Cache WARM] Starting for ${symbols.length} symbols...`);

  const results = await Promise.allSettled(
    symbols.map(symbol => queryFn(symbol))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`[Cache WARM] Complete. Succeeded: ${succeeded}, Failed: ${failed}`);

  return { succeeded, failed };
}

/**
 * Cache TTL presets
 */
export const CacheTTL = {
  SEARCH_NEWS: 6 * 60 * 60 * 1000,        // 6 hours for news (stale quickly)
  SEARCH_GENERAL: 12 * 60 * 60 * 1000,    // 12 hours for general
  SEARCH_SEC: 24 * 60 * 60 * 1000,        // 24 hours for SEC filings
  EXTRACT_IR: 24 * 60 * 60 * 1000,        // 24 hours for investor relations
  EXTRACT_SEC: 7 * 24 * 60 * 60 * 1000,   // 7 days for SEC content (stable)
  EXTRACT_NEWS: 12 * 60 * 60 * 1000,      // 12 hours for news articles
};
