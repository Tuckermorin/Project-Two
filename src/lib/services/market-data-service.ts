// src/lib/services/market-data-service.ts

import { getAlphaVantageClient, type FundamentalData } from '@/lib/api/alpha-vantage';
import { createClient } from '@supabase/supabase-js';

// Unified data types for our application
interface UnifiedStockData {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  avgVolume?: number;
  marketCap?: number;
  beta?: number;
  peRatio?: number;
  week52High?: number;
  week52Low?: number;
  lastUpdated: Date;
  
  // Fundamental metrics (from Alpha Vantage)
  fundamentals?: {
    revenue?: number;
    grossMargin?: number;
    operatingMargin?: number;
    netMargin?: number;
    eps?: number;
    bookValue?: number;
    pbRatio?: number;
    psRatio?: number;
    pegRatio?: number;
    evToEbitda?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
    currentRatio?: number;
    debtToEquity?: number;
    roe?: number;
    roa?: number;
    beta?: number;
    marketCap?: number;
    week52High?: number;
    week52Low?: number;
    dividendYield?: number;
    revenuePerShareTTM?: number;
  };
}

interface UnifiedOptionsData {
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  last?: number;
  volume: number;
  openInterest: number;
  
  // Greeks (from Tradier)
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    impliedVolatility: number;
  };
  
  lastUpdated: Date;
}

interface TradeSnapshot {
  tradeId: string;
  ipsName?: string;
  timestamp: Date;
  snapshotType: 'market_open' | 'midday' | 'market_close';
  
  // Market data at snapshot time
  currentPrice: number;
  premium: number;
  
  // Greeks at snapshot time
  delta?: number;
  theta?: number;
  gamma?: number;
  vega?: number;
  rho?: number;
  impliedVol?: number;
  
  // P&L calculations
  unrealizedPL: number;
  unrealizedPLPercent: number;
  
  // Position Greeks (for multiple contracts)
  positionDelta?: number;
  positionTheta?: number;
}

class MarketDataService {
  private alphaVantage = getAlphaVantageClient();
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  // Cache to avoid duplicate API calls
  private cache = new Map<string, { data: any; timestamp: Date; ttl: number }>();

  constructor() {
    // Clean up cache every hour
    setInterval(() => this.cleanupCache(), 60 * 60 * 1000);
  }

  // Calculate milliseconds until the next day for daily cache invalidation
  private getDailyTTL(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getTime() - now.getTime();
  }

/**
 * Get unified stock data with proper error handling and fallbacks
 */
    async getUnifiedStockData(symbol: string, includeFundamentals = true): Promise<UnifiedStockData> {
    console.log(`Getting unified stock data for ${symbol}`);
    
    try {
        // Use Alpha Vantage quote for current price data
        const gq = await this.alphaVantage.getQuote(symbol);
        const last = parseFloat(gq['05. price'] ?? '0');
        const prev = parseFloat(gq['08. previous close'] ?? '0');
        const vol = parseFloat(gq['06. volume'] ?? '0');
        const chg = parseFloat(gq['09. change'] ?? '0');
        const chgPctStr = String(gq['10. change percent'] ?? '0%');
        const chgPct = parseFloat(chgPctStr.replace('%',''));

        const quote = {
          symbol: gq['01. symbol'] || symbol,
          last: isFinite(last) ? last : 0,
          prevclose: isFinite(prev) ? prev : 0,
          change: isFinite(chg) ? chg : 0,
          change_percentage: isFinite(chgPct) ? chgPct : 0,
          volume: isFinite(vol) ? vol : 0,
          average_volume: 0,
        };

        let fundamentals;
        let currency: string | undefined;
        if (includeFundamentals) {
        // Check cache first for fundamentals (24 hour TTL)
        const cacheKey = `fundamentals_${symbol}`;
        const cached = this.getFromCache<any>(cacheKey); // Fix: only pass key if method expects 1 param
        
        // Check if cached data is still valid (if your cache doesn't handle TTL internally)
        const isExpired = cached && (Date.now() - cached.timestamp.getTime() > (24 * 60 * 60 * 1000));
        
        if (cached && !isExpired) {
            fundamentals = cached.data || cached; // Handle different cache structures
        } else {
            if (isExpired) {
            this.cache.delete(cacheKey); // Clean up expired cache
            }
            
            try {
            const fundamentalData = await this.alphaVantage.getCompleteFundamentalData(symbol);
            fundamentals = this.extractFundamentals(fundamentalData);
            currency = fundamentalData?.overview?.Currency || currency;
            
            // Fix: adjust setCache call based on your method signature
            this.setCache(cacheKey, {
                data: fundamentals,
                timestamp: new Date()
            }); // Only pass 2 params if method expects 2
            
            } catch (fundamentalError) {
            console.warn(`Failed to fetch fundamentals for ${symbol}:`, fundamentalError);
            
            fundamentals = {
                revenue: undefined,
                grossMargin: undefined,
                operatingMargin: undefined,
                netMargin: undefined,
                eps: undefined,
                bookValue: undefined,
                pbRatio: undefined,
                psRatio: undefined,
                pegRatio: undefined,
                evToEbitda: undefined,
                revenueGrowth: undefined,
                earningsGrowth: undefined,
                currentRatio: undefined,
                debtToEquity: undefined,
                roe: undefined,
                roa: undefined
            };
            }
        }
        }

        return {
        symbol: quote.symbol || symbol,
        currentPrice: quote.last || 0,
        previousClose: quote.prevclose || 0,
        priceChange: quote.change || 0,
        priceChangePercent: quote.change_percentage || 0,
        volume: quote.volume || 0,
        avgVolume: quote.average_volume,
        beta: fundamentals?.beta,
        peRatio: fundamentals?.pbRatio,
        week52High: fundamentals?.week52High,
        week52Low: fundamentals?.week52Low,
        marketCap: fundamentals?.marketCap,
        lastUpdated: new Date(),
        currency,
        fundamentals
        };

    } catch (error) {
        console.error(`Failed to get unified stock data for ${symbol}:`, error);
        
        return {
        symbol,
        currentPrice: 0,
        previousClose: 0,
        priceChange: 0,
        priceChangePercent: 0,
        volume: 0,
        avgVolume: 0,
        beta: undefined,
        peRatio: undefined,
        marketCap: undefined,
        lastUpdated: new Date(),
        fundamentals: undefined
        };
    }
    }

