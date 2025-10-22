// Intelligence Cache Service
// Implements smart caching with TTL strategy for market intelligence data
// Reduces external database queries by caching frequently accessed data locally

import { createClient } from '@supabase/supabase-js';
import {
  getMarketIntelligenceService,
  type MarketIntelligenceReport,
} from './market-intelligence-service';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry {
  id: string;
  symbol: string;
  source_type: 'earnings_transcript' | 'market_news' | 'news' | 'sentiment';
  data: any;
  external_id?: string;
  external_article_id?: string;
  relevance_score?: number;
  data_date?: string;
  cached_at: string;
  expires_at: string;
  last_accessed_at: string;
  access_count: number;
}

export interface CacheOptions {
  ttl_days?: number; // Time to live in days
  force_refresh?: boolean; // Bypass cache and fetch fresh data
  track_access?: boolean; // Track access statistics
}

export interface CacheStats {
  hits: number;
  misses: number;
  hit_rate: number;
  avg_fetch_time_ms: number;
  total_entries: number;
  expired_entries: number;
}

// ============================================================================
// Cache Service Class
// ============================================================================

export class IntelligenceCacheService {
  private mainDb: ReturnType<typeof createClient>;
  private stats: CacheStats;

  // TTL defaults
  private readonly DEFAULT_NEWS_TTL = 7; // 7 days for news
  private readonly DEFAULT_EARNINGS_TTL = 90; // 90 days for earnings
  private readonly DEFAULT_SENTIMENT_TTL = 7; // 7 days for sentiment

  constructor() {
    this.mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.stats = {
      hits: 0,
      misses: 0,
      hit_rate: 0,
      avg_fetch_time_ms: 0,
      total_entries: 0,
      expired_entries: 0,
    };
  }

  /**
   * Get cached intelligence for a symbol, or fetch if not cached
   */
  async getIntelligence(
    symbol: string,
    options: CacheOptions = {}
  ): Promise<MarketIntelligenceReport> {
    const { force_refresh = false, track_access = true } = options;

    const startTime = Date.now();

    // Check cache first (unless force refresh)
    if (!force_refresh) {
      const cached = await this.getCachedIntelligence(symbol);
      if (cached) {
        const fetchTime = Date.now() - startTime;
        this.stats.hits++;
        this.updateStats(fetchTime);

        console.log(`[IntelligenceCache] ✓ CACHE HIT for ${symbol} (${fetchTime}ms)`);

        if (track_access) {
          await this.trackAccess(symbol, 'cache_hit');
        }

        return cached;
      }
    }

    // Cache miss - fetch from external DB
    console.log(`[IntelligenceCache] ✗ CACHE MISS for ${symbol} - fetching from external DB`);
    const service = getMarketIntelligenceService();
    const intel = await service.getIntelligence(symbol);

    const fetchTime = Date.now() - startTime;
    this.stats.misses++;
    this.updateStats(fetchTime);

    if (track_access) {
      await this.trackAccess(symbol, 'cache_miss');
    }

    // Cache the results
    await this.cacheIntelligence(symbol, intel);

    return intel;
  }

