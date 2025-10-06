/**
 * Observability layer for Tavily API calls
 * - Latency tracking
 * - Credit usage estimation
 * - Cache hit/miss tracking
 * - Error tracking
 * - Metrics aggregation
 */

/**
 * Credit cost estimation per operation
 */
const CREDIT_COSTS = {
  search_basic: 1,
  search_advanced: 2,
  extract_basic: 0.2,      // 1 credit per 5 URLs
  extract_advanced: 0.4,    // 2 credits per 5 URLs
  map_basic: 0.1,          // ~1 credit per 10 pages
  map_advanced: 0.2,       // ~2 credits per 10 pages with instructions
  crawl: 0.1,              // Variable, estimate conservatively
};

/**
 * Metric entry
 */
interface MetricEntry {
  operation: string;
  endpoint: 'search' | 'extract' | 'map' | 'crawl';
  latencyMs: number;
  creditsEstimated: number;
  cacheHit: boolean;
  success: boolean;
  errorType?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Aggregated metrics
 */
interface AggregatedMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalCreditsEstimated: number;
  byEndpoint: Record<string, {
    requests: number;
    avgLatency: number;
    creditsEstimated: number;
    cacheHitRate: number;
  }>;
  errors: Record<string, number>;
}

/**
 * Metrics store (in-memory, rolling window)
 */
class MetricsStore {
  private metrics: MetricEntry[] = [];
  private maxEntries: number = 10000;
  private windowMs: number = 24 * 60 * 60 * 1000; // 24 hours

  add(entry: MetricEntry): void {
    this.metrics.push(entry);

    // Trim old entries
    const cutoff = Date.now() - this.windowMs;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);

    // Trim to max size
    if (this.metrics.length > this.maxEntries) {
      this.metrics = this.metrics.slice(-this.maxEntries);
    }
  }

  getAll(): MetricEntry[] {
    return [...this.metrics];
  }

  getRecent(count: number): MetricEntry[] {
    return this.metrics.slice(-count);
  }

  clear(): void {
    this.metrics = [];
  }

  aggregate(): AggregatedMetrics {
    if (this.metrics.length === 0) {
      return this.emptyMetrics();
    }

    const successful = this.metrics.filter(m => m.success);
    const failed = this.metrics.filter(m => !m.success);
    const cacheHits = this.metrics.filter(m => m.cacheHit);
    const cacheMisses = this.metrics.filter(m => !m.cacheHit);

    // Calculate latency percentiles
    const latencies = this.metrics.map(m => m.latencyMs).sort((a, b) => a - b);
    const p50 = this.percentile(latencies, 0.5);
    const p95 = this.percentile(latencies, 0.95);
    const p99 = this.percentile(latencies, 0.99);

    // Aggregate by endpoint
    const byEndpoint: Record<string, any> = {};
    ['search', 'extract', 'map', 'crawl'].forEach(endpoint => {
      const endpointMetrics = this.metrics.filter(m => m.endpoint === endpoint);
      if (endpointMetrics.length > 0) {
        const hits = endpointMetrics.filter(m => m.cacheHit).length;
        byEndpoint[endpoint] = {
          requests: endpointMetrics.length,
          avgLatency: endpointMetrics.reduce((sum, m) => sum + m.latencyMs, 0) / endpointMetrics.length,
          creditsEstimated: endpointMetrics.reduce((sum, m) => sum + m.creditsEstimated, 0),
          cacheHitRate: (hits / endpointMetrics.length) * 100,
        };
      }
    });

    // Aggregate errors
    const errors: Record<string, number> = {};
    failed.forEach(m => {
      const errorType = m.errorType || 'unknown';
      errors[errorType] = (errors[errorType] || 0) + 1;
    });

    return {
      totalRequests: this.metrics.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      cacheHits: cacheHits.length,
      cacheMisses: cacheMisses.length,
      totalLatencyMs: this.metrics.reduce((sum, m) => sum + m.latencyMs, 0),
      avgLatencyMs: this.metrics.reduce((sum, m) => sum + m.latencyMs, 0) / this.metrics.length,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      totalCreditsEstimated: this.metrics.reduce((sum, m) => sum + m.creditsEstimated, 0),
      byEndpoint,
      errors,
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private emptyMetrics(): AggregatedMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      totalCreditsEstimated: 0,
      byEndpoint: {},
      errors: {},
    };
  }
}

/**
 * Global metrics store
 */
const metricsStore = new MetricsStore();

/**
 * Estimate credits for an operation
 */
export function estimateCredits(
  endpoint: 'search' | 'extract' | 'map' | 'crawl',
  options: {
    depth?: 'basic' | 'advanced';
    urlCount?: number;
    pageCount?: number;
  } = {}
): number {
  switch (endpoint) {
    case 'search':
      return options.depth === 'advanced' ? CREDIT_COSTS.search_advanced : CREDIT_COSTS.search_basic;

    case 'extract':
      const urlCount = options.urlCount || 1;
      const extractCost = options.depth === 'advanced' ? CREDIT_COSTS.extract_advanced : CREDIT_COSTS.extract_basic;
      return urlCount * extractCost;

    case 'map':
      const pageCount = options.pageCount || 10;
      const mapCost = CREDIT_COSTS.map_basic;
      return (pageCount / 10) * mapCost;

    case 'crawl':
      return CREDIT_COSTS.crawl * (options.pageCount || 10);

    default:
      return 0;
  }
}