  async getFactor(params: { symbol: string; key: string }): Promise<number | string | null> {
    try {
      const stockData = await this.getUnifiedStockData(params.symbol, true);
      return this.mapFactorToStockData(params.key, stockData);
    } catch (error) {
      console.error(`Error fetching factor ${params.key} for ${params.symbol}:`, error);
      return null;
    }
  }

  private mapFactorToStockData(factorKey: string, stockData: UnifiedStockData): number | string | null {
    switch (factorKey.toLowerCase()) {
      case 'pe_ratio':
      case 'p_e_ratio':
        return stockData.fundamentals?.eps && stockData.currentPrice
          ? stockData.currentPrice / stockData.fundamentals.eps
          : null;
      case 'beta':
        return stockData.beta || null;
      case 'market_cap':
        return stockData.marketCap || null;
      case 'revenue_growth':
        return stockData.fundamentals?.revenueGrowth || null;
      default:
        return null;
    }
  }

  /**
   * Get options data for a specific trade
   */
  async getOptionsData(
    symbol: string,
    strike: number,
    expiration: string,
    optionType: 'call' | 'put',
    forceRefresh = false
  ): Promise<UnifiedOptionsData | null> {
    console.log(`Getting options data for ${symbol} ${strike}${optionType.charAt(0).toUpperCase()} ${expiration}`);

    const cacheKey = `option_${symbol}_${strike}_${expiration}_${optionType}`;
    if (!forceRefresh) {
      const cached = this.getFromCache<UnifiedOptionsData>(cacheKey);
      if (cached) return cached;
    }

    try {
      // Options API not integrated (Tradier removed)
      console.warn('Options data is not integrated; returning null');
      return null;
    } catch (error) {
      console.error(`Error fetching options data:`, error);
      return null;
    }
  }

