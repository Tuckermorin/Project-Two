/**
 * Time-Travel RAG Service
 *
 * Provides RAG queries with date filtering for backtesting
 * Allows the AI to only see historical context available at a specific point in time
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embedding-service';
import type { HistoricalPerformance, EnrichedTradeContext } from './trade-context-enrichment-service';

interface SimilarTradeWithDate {
  trade_id: string;
  similarity: number;
  metadata: {
    symbol: string;
    strategy: string;
    delta?: number;
    iv_rank?: number;
    dte?: number;
    win: boolean;
    realized_pnl: number;
    realized_pnl_percent: number;
    entry_date: string;
    exit_date: string;
    ips_score?: number;
  };
}

export class TimeTravelRAGService {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Find similar trades that were closed BEFORE a specific date
   * This is the key to time-travel backtesting
   */
  async findSimilarTradesBeforeDate(
    candidate: {
      symbol: string;
      strategy_type: string;
      delta?: number;
      iv_rank?: number;
      dte?: number;
      short_strike?: number;
      long_strike?: number;
      credit_received?: number;
    },
    beforeDate: Date,
    userId: string,
    options: {
      matchThreshold?: number;
      matchCount?: number;
    } = {}
  ): Promise<SimilarTradeWithDate[]> {
    const { matchThreshold = 0.75, matchCount = 20 } = options;

    console.log(`[TimeTravelRAG] Finding similar trades for ${candidate.symbol} before ${beforeDate.toISOString()}`);

    try {
      // Build query context from candidate
      const queryText = this.buildCandidateContext(candidate);

      // Generate embedding
      const queryEmbedding = await generateEmbedding(queryText);

      // Query database with date filter
      const { data, error } = await this.supabase.rpc('match_trades_before_date', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        before_date: beforeDate.toISOString(),
        p_user_id: userId,
      });

      if (error) {
        console.error('[TimeTravelRAG] Error querying similar trades:', error);
        return [];
      }

      console.log(`[TimeTravelRAG] Found ${data?.length || 0} similar trades before ${beforeDate.toISOString()}`);

      return (data || []).map((r: any) => ({
        trade_id: r.trade_id,
        similarity: r.similarity,
        metadata: r.metadata,
      }));
    } catch (error: any) {
      console.error(`[TimeTravelRAG] Failed to find similar trades:`, error.message);
      return [];
    }
  }

  /**
   * Get historical performance for a symbol as of a specific date
   * Only includes trades closed before the specified date
   */
  async getHistoricalPerformanceBeforeDate(
    symbol: string,
    beforeDate: Date,
    userId: string
  ): Promise<HistoricalPerformance> {
    console.log(`[TimeTravelRAG] Getting historical performance for ${symbol} before ${beforeDate.toISOString()}`);

    try {
      const { data, error } = await this.supabase.rpc('get_historical_performance_before_date', {
        p_symbol: symbol,
        p_before_date: beforeDate.toISOString(),
        p_user_id: userId,
      });

      if (error || !data || data.length === 0) {
        console.log(`[TimeTravelRAG] No historical data found for ${symbol} before ${beforeDate.toISOString()}`);
        return this.getEmptyHistoricalPerformance(symbol);
      }

      const stats = data[0];

      return {
        symbol,
        total_trades: Number(stats.total_trades || 0),
        winning_trades: Number(stats.winning_trades || 0),
        losing_trades: Number(stats.losing_trades || 0),
        win_rate: Number(stats.win_rate || 0),
        avg_roi: Number(stats.avg_roi || 0),
        avg_dte: Number(stats.avg_dte || 0),
        strategy_breakdown: stats.strategy_breakdown || {},
        recent_trades: (stats.recent_trades || []).map((t: any) => ({
          id: t.id,
          strategy_type: t.strategy_type,
          realized_pl: t.realized_pnl,
          realized_pl_percent: t.realized_pl_percent,
          created_at: t.created_at,
          closed_at: t.closed_at,
        })),
      };
    } catch (error: any) {
      console.error(`[TimeTravelRAG] Error fetching historical performance:`, error.message);
      return this.getEmptyHistoricalPerformance(symbol);
    }
  }

  /**
   * Get "similar trades" in the format expected by EnrichedTradeContext
   */
  async getSimilarTradesForContext(
    candidate: any,
    beforeDate: Date,
    userId: string
  ): Promise<EnrichedTradeContext['similar_trades']> {
    const similarTrades = await this.findSimilarTradesBeforeDate(
      candidate,
      beforeDate,
      userId,
      { matchThreshold: 0.75, matchCount: 10 }
    );

    return similarTrades.map(t => ({
      similarity_score: t.similarity,
      trade_id: t.trade_id,
      outcome: t.metadata.win ? 'win' as const : 'loss' as const,
      realized_pl_percent: t.metadata.realized_pnl_percent,
      context_summary: this.buildTradeSummary(t.metadata),
    }));
  }

  /**
   * Build context text for a trade candidate
   */
  private buildCandidateContext(candidate: any): string {
    const lines: string[] = [
      `Symbol: ${candidate.symbol}`,
      `Strategy: ${candidate.strategy_type}`,
    ];

    if (candidate.short_strike != null) {
      lines.push(`Short Strike: $${candidate.short_strike}`);
    }

    if (candidate.long_strike != null) {
      lines.push(`Long Strike: $${candidate.long_strike}`);
    }

    if (candidate.credit_received != null) {
      lines.push(`Credit: $${candidate.credit_received}`);
    }

    if (candidate.delta != null) {
      lines.push(`Delta: ${Math.abs(candidate.delta).toFixed(3)}`);
    }

    if (candidate.iv_rank != null) {
      lines.push(`IV Rank: ${candidate.iv_rank}`);
    }

    if (candidate.dte != null) {
      lines.push(`DTE: ${candidate.dte}`);
    }

    return lines.join('\n');
  }

  /**
   * Build summary for a similar trade
   */
  private buildTradeSummary(metadata: any): string {
    const outcome = metadata.win ? 'WIN' : 'LOSS';
    const roi = metadata.realized_pnl_percent?.toFixed(1) || 'N/A';
    const delta = metadata.delta ? `delta ${Math.abs(metadata.delta).toFixed(2)}` : '';
    const dte = metadata.dte ? `${metadata.dte} DTE` : '';

    return `${metadata.strategy || 'Unknown'} ${delta} ${dte} → ${outcome} (${roi}% ROI)`.trim();
  }

  /**
   * Get empty historical performance structure
   */
  private getEmptyHistoricalPerformance(symbol: string): HistoricalPerformance {
    return {
      symbol,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      avg_roi: 0,
      avg_dte: 0,
      strategy_breakdown: {},
      recent_trades: [],
    };
  }
}

// Singleton instance
let timeTravelRAGInstance: TimeTravelRAGService | null = null;

export function getTimeTravelRAGService(): TimeTravelRAGService {
  if (!timeTravelRAGInstance) {
    timeTravelRAGInstance = new TimeTravelRAGService();
  }
  return timeTravelRAGInstance;
}