  /**
   * Get intelligence from cache only (returns null if not cached)
   */
  private async getCachedIntelligence(
    symbol: string
  ): Promise<MarketIntelligenceReport | null> {
    try {
      // Query cache for earnings
      const { data: earningsCache, error: earningsError } = await this.mainDb
        .from('market_intelligence_cache')
        .select('*')
        .eq('symbol', symbol)
        .eq('source_type', 'earnings_transcript')
        .gt('expires_at', new Date().toISOString())
        .order('cached_at', { ascending: false });

      if (earningsError) {
        console.error(`[IntelligenceCache] Error querying earnings cache:`, earningsError);
      }

      // Query cache for news
      const { data: newsCache, error: newsError } = await this.mainDb
        .from('market_intelligence_cache')
        .select('*')
        .eq('symbol', symbol)
        .eq('source_type', 'market_news')
        .gt('expires_at', new Date().toISOString())
        .order('cached_at', { ascending: false });

      if (newsError) {
        console.error(`[IntelligenceCache] Error querying news cache:`, newsError);
      }

      // If we have neither earnings nor news, it's a complete miss
      if ((!earningsCache || earningsCache.length === 0) && (!newsCache || newsCache.length === 0)) {
        return null;
      }

      // Reconstruct intelligence report from cached data
      const earnings = earningsCache && earningsCache.length > 0 ? earningsCache[0].data : null;
      const news = newsCache && newsCache.length > 0 ? newsCache[0].data : null;

      // Determine confidence based on what we have
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (earnings && news) {
        confidence = 'high';
      } else if (earnings || news) {
        confidence = 'medium';
      }

      // Calculate data age
      const dataAgeDays = this.calculateDataAge(earningsCache, newsCache);

      // Build sources available
      const sourcesAvailable: string[] = [];
      if (earnings) sourcesAvailable.push('earnings_transcripts');
      if (news) sourcesAvailable.push('market_news');

      return {
        symbol,
        earnings,
        news,
        insider_activity: null,
        confidence,
        data_age_days: dataAgeDays,
        sources_available: sourcesAvailable,
      };
    } catch (error: any) {
      console.error(`[IntelligenceCache] Error getting cached intelligence:`, error);
      return null;
    }
  }

  /**
   * Cache intelligence data with appropriate TTL
   */
  private async cacheIntelligence(
    symbol: string,
    intel: MarketIntelligenceReport
  ): Promise<void> {
    try {
      const now = new Date();

      // Cache earnings data (90-day TTL)
      if (intel.earnings) {
        const earningsExpiry = new Date(now);
        earningsExpiry.setDate(earningsExpiry.getDate() + this.DEFAULT_EARNINGS_TTL);

        await this.mainDb.from('market_intelligence_cache').upsert({
          symbol,
          source_type: 'earnings_transcript',
          data: intel.earnings,
          data_date: intel.earnings.transcripts[0]?.fiscal_date_ending || now.toISOString(),
          cached_at: now.toISOString(),
          expires_at: earningsExpiry.toISOString(),
          last_accessed_at: now.toISOString(),
          access_count: 1,
        });

        console.log(
          `[IntelligenceCache] Cached earnings for ${symbol} (expires: ${earningsExpiry.toISOString()})`
        );
      }

      // Cache news data (7-day TTL)
      if (intel.news) {
        const newsExpiry = new Date(now);
        newsExpiry.setDate(newsExpiry.getDate() + this.DEFAULT_NEWS_TTL);

        await this.mainDb.from('market_intelligence_cache').upsert({
          symbol,
          source_type: 'market_news',
          data: intel.news,
          data_date: intel.news.articles[0]?.time_published || now.toISOString(),
          cached_at: now.toISOString(),
          expires_at: newsExpiry.toISOString(),
          last_accessed_at: now.toISOString(),
          access_count: 1,
        });

        console.log(
          `[IntelligenceCache] Cached news for ${symbol} (expires: ${newsExpiry.toISOString()})`
        );
      }
    } catch (error: any) {
      console.error(`[IntelligenceCache] Error caching intelligence:`, error);
    }
  }

