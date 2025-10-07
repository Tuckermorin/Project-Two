import { http } from "./http";
import { resilientRequest } from "./tavily-resilience";
import { rateLimitedRequest } from "./tavily-rate-limiter";
import { SearchCache, ExtractCache, CacheTTL } from "./tavily-cache";
import { instrumentOperation } from "./tavily-observability";
import { validateSearchResponse, validateExtractResponse, validateMapResponse, validateCrawlResponse } from "./tavily-schemas";

const SEARCH_API = "https://api.tavily.com/search";
const EXTRACT_API = "https://api.tavily.com/extract";
const MAP_API = "https://api.tavily.com/map";
const CRAWL_API = "https://api.tavily.com/crawl";
const key = process.env.TAVILY_API_KEY!;

export interface TavilySearchOptions {
  topic?: "general" | "news";
  search_depth?: "basic" | "advanced";
  days?: number;
  time_range?: string;
  max_results?: number;
  include_domains?: string[];
  exclude_domains?: string[];
  chunks_per_source?: number;
  include_raw_content?: boolean;
}

export interface TavilySearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
  raw_content?: string;
}

export interface TavilyExtractOptions {
  urls: string[];
  extract_depth?: "basic" | "advanced";
  format?: "markdown" | "html";
  include_images?: boolean;
}

export interface TavilyMapOptions {
  url: string;
  max_depth?: number;
  max_breadth?: number;
  limit?: number;
  select_paths?: string[];
  exclude_paths?: string[];
  instructions?: string;
}

export interface TavilyCrawlOptions {
  url: string;
  max_depth?: number;
  max_breadth?: number;
  limit?: number;
  select_paths?: string[];
  exclude_paths?: string[];
  extract_depth?: "basic" | "advanced";
}

/**
 * Enhanced Tavily Search with production-grade reliability
 * - Retry with exponential backoff + circuit breaker
 * - Rate limiting (100/1000 RPM)
 * - Caching with TTL
 * - Schema validation
 * - Observability (latency, credits, cache hits)
 *
 * Features from CODEX.md:
 * - Supports topic:"news" with days parameter for recency
 * - Supports search_depth:"advanced" for better snippets (2 credits vs 1)
 * - Supports chunks_per_source for snippet quality
 * - Domain filtering for trusted sources
 */
