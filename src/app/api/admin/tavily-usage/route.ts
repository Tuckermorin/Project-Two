// API Route: Tavily Usage Monitoring
// GET /api/admin/tavily-usage - Get comprehensive Tavily usage metrics

import { NextRequest, NextResponse } from "next/server";
import {
  getMetrics,
  generateMetricsReport,
  getOperationBreakdown,
} from "@/lib/clients/tavily-observability";
import { getCacheStats } from "@/lib/clients/tavily-cache";
import { getRateLimiterStatus } from "@/lib/clients/tavily-rate-limiter";
import { getCircuitBreakerStatus } from "@/lib/clients/tavily-resilience";
import { getRouterStats } from "@/lib/agent/rag-router";

export async function GET(request: NextRequest) {
  try {
    console.log("[API /admin/tavily-usage] Fetching usage metrics");

    // Get all system metrics
    const metrics = getMetrics();
    const cacheStats = getCacheStats();
    const rateLimiterStatus = getRateLimiterStatus();
    const circuitBreakerStatus = getCircuitBreakerStatus();
    const routerStats = getRouterStats();

    // Calculate daily/monthly projections
    const estimatedDailyCredits = metrics.totalCredits; // This resets daily in prod
    const estimatedMonthlyCredits = estimatedDailyCredits * 30;

    // Calculate cost (assuming $0.05 per credit - adjust based on your tier)
    const costPerCredit = 0.05;
    const estimatedDailyCost = estimatedDailyCredits * costPerCredit;
    const estimatedMonthlyCost = estimatedMonthlyCredits * costPerCredit;

    // Get detailed operation breakdown
    const operationBreakdown = getOperationBreakdown();

    // Calculate efficiency metrics
    const cacheHitRate =
      metrics.totalRequests > 0
        ? (metrics.cacheHits / metrics.totalRequests) * 100
        : 0;

    const successRate =
      metrics.totalRequests > 0
        ? ((metrics.totalRequests - metrics.totalFailures) / metrics.totalRequests) *
          100
        : 0;

    const avgCostPerRequest =
      metrics.totalRequests > 0
        ? (metrics.totalCredits / metrics.totalRequests) * costPerCredit
        : 0;

    // Build response
    const response = {
      success: true,
      data: {
        // Summary
        summary: {
          total_requests: metrics.totalRequests,
          total_credits_used: metrics.totalCredits,
          estimated_daily_cost: `$${estimatedDailyCost.toFixed(2)}`,
          estimated_monthly_cost: `$${estimatedMonthlyCost.toFixed(2)}`,
          cache_hit_rate: `${cacheHitRate.toFixed(1)}%`,
          success_rate: `${successRate.toFixed(1)}%`,
          avg_cost_per_request: `$${avgCostPerRequest.toFixed(4)}`,
        },

        // Detailed metrics
        metrics: {
          requests: {
            total: metrics.totalRequests,
            successful: metrics.totalRequests - metrics.totalFailures,
            failed: metrics.totalFailures,
            success_rate: successRate,
          },
          cache: {
            hits: metrics.cacheHits,
            misses: metrics.cacheMisses,
            hit_rate: cacheHitRate,
            search_cache_size: cacheStats.search.size,
            extract_cache_size: cacheStats.extract.size,
          },
          latency: {
            average_ms: metrics.avgLatency,
            p50_ms: metrics.p50Latency,
            p95_ms: metrics.p95Latency,
            p99_ms: metrics.p99Latency,
          },
          credits: {
            total_used: metrics.totalCredits,
            estimated_daily: estimatedDailyCredits,
            estimated_monthly: estimatedMonthlyCredits,
            remaining_this_month: Math.max(
              0,
              4000 - estimatedMonthlyCredits
            ), // Assuming 4000 credit plan
          },
          cost: {
            per_credit: costPerCredit,
            total_spent: `$${(metrics.totalCredits * costPerCredit).toFixed(2)}`,
            estimated_daily: `$${estimatedDailyCost.toFixed(2)}`,
            estimated_monthly: `$${estimatedMonthlyCost.toFixed(2)}`,
          },
        },

        // Operation breakdown
        operations: operationBreakdown,

        // RAG router statistics
        rag_router: {
          total_queries: routerStats.total_queries,
          rag_hits: routerStats.rag_hits,
          tavily_fetches: routerStats.tavily_fetches,
          hybrid_queries: routerStats.hybrid_queries,
          cache_hit_rate: `${routerStats.cache_hit_rate.toFixed(1)}%`,
          total_credits_saved_by_rag:
            routerStats.rag_hits * 2, // Assume 2 credits saved per RAG hit
          avg_credits_per_query: routerStats.avg_credits_per_query.toFixed(2),
        },

        // System health
        health: {
          rate_limiter: {
            tier: rateLimiterStatus.tier,
            available_tokens: rateLimiterStatus.status.availableTokens,
            capacity: rateLimiterStatus.status.capacity,
            utilization: `${rateLimiterStatus.status.utilizationPercent.toFixed(1)}%`,
            queue_size: rateLimiterStatus.status.queueSize,
          },
          circuit_breakers: circuitBreakerStatus,
        },

        // Text report (for easy viewing)
        text_report: generateMetricsReport(),
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[API /admin/tavily-usage] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch Tavily usage metrics",
      },
      { status: 500 }
    );
  }
}

// POST endpoint to reset metrics (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "reset") {
      // Import reset functions
      const { resetMetrics } = await import("@/lib/clients/tavily-observability");
      const { resetRouterStats } = await import("@/lib/agent/rag-router");

      resetMetrics();
      resetRouterStats();

      console.log("[API /admin/tavily-usage] Metrics reset");

      return NextResponse.json({
        success: true,
        message: "Metrics reset successfully",
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Unknown action",
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[API /admin/tavily-usage POST] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to perform action",
      },
      { status: 500 }
    );
  }
}