  /**
   * Track access for analytics
   */
  private async trackAccess(symbol: string, hitType: 'cache_hit' | 'cache_miss'): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      if (hitType === 'cache_hit') {
        // Update usage stats
        await this.mainDb.rpc('increment_cache_stats', {
          p_symbol: symbol,
          p_source_type: 'combined',
          p_stats_date: today,
          p_cache_hits: 1,
          p_cache_misses: 0,
        });
      } else {
        await this.mainDb.rpc('increment_cache_stats', {
          p_symbol: symbol,
          p_source_type: 'combined',
          p_stats_date: today,
          p_cache_hits: 0,
          p_cache_misses: 1,
        });
      }
    } catch (error: any) {
      // Non-critical - just log
      console.warn(`[IntelligenceCache] Failed to track access:`, error.message);
    }
  }

  /**
   * Calculate data age from cached entries
   */
  private calculateDataAge(
    earningsCache: any[] | null,
    newsCache: any[] | null
  ): number {
    const now = Date.now();
    let mostRecentDate: Date | null = null;

    if (earningsCache && earningsCache.length > 0) {
      const earningsDate = new Date(earningsCache[0].data_date || earningsCache[0].cached_at);
      if (!mostRecentDate || earningsDate > mostRecentDate) {
        mostRecentDate = earningsDate;
      }
    }

    if (newsCache && newsCache.length > 0) {
      const newsDate = new Date(newsCache[0].data_date || newsCache[0].cached_at);
      if (!mostRecentDate || newsDate > mostRecentDate) {
        mostRecentDate = newsDate;
      }
    }

    if (!mostRecentDate) {
      return 999;
    }

    const ageMs = now - mostRecentDate.getTime();
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Update internal statistics
   */
  private updateStats(fetchTimeMs: number): void {
    const totalQueries = this.stats.hits + this.stats.misses;
    this.stats.hit_rate = totalQueries > 0 ? (this.stats.hits / totalQueries) * 100 : 0;

    // Running average of fetch times
    const prevAvg = this.stats.avg_fetch_time_ms;
    this.stats.avg_fetch_time_ms =
      prevAvg === 0 ? fetchTimeMs : (prevAvg * (totalQueries - 1) + fetchTimeMs) / totalQueries;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      // Get total entries
      const { count: totalCount } = await this.mainDb
        .from('market_intelligence_cache')
        .select('*', { count: 'exact', head: true });

      // Get expired entries
      const { count: expiredCount } = await this.mainDb
        .from('market_intelligence_cache')
        .select('*', { count: 'exact', head: true })
        .lt('expires_at', new Date().toISOString());

      this.stats.total_entries = totalCount || 0;
      this.stats.expired_entries = expiredCount || 0;

      return { ...this.stats };
    } catch (error: any) {
      console.error(`[IntelligenceCache] Error getting stats:`, error);
      return { ...this.stats };
    }
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanup(): Promise<number> {
    try {
      console.log('[IntelligenceCache] Running cleanup...');

      const { data, error } = await this.mainDb.rpc('cleanup_expired_intelligence_cache');

      if (error) {
        console.error(`[IntelligenceCache] Cleanup failed:`, error);
        return 0;
      }

      const deletedCount = data || 0;
      console.log(`[IntelligenceCache] Cleanup complete: ${deletedCount} entries removed`);

      return deletedCount;
    } catch (error: any) {
      console.error(`[IntelligenceCache] Cleanup exception:`, error);
      return 0;
    }
  }

  /**
   * Invalidate cache for a specific symbol
   */
  async invalidate(symbol: string): Promise<void> {
    try {
      console.log(`[IntelligenceCache] Invalidating cache for ${symbol}`);

      const { error } = await this.mainDb
        .from('market_intelligence_cache')
        .delete()
        .eq('symbol', symbol);

      if (error) {
        console.error(`[IntelligenceCache] Invalidation failed:`, error);
      } else {
        console.log(`[IntelligenceCache] Cache invalidated for ${symbol}`);
      }
    } catch (error: any) {
      console.error(`[IntelligenceCache] Invalidation exception:`, error);
    }
  }

  /**
   * Warm cache for a list of symbols (pre-fetch)
   */
  async warmCache(symbols: string[]): Promise<void> {
    console.log(`[IntelligenceCache] Warming cache for ${symbols.length} symbols...`);

    const promises = symbols.map((symbol) =>
      this.getIntelligence(symbol, { force_refresh: false })
    );

    await Promise.all(promises);

    console.log(`[IntelligenceCache] Cache warmed for ${symbols.length} symbols`);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let cacheService: IntelligenceCacheService | null = null;

export function getIntelligenceCacheService(): IntelligenceCacheService {
  if (!cacheService) {
    cacheService = new IntelligenceCacheService();
  }
  return cacheService;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get cached intelligence (convenience wrapper)
 */
export async function getCachedIntelligence(
  symbol: string,
  options?: CacheOptions
): Promise<MarketIntelligenceReport> {
  return getIntelligenceCacheService().getIntelligence(symbol, options);
}

/**
 * Warm cache for watchlist symbols
 */
export async function warmWatchlistCache(symbols: string[]): Promise<void> {
  return getIntelligenceCacheService().warmCache(symbols);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  return getIntelligenceCacheService().getStats();
}

/**
 * Cleanup expired entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  return getIntelligenceCacheService().cleanup();
}