  /**
   * Update watchlist with current market data
   */
  async updateWatchlist(): Promise<void> {
    console.log('Updating watchlist prices');
    
    try {
      // Get all watchlist stocks from database
      const { data: watchlistStocks, error } = await this.supabase
        .from('watchlist_stocks')
        .select('symbol');

      if (error) {
        throw new Error(`Failed to fetch watchlist: ${error.message}`);
      }

      if (!watchlistStocks || watchlistStocks.length === 0) {
        console.log('No stocks in watchlist');
        return;
      }

      const symbols = watchlistStocks.map(stock => stock.symbol);
      
      // Get quotes for all symbols at once
      // Fetch quotes sequentially via Alpha Vantage to avoid rate limit blowups
      const updates: Array<{ symbol: string; data: any }> = [];
      for (const symbol of symbols) {
        try {
          const gq = await this.alphaVantage.getQuote(symbol);
          const update = {
            currentPrice: parseFloat(gq['05. price'] ?? '0') || 0,
            previousClose: parseFloat(gq['08. previous close'] ?? '0') || 0,
            priceChange: parseFloat(gq['09. change'] ?? '0') || 0,
            priceChangePercent: parseFloat(String(gq['10. change percent'] ?? '0%').replace('%','')) || 0,
            volume: parseFloat(gq['06. volume'] ?? '0') || 0,
            avgVolume: 0,
            lastUpdated: new Date().toISOString()
          };
          updates.push({ symbol, data: update });
        } catch (e) {
          console.warn(`Failed to fetch quote for ${symbol} via Alpha Vantage`, e);
        }
      }

      // Update each stock in the database
      for (const { symbol, data } of updates) {
        const updateData = {
          ...data
        };

        const { error: updateError } = await this.supabase
          .from('watchlist_stocks')
          .update(updateData)
          .eq('symbol', symbol);

        if (updateError) {
          console.error(`Failed to update ${symbol}:`, updateError);
        } else {
          // Store latest quote in cache so UI refreshes don't trigger new calls
          this.setCache(`quote_${symbol}`, updateData, this.getDailyTTL());
        }
      }

      console.log(`Updated ${updates.length} watchlist stocks`);
    } catch (error) {
      console.error('Error updating watchlist:', error);
      throw error;
    }
  }

