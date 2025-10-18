// Historical Data Collection Service
// Collects and stores historical options and stock data from Alpha Vantage

import { getAlphaVantageClient } from '../api/alpha-vantage';
import { getSupabaseServer } from '../utils/supabase-server';
import PQueue from 'p-queue';

const supabase = getSupabaseServer();

interface BackfillProgress {
  symbol: string;
  dataType: 'options' | 'daily' | 'intraday';
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  recordsCollected: number;
  errorMessage?: string;
}

interface CollectionStats {
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  errors: string[];
}

export class HistoricalDataCollector {
  private avClient = getAlphaVantageClient();
  private queue: PQueue;

  constructor(concurrency: number = 10) {
    // With 600 calls/min, we can do 10 calls/second safely
    this.queue = new PQueue({
      concurrency,
      interval: 1000,
      intervalCap: 10,
    });
  }

  /**
   * Collect historical options data for a specific date
   */
  async collectHistoricalOptions(symbol: string, date: string): Promise<CollectionStats> {
    const stats: CollectionStats = {
      totalRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      errors: [],
    };

    try {
      console.log(`[${symbol}] Fetching options data for ${date}...`);

      const contracts = await this.queue.add(() =>
        this.avClient.getHistoricalOptions(symbol, { date })
      );

      if (!contracts || contracts.length === 0) {
        console.log(`[${symbol}] No options data found for ${date}`);
        return stats;
      }

      stats.totalRecords = contracts.length;

      // Batch insert for performance
      const batchSize = 500;
      for (let i = 0; i < contracts.length; i += batchSize) {
        const batch = contracts.slice(i, i + batchSize);

        const rows = batch.map(contract => ({
          symbol: symbol.toUpperCase(),
          contract_id: contract.contractId,
          snapshot_date: date,
          expiration_date: contract.expiration,
          strike: contract.strike,
          option_type: contract.type,
          bid: contract.bid,
          ask: contract.ask,
          last: contract.last,
          mark: contract.mark,
          volume: contract.volume,
          open_interest: contract.openInterest,
          bid_size: contract.bidSize,
          ask_size: contract.askSize,
          delta: contract.delta,
          gamma: contract.gamma,
          theta: contract.theta,
          vega: contract.vega,
          rho: contract.rho,
          implied_volatility: contract.impliedVolatility,
        }));

        const { error } = await supabase
          .from('historical_options_data')
          .upsert(rows, { onConflict: 'symbol,contract_id,snapshot_date' });

        if (error) {
          console.error(`[${symbol}] Error inserting batch:`, error);
          stats.failedRecords += batch.length;
          stats.errors.push(`Batch insert error: ${error.message}`);
        } else {
          stats.successfulRecords += batch.length;
        }
      }

      console.log(`[${symbol}] Collected ${stats.successfulRecords}/${stats.totalRecords} options contracts for ${date}`);
    } catch (error: any) {
      console.error(`[${symbol}] Failed to collect options for ${date}:`, error);
      stats.errors.push(error.message);
    }

    return stats;
  }

  /**
   * Collect historical daily stock data
   */
  async collectHistoricalDaily(symbol: string, outputSize: 'compact' | 'full' = 'full'): Promise<CollectionStats> {
    const stats: CollectionStats = {
      totalRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      errors: [],
    };

    try {
      console.log(`[${symbol}] Fetching daily stock data (${outputSize})...`);

      const series = await this.queue.add(() =>
        this.avClient.getDailyAdjustedSeries(symbol, outputSize)
      );

      if (!series || Object.keys(series).length === 0) {
        console.log(`[${symbol}] No daily data found`);
        return stats;
      }

      const dates = Object.keys(series);
      stats.totalRecords = dates.length;

      // Batch insert
      const batchSize = 500;
      const rows = dates.map(date => {
        const data = series[date];
        return {
          symbol: symbol.toUpperCase(),
          date,
          open: parseFloat(data['1. open']),
          high: parseFloat(data['2. high']),
          low: parseFloat(data['3. low']),
          close: parseFloat(data['4. close']),
          volume: parseInt(data['6. volume']),
          adjusted_close: parseFloat(data['5. adjusted close']),
          dividend_amount: parseFloat(data['7. dividend amount'] || '0'),
          split_coefficient: parseFloat(data['8. split coefficient'] || '1'),
        };
      });

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        const { error } = await supabase
          .from('historical_stock_data')
          .upsert(batch, { onConflict: 'symbol,date' });

        if (error) {
          console.error(`[${symbol}] Error inserting daily data batch:`, error);
          stats.failedRecords += batch.length;
          stats.errors.push(`Batch insert error: ${error.message}`);
        } else {
          stats.successfulRecords += batch.length;
        }
      }

      console.log(`[${symbol}] Collected ${stats.successfulRecords}/${stats.totalRecords} daily records`);
    } catch (error: any) {
      console.error(`[${symbol}] Failed to collect daily data:`, error);
      stats.errors.push(error.message);
    }