/**
 * Track an operation
 */
export function trackOperation(
  operation: string,
  endpoint: 'search' | 'extract' | 'map' | 'crawl',
  latencyMs: number,
  options: {
    depth?: 'basic' | 'advanced';
    urlCount?: number;
    pageCount?: number;
    cacheHit?: boolean;
    success?: boolean;
    errorType?: string;
    metadata?: Record<string, any>;
  } = {}
): void {
  const creditsEstimated = estimateCredits(endpoint, {
    depth: options.depth,
    urlCount: options.urlCount,
    pageCount: options.pageCount,
  });

  const entry: MetricEntry = {
    operation,
    endpoint,
    latencyMs,
    creditsEstimated: options.cacheHit ? 0 : creditsEstimated, // No credits for cache hits
    cacheHit: options.cacheHit ?? false,
    success: options.success ?? true,
    errorType: options.errorType,
    timestamp: Date.now(),
    metadata: options.metadata,
  };

  metricsStore.add(entry);

  // Log the operation
  const cacheLabel = entry.cacheHit ? '[CACHE HIT]' : '[CACHE MISS]';
  const statusLabel = entry.success ? '✓' : '✗';
  console.log(
    `${statusLabel} ${cacheLabel} [${endpoint.toUpperCase()}] ${operation} - ${latencyMs}ms, ~${creditsEstimated.toFixed(2)} credits`
  );
}

/**
 * Instrumented operation wrapper
 */
export async function instrumentOperation<T>(
  operation: string,
  endpoint: 'search' | 'extract' | 'map' | 'crawl',
  fn: () => Promise<T>,
  options: {
    depth?: 'basic' | 'advanced';
    urlCount?: number;
    pageCount?: number;
    cacheHit?: boolean;
    metadata?: Record<string, any>;
  } = {}
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const latencyMs = Date.now() - startTime;

    trackOperation(operation, endpoint, latencyMs, {
      ...options,
      success: true,
    });

    return result;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    trackOperation(operation, endpoint, latencyMs, {
      ...options,
      success: false,
      errorType: error.name || error.constructor?.name || 'Error',
    });

    throw error;
  }
}

/**
 * Get metrics summary
 */
export function getMetrics(): AggregatedMetrics {
  return metricsStore.aggregate();
}

/**
 * Get recent operations (for debugging)
 */
export function getRecentOperations(count: number = 100): MetricEntry[] {
  return metricsStore.getRecent(count);
}

/**
 * Clear metrics (for testing)
 */
export function clearMetrics(): void {
  metricsStore.clear();
  console.log('[Observability] Metrics cleared');
}

/**
 * Generate metrics report
 */
export function generateMetricsReport(): string {
  const metrics = getMetrics();

  const lines = [
    '=== Tavily API Metrics Report ===',
    '',
    `Total Requests: ${metrics.totalRequests}`,
    `  - Successful: ${metrics.successfulRequests} (${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%)`,
    `  - Failed: ${metrics.failedRequests} (${((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(1)}%)`,
    '',
    `Cache Performance:`,
    `  - Hits: ${metrics.cacheHits} (${((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(1)}%)`,
    `  - Misses: ${metrics.cacheMisses} (${((metrics.cacheMisses / metrics.totalRequests) * 100).toFixed(1)}%)`,
    '',
    `Latency:`,
    `  - Average: ${metrics.avgLatencyMs.toFixed(0)}ms`,
    `  - P50: ${metrics.p50LatencyMs.toFixed(0)}ms`,
    `  - P95: ${metrics.p95LatencyMs.toFixed(0)}ms`,
    `  - P99: ${metrics.p99LatencyMs.toFixed(0)}ms`,
    '',
    `Estimated Credits: ${metrics.totalCreditsEstimated.toFixed(2)}`,
    '',
    'By Endpoint:',
  ];

  Object.entries(metrics.byEndpoint).forEach(([endpoint, stats]) => {
    lines.push(`  ${endpoint}:`);
    lines.push(`    - Requests: ${stats.requests}`);
    lines.push(`    - Avg Latency: ${stats.avgLatency.toFixed(0)}ms`);
    lines.push(`    - Credits: ${stats.creditsEstimated.toFixed(2)}`);
    lines.push(`    - Cache Hit Rate: ${stats.cacheHitRate.toFixed(1)}%`);
  });

  if (Object.keys(metrics.errors).length > 0) {
    lines.push('');
    lines.push('Errors:');
    Object.entries(metrics.errors).forEach(([errorType, count]) => {
      lines.push(`  - ${errorType}: ${count}`);
    });
  }

  return lines.join('\n');
}

/**
 * Export types
 */
export type { MetricEntry, AggregatedMetrics };