  /**
   * Create trade snapshots for active trades
   */
  async createTradeSnapshots(snapshotType: 'market_open' | 'midday' | 'market_close'): Promise<void> {
    console.log(`Creating ${snapshotType} trade snapshots`);
    
    try {
      // Get all active trades
      const { data: activeTrades, error } = await this.supabase
        .from('trades')
        .select('*')
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch active trades: ${error.message}`);
      }

      if (!activeTrades || activeTrades.length === 0) {
        console.log('No active trades to snapshot');
        return;
      }

      const snapshots: TradeSnapshot[] = [];

      for (const trade of activeTrades) {
        try {
          const snapshot = await this.createTradeSnapshot(trade, snapshotType);
          snapshots.push(snapshot);
        } catch (error) {
          console.error(`Failed to create snapshot for trade ${trade.id}:`, error);
        }
      }

      // Save all snapshots to database
      if (snapshots.length > 0) {
        const { error: insertError } = await this.supabase
          .from('trade_snapshots')
          .insert(snapshots.map(snapshot => ({
            tradeId: snapshot.tradeId,
            ipsName: snapshot.ipsName,
            timestamp: snapshot.timestamp.toISOString(),
            snapshotType: snapshot.snapshotType,
            currentPrice: snapshot.currentPrice,
            premium: snapshot.premium,
            delta: snapshot.delta,
            theta: snapshot.theta,
            gamma: snapshot.gamma,
            vega: snapshot.vega,
            rho: snapshot.rho,
            impliedVol: snapshot.impliedVol,
            unrealizedPL: snapshot.unrealizedPL,
            unrealizedPLPercent: snapshot.unrealizedPLPercent,
            positionDelta: snapshot.positionDelta,
            positionTheta: snapshot.positionTheta
          })));

        if (insertError) {
          throw new Error(`Failed to save snapshots: ${insertError.message}`);
        }

        console.log(`Saved ${snapshots.length} trade snapshots`);
      }
    } catch (error) {
      console.error('Error creating trade snapshots:', error);
      throw error;
    }
  }

  /**
   * Create a single trade snapshot
   */
  private async createTradeSnapshot(
    trade: any, 
    snapshotType: 'market_open' | 'midday' | 'market_close'
  ): Promise<TradeSnapshot> {
    const stockData = await this.getUnifiedStockData(trade.symbol, false);
    
    let optionsData: UnifiedOptionsData | null = null;
    let premium = 0;
    let unrealizedPL = 0;
    
    // Get options data based on trade type
    if (trade.type === 'put-credit-spread') {
      // For PCS, get the short leg for primary Greeks
      optionsData = await this.getOptionsData(
        trade.symbol,
        trade.shortStrike,
        trade.expirationDate,
        'put',
        true
      );
      
      if (optionsData) {
        // Premium is what we'd pay to close (buy back)
        premium = optionsData.ask;
        // P&L = Credit received - current premium to close
        unrealizedPL = (trade.creditReceived - premium) * trade.quantity * 100;
      }
    } else if (trade.type === 'long-call') {
      optionsData = await this.getOptionsData(
        trade.symbol,
        trade.callStrike,
        trade.expirationDate,
        'call',
        true
      );
      
      if (optionsData) {
        // Premium is current bid (what we could sell for)
        premium = optionsData.bid;
        // P&L = Current value - premium paid
        unrealizedPL = (premium - trade.premiumPaid) * trade.quantity * 100;
      }
    }

    const unrealizedPLPercent = trade.creditReceived 
      ? (unrealizedPL / (trade.creditReceived * trade.quantity * 100)) * 100
      : 0;

    return {
      tradeId: trade.id,
      ipsName: trade.ipsName,
      timestamp: new Date(),
      snapshotType,
      currentPrice: stockData.currentPrice,
      premium,
      delta: optionsData?.greeks?.delta,
      theta: optionsData?.greeks?.theta,
      gamma: optionsData?.greeks?.gamma,
      vega: optionsData?.greeks?.vega,
      rho: optionsData?.greeks?.rho,
      impliedVol: optionsData?.greeks?.impliedVolatility,
      unrealizedPL,
      unrealizedPLPercent,
      positionDelta: optionsData?.greeks?.delta 
        ? optionsData.greeks.delta * trade.quantity * 100 
        : undefined,
      positionTheta: optionsData?.greeks?.theta 
        ? optionsData.greeks.theta * trade.quantity * 100 
        : undefined
    };
  }

  /**
   * Extract and calculate fundamental metrics from Alpha Vantage data
   */
  private extractFundamentals(data: FundamentalData): any {
    if (!data.overview) return {};
    
    const overview = data.overview;
    
    return {
      revenue: this.parseFinancialValue(overview.RevenueTTM),
      grossMargin: this.parsePercentage((overview as any).GrossMargin || ''),
      operatingMargin: this.parsePercentage(overview.OperatingMarginTTM),
      eps: this.parseFinancialValue(overview.EPS),
      bookValue: this.parseFinancialValue(overview.BookValue),
      peRatio: this.parseFinancialValue(overview.PERatio),
      pbRatio: this.parseFinancialValue(overview.PriceToBookRatio),
      psRatio: this.parseFinancialValue(overview.PriceToSalesRatioTTM),
      pegRatio: this.parseFinancialValue(overview.PEGRatio),
      evToEbitda: this.parseFinancialValue(overview.EVToEBITDA),
      beta: this.parseFinancialValue(overview.Beta),
      marketCap: this.parseFinancialValue(overview.MarketCapitalization),
      revenueGrowth: this.parsePercentage(overview.QuarterlyRevenueGrowthYOY),
      earningsGrowth: this.parsePercentage(overview.QuarterlyEarningsGrowthYOY),
      roe: this.parsePercentage(overview.ReturnOnEquityTTM),
      roa: this.parsePercentage(overview.ReturnOnAssetsTTM),
      week52High: this.parseFinancialValue((overview as any)['52WeekHigh']),
      week52Low: this.parseFinancialValue((overview as any)['52WeekLow']),
      dividendYield: this.parseFinancialValue(overview.DividendYield),
      revenuePerShareTTM: this.parseFinancialValue(overview.RevenuePerShareTTM)
    };
  }

  private parseFinancialValue(value: string): number | undefined {
    if (!value || value === 'None' || value === '-') return undefined;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? undefined : parsed;
  }

  private parsePercentage(value: string): number | undefined {
    if (!value || value === 'None' || value === '-') return undefined;
    // Remove % sign if present and convert to decimal
    const cleanValue = value.replace('%', '');
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? undefined : parsed;
  }

  // Cache management
    private getFromCache<T>(key: string, ttl?: number): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (ttl && Date.now() - cached.timestamp.getTime() > ttl) {
        this.cache.delete(key);
        return null;
    }
    
    return cached.data as T;
    }

    private setCache<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
        data,
        timestamp: new Date(),
        ttl: ttl || 0
    });
    }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp.getTime() > cached.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Record API sync status
   */
  async recordAPISync(
    dataType: string,
    status: 'success' | 'error' | 'in_progress',
    recordsProcessed = 0,
    errorMessage?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('api_syncs')
      .insert({
        dataType,
        lastSyncAt: new Date().toISOString(),
        syncStatus: status,
        recordsProcessed,
        errorMessage
      });

    if (error) {
      console.error('Failed to record API sync:', error);
    }
  }
}

// Singleton instance
let marketDataService: MarketDataService;

export const getMarketDataService = (): MarketDataService => {
  if (!marketDataService) {
    marketDataService = new MarketDataService();
  }
  return marketDataService;
};

export type {
  UnifiedStockData,
  UnifiedOptionsData,
  TradeSnapshot
};