    return stats;
  }

  /**
   * Backfill options data for a date range
   */
  async backfillOptionsDateRange(
    symbol: string,
    startDate: Date,
    endDate: Date,
    onProgress?: (date: string, stats: CollectionStats) => void
  ): Promise<void> {
    // Track progress
    const taskId = await this.createBackfillTask(symbol, 'options', startDate, endDate);

    try {
      await this.updateBackfillStatus(taskId, 'in_progress');

      let totalRecords = 0;
      const currentDate = new Date(startDate);
      const dates: string[] = [];

      // Generate list of trading days (we'll collect all and filter later)
      while (currentDate <= endDate) {
        // Skip weekends
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          dates.push(currentDate.toISOString().split('T')[0]);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.log(`[${symbol}] Backfilling ${dates.length} days from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

      // Sample strategically: collect data for every 5th trading day to save API calls
      // This gives us a good historical dataset without overwhelming the system
      const sampledDates = dates.filter((_, index) => index % 5 === 0);

      console.log(`[${symbol}] Sampling ${sampledDates.length} days (every 5th day)`);

      for (const date of sampledDates) {
        const stats = await this.collectHistoricalOptions(symbol, date);
        totalRecords += stats.successfulRecords;

        if (onProgress) {
          onProgress(date, stats);
        }

        // Small delay between dates
        await this.delay(100);
      }

      await this.updateBackfillStatus(taskId, 'completed', totalRecords);
      console.log(`[${symbol}] Backfill complete: ${totalRecords} total records`);
    } catch (error: any) {
      console.error(`[${symbol}] Backfill failed:`, error);
      await this.updateBackfillStatus(taskId, 'failed', 0, error.message);
      throw error;
    }
  }

  /**
   * Backfill data for multiple symbols
   */
  async backfillMultipleSymbols(
    symbols: string[],
    startDate: Date,
    endDate: Date,
    dataTypes: Array<'options' | 'daily'> = ['options', 'daily']
  ): Promise<void> {
    console.log(`Starting backfill for ${symbols.length} symbols...`);
    console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`Data types: ${dataTypes.join(', ')}`);

    for (const symbol of symbols) {
      try {
        console.log(`\n=== Processing ${symbol} ===`);

        // Collect daily data first (more compact, gives price context)
        if (dataTypes.includes('daily')) {
          await this.collectHistoricalDaily(symbol, 'full');
        }

        // Then collect options data
        if (dataTypes.includes('options')) {
          await this.backfillOptionsDateRange(symbol, startDate, endDate);
        }

        // Delay between symbols
        await this.delay(2000);
      } catch (error) {
        console.error(`Failed to process ${symbol}:`, error);
        // Continue with next symbol
      }
    }

    console.log('\n=== Backfill Complete ===');
  }

  /**
   * Create a backfill task record
   */
  private async createBackfillTask(
    symbol: string,
    dataType: 'options' | 'daily' | 'intraday',
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const { data, error } = await supabase
      .from('historical_data_backfill_progress')
      .insert({
        symbol: symbol.toUpperCase(),
        data_type: dataType,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'pending',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create backfill task:', error);
      throw error;
    }

    return data.id;
  }

  /**
   * Update backfill task status
   */
  private async updateBackfillStatus(
    taskId: string,
    status: 'in_progress' | 'completed' | 'failed',
    recordsCollected?: number,
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (recordsCollected !== undefined) {
      updateData.records_collected = recordsCollected;
    }

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('historical_data_backfill_progress')
      .update(updateData)
      .eq('id', taskId);

    if (error) {
      console.error('Failed to update backfill status:', error);
    }
  }

  /**
   * Check what data we already have
   */
  async getDataCoverage(symbol: string, dataType: 'options' | 'daily'): Promise<{
    earliestDate: string | null;
    latestDate: string | null;
    totalRecords: number;
  }> {
    const table = dataType === 'options' ? 'historical_options_data' : 'historical_stock_data';
    const dateColumn = dataType === 'options' ? 'snapshot_date' : 'date';

    const { data, error } = await supabase
      .from(table)
      .select(dateColumn)
      .eq('symbol', symbol.toUpperCase())
      .order(dateColumn, { ascending: true });

    if (error || !data || data.length === 0) {
      return { earliestDate: null, latestDate: null, totalRecords: 0 };
    }

    return {
      earliestDate: data[0][dateColumn],
      latestDate: data[data.length - 1][dateColumn],
      totalRecords: data.length,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let collector: HistoricalDataCollector;

export function getHistoricalDataCollector(): HistoricalDataCollector {
  if (!collector) {
    collector = new HistoricalDataCollector(10); // 10 concurrent requests
  }
  return collector;
}