export async function tavilySearch(
  query: string,
  opts?: TavilySearchOptions
) {
  if (!key || key === "undefined" || key === "null" || !key.trim()) {
    console.error("[Tavily] TAVILY_API_KEY is not configured");
    return {
      query,
      results: [],
      error: "TAVILY_API_KEY not configured"
    };
  }

  // Check cache first
  const cached = SearchCache.get(query, {
    topic: opts?.topic,
    search_depth: opts?.search_depth,
    days: opts?.days,
    include_domains: opts?.include_domains,
    exclude_domains: opts?.exclude_domains,
    max_results: opts?.max_results,
  });

  if (cached) {
    await instrumentOperation(
      `search: "${query}"`,
      'search',
      async () => cached,
      {
        depth: opts?.search_depth,
        cacheHit: true,
      }
    );
    return cached;
  }

  // Execute with full production stack
  return await instrumentOperation(
    `search: "${query}"`,
    'search',
    async () => {
      return await rateLimitedRequest(async () => {
        return await resilientRequest('search', async () => {
          const requestBody: any = {
            api_key: key,
            query,
            include_answer: false,
            max_results: opts?.max_results ?? 5,
            search_depth: opts?.search_depth ?? "basic",
            include_raw_content: opts?.include_raw_content ?? false,
          };

          // Add topic (enables published_date when topic:"news")
          if (opts?.topic) {
            requestBody.topic = opts.topic;
          }

          // Add days parameter (only valid with topic:"news")
          if (opts?.days && opts?.topic === "news") {
            requestBody.days = opts.days;
          }

          // Legacy time_range support
          if (opts?.time_range && !opts?.days) {
            requestBody.time_range = opts.time_range;
          }

          // Add chunks_per_source (only with search_depth:"advanced")
          if (opts?.chunks_per_source && opts?.search_depth === "advanced") {
            requestBody.chunks_per_source = opts.chunks_per_source;
          }

          // Domain filtering
          if (opts?.include_domains && opts.include_domains.length > 0) {
            requestBody.include_domains = opts.include_domains;
          }
          if (opts?.exclude_domains && opts.exclude_domains.length > 0) {
            requestBody.exclude_domains = opts.exclude_domains;
          }

          const r = await http(SEARCH_API, {
            method: "POST",
            body: requestBody,
          });

          // Debug: Check if response is undefined/null
          if (r === undefined || r === null) {
            console.error(`[Tavily Search] ERROR: Received ${r} response from API`);
            console.error(`[Tavily Search] Request body:`, JSON.stringify(requestBody, null, 2));
            throw new Error(`Tavily API returned ${r} response`);
          }

          // Validate response schema
          const validation = validateSearchResponse(r);
          if (!validation.success) {
            console.error(`[Tavily Search] Schema validation failed for query: "${query}"`);
            console.error(`[Tavily Search] Validation errors:`, JSON.stringify(validation.error, null, 2));
            console.error(`[Tavily Search] Actual response type:`, typeof r);
            console.error(`[Tavily Search] Actual response:`, JSON.stringify(r, null, 2));
            throw new Error(`Invalid search response schema: ${JSON.stringify(validation.error)}`);
          }

          if ((r as any)?.error) {
            throw new Error((r as any).error);
          }

          const results: TavilySearchResult[] = ((r as any)?.results ?? []).map((x: any) => ({
            title: x.title,
            url: x.url,
            snippet: x.snippet,
            publishedAt: x.published_date,
            score: x.score,
            raw_content: x.raw_content,
          }));

          const response = { query, results };

          // Cache the result
          const ttl = opts?.topic === 'news' ? CacheTTL.SEARCH_NEWS : CacheTTL.SEARCH_GENERAL;
          SearchCache.set(query, {
            topic: opts?.topic,
            search_depth: opts?.search_depth,
            days: opts?.days,
            include_domains: opts?.include_domains,
            exclude_domains: opts?.exclude_domains,
            max_results: opts?.max_results,
          }, response, ttl);

          return response;
        });
      });
    },
    {
      depth: opts?.search_depth,
      cacheHit: false,
    }
  ).catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Tavily Search] Error:`, errorMessage);
    return {
      query,
      results: [],
      error: errorMessage
    };
  });
}

/**
 * Tavily Extract with production features
 * - Cache by URL + etag
 * - Rate limiting + retry + circuit breaker
 * - Schema validation
 * - Observability
 */
export async function tavilyExtract(opts: TavilyExtractOptions) {
  if (!key || key === "undefined" || key === "null" || !key.trim()) {
    return { results: [], error: "TAVILY_API_KEY not configured" };
  }

  // Check cache for each URL
  const cachedResults: any[] = [];
  const urlsToFetch: string[] = [];

  for (const url of opts.urls) {
    const cached = ExtractCache.get(url, opts.extract_depth);
    if (cached) {
      cachedResults.push(cached.data);
    } else {
      urlsToFetch.push(url);
    }
  }

  if (urlsToFetch.length === 0) {
    // All cached
    await instrumentOperation(
      `extract: ${opts.urls.length} URLs (all cached)`,
      'extract',
      async () => ({ results: cachedResults }),
      { urlCount: opts.urls.length, depth: opts.extract_depth, cacheHit: true }
    );
    return { results: cachedResults };
  }

  // Fetch uncached URLs
  return await instrumentOperation(
    `extract: ${urlsToFetch.length} URLs`,
    'extract',
    async () => {
      return await rateLimitedRequest(async () => {
        return await resilientRequest('extract', async () => {
          const requestBody: any = {
            api_key: key,
            urls: urlsToFetch,
            extract_depth: opts.extract_depth ?? "basic",
            format: opts.format ?? "markdown",
            include_images: opts.include_images ?? false,
          };

          const r = await http(EXTRACT_API, { method: "POST", body: requestBody });

          const validation = validateExtractResponse(r);
          if (!validation.success) {
            throw new Error(`Invalid extract response: ${JSON.stringify(validation.error)}`);
          }

          if ((r as any)?.error) throw new Error((r as any).error);

          const results = (r as any)?.results ?? [];

          // Cache successful extracts
          results.forEach((result: any) => {
            if (result.success) {
              const ttl = result.url.includes('sec.gov') ? CacheTTL.EXTRACT_SEC : CacheTTL.EXTRACT_IR;
              ExtractCache.set(result.url, result, opts.extract_depth, ttl);
            }
          });

          return { results: [...cachedResults, ...results] };
        });
      });
    },
    { urlCount: urlsToFetch.length, depth: opts.extract_depth, cacheHit: false }
  ).catch(error => ({
    results: cachedResults,
    error: error instanceof Error ? error.message : String(error),
  }));
}

/**
 * Tavily Map with production features
 */
export async function tavilyMap(opts: TavilyMapOptions) {
  if (!key || key === "undefined" || key === "null" || !key.trim()) {
    return { results: [], error: "TAVILY_API_KEY not configured" };
  }

  return await instrumentOperation(
    `map: ${opts.url}`,
    'map',
    async () => {
      return await rateLimitedRequest(async () => {
        return await resilientRequest('map', async () => {
          const requestBody: any = {
            api_key: key,
            url: opts.url,
            max_depth: opts.max_depth ?? 2,
            max_breadth: opts.max_breadth ?? 50,
          };

          if (opts.limit) requestBody.limit = opts.limit;
          if (opts.select_paths) requestBody.select_paths = opts.select_paths;
          if (opts.exclude_paths) requestBody.exclude_paths = opts.exclude_paths;
          if (opts.instructions) requestBody.instructions = opts.instructions;

          const r = await http(MAP_API, { method: "POST", body: requestBody });

          const validation = validateMapResponse(r);
          if (!validation.success) {
            throw new Error(`Invalid map response: ${JSON.stringify(validation.error)}`);
          }

          if ((r as any)?.error) throw new Error((r as any).error);

          return { results: (r as any)?.results ?? [] };
        });
      });
    },
    { pageCount: opts.max_breadth, cacheHit: false }
  ).catch(error => ({
    results: [],
    error: error instanceof Error ? error.message : String(error),
  }));
}

/**
 * Tavily Crawl with production features
 */
export async function tavilyCrawl(opts: TavilyCrawlOptions) {
  if (!key || key === "undefined" || key === "null" || !key.trim()) {
    return { results: [], error: "TAVILY_API_KEY not configured" };
  }

  return await instrumentOperation(
    `crawl: ${opts.url}`,
    'crawl',
    async () => {
      return await rateLimitedRequest(async () => {
        return await resilientRequest('crawl', async () => {
          const requestBody: any = {
            api_key: key,
            url: opts.url,
            max_depth: opts.max_depth ?? 1,
            max_breadth: opts.max_breadth ?? 50,
            limit: opts.limit ?? 100,
            extract_depth: opts.extract_depth ?? "basic",
          };

          if (opts.select_paths) requestBody.select_paths = opts.select_paths;
          if (opts.exclude_paths) requestBody.exclude_paths = opts.exclude_paths;

          const r = await http(CRAWL_API, { method: "POST", body: requestBody });

          const validation = validateCrawlResponse(r);
          if (!validation.success) {
            throw new Error(`Invalid crawl response: ${JSON.stringify(validation.error)}`);
          }

          if ((r as any)?.error) throw new Error((r as any).error);

          return { results: (r as any)?.results ?? [] };
        });
      });
    },
    { pageCount: opts.limit, depth: opts.extract_depth, cacheHit: false }
  ).catch(error => ({
    results: [],
    error: error instanceof Error ? error.message : String(error),
  }));
}
