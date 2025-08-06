// src/lib/api/tradier.ts

interface TradierConfig {
  apiKey: string;
  baseUrl?: string;
  accountId?: string;
}

interface OptionsChainResponse {
  options?: {
    option: OptionContract[];
  };
}

interface OptionContract {
  symbol: string;
  description: string;
  exch: string;
  type: string;
  last: number | null;
  change: number | null;
  volume: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  bid: number;
  ask: number;
  underlying: string;
  strike: number;
  change_percentage: number | null;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  prevclose: number | null;
  week_52_high: number;
  week_52_low: number;
  bidsize: number;
  bidexch: string;
  bid_date: number;
  asksize: number;
  askexch: string;
  ask_date: number;
  open_interest: number;
  contract_size: number;
  expiration_date: string;
  expiration_type: string;
  option_type: 'call' | 'put';
  root_symbol: string;
  greeks?: OptionGreeks;
}

interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  phi: number;
  bid_iv: number;
  mid_iv: number;
  ask_iv: number;
  smv_vol: number;
  updated_at: string;
}

interface StockQuote {
  symbol: string;
  description: string;
  exch: string;
  type: string;
  last: number;
  change: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  bid: number;
  ask: number;
  change_percentage: number;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  prevclose: number;
  week_52_high: number;
  week_52_low: number;
  bidsize: number;
  bidexch: string;
  bid_date: number;
  asksize: number;
  askexch: string;
  ask_date: number;
}

interface QuotesResponse {
  quotes: {
    quote: StockQuote | StockQuote[];
  };
}

interface ExpirationDatesResponse {
  expirations: {
    date: string[];
  };
}

interface HistoricalDataResponse {
  history?: {
    day: HistoricalDay[];
  };
}

interface HistoricalDay {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

class TradierError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'TradierError';
  }
}

export class TradierClient {
  private config: TradierConfig;
  private baseUrl: string;

  constructor(config: TradierConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://sandbox.tradier.com';
    
    if (!config.apiKey) {
      throw new Error('Tradier API key is required');
    }
  }

  private async makeRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`/v1${endpoint}`, this.baseUrl);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Accept': 'application/json'
    };

    try {
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        throw new TradierError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      const data = await response.json();
      
      // Check for API error responses
      if (data.error) {
        throw new TradierError(data.error);
      }

      return data;
    } catch (error) {
      if (error instanceof TradierError) {
        throw error;
      }
      throw new TradierError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    console.log(`Fetching quote for ${symbol} from Tradier`);
    
    const response = await this.makeRequest<QuotesResponse>('/markets/quotes', {
      symbols: symbol.toUpperCase()
    });

    const quote = Array.isArray(response.quotes.quote) 
      ? response.quotes.quote[0] 
      : response.quotes.quote;

    return quote;
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    console.log(`Fetching quotes for ${symbols.length} symbols from Tradier`);
    
    const response = await this.makeRequest<QuotesResponse>('/markets/quotes', {
      symbols: symbols.map(s => s.toUpperCase()).join(',')
    });

    return Array.isArray(response.quotes.quote) 
      ? response.quotes.quote 
      : [response.quotes.quote];
  }

  async getOptionsChain(
    symbol: string, 
    expiration: string, 
    includeGreeks: boolean = true
  ): Promise<OptionContract[]> {
    console.log(`Fetching options chain for ${symbol} exp ${expiration}`);
    
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      expiration
    };

    if (includeGreeks) {
      params.greeks = 'true';
    }

    const response = await this.makeRequest<OptionsChainResponse>(
      '/markets/options/chains',
      params
    );

    return response.options?.option || [];
  }

  async getExpirationDates(symbol: string): Promise<string[]> {
    console.log(`Fetching expiration dates for ${symbol}`);
    
    const response = await this.makeRequest<ExpirationDatesResponse>(
      '/markets/options/expirations',
      { symbol: symbol.toUpperCase() }
    );

    return response.expirations?.date || [];
  }

  async getHistoricalData(
    symbol: string, 
    interval: 'daily' | 'weekly' | 'monthly' = 'daily',
    start?: string,
    end?: string
  ): Promise<HistoricalDay[]> {
    console.log(`Fetching historical data for ${symbol}`);
    
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      interval
    };

    if (start) params.start = start;
    if (end) params.end = end;

    const response = await this.makeRequest<HistoricalDataResponse>(
      '/markets/history',
      params
    );

    return response.history?.day || [];
  }

  async getSpecificOptionQuote(optionSymbol: string): Promise<OptionContract> {
    console.log(`Fetching specific option quote for ${optionSymbol}`);
    
    const response = await this.makeRequest<QuotesResponse>('/markets/quotes', {
      symbols: optionSymbol.toUpperCase()
    });

    const quote = Array.isArray(response.quotes.quote) 
      ? response.quotes.quote[0] 
      : response.quotes.quote;

    return quote as OptionContract;
  }

  async getOptionsGreeks(
    symbol: string, 
    expiration: string, 
    optionType?: 'call' | 'put'
  ): Promise<OptionContract[]> {
    console.log(`Fetching options Greeks for ${symbol}`);
    
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      expiration
    };

    if (optionType) {
      params.type = optionType;
    }

    const response = await this.makeRequest<OptionsChainResponse>(
      '/markets/options/greeks',
      params
    );

    return response.options?.option || [];
  }

  // Batch operations for efficiency
  async batchOptionsData(trades: Array<{
    symbol: string;
    expiration: string;
    strike: number;
    type: 'call' | 'put';
  }>): Promise<Array<{
    trade: typeof trades[0];
    option?: OptionContract;
    error?: string;
  }>> {
    console.log(`Batch fetching options data for ${trades.length} trades`);
    
    const results: Array<{
      trade: typeof trades[0];
      option?: OptionContract;
      error?: string;
    }> = [];

    // Group trades by symbol and expiration to minimize API calls
    const grouped = trades.reduce((acc, trade) => {
      const key = `${trade.symbol}-${trade.expiration}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(trade);
      return acc;
    }, {} as Record<string, typeof trades>);

    for (const [key, groupedTrades] of Object.entries(grouped)) {
      const [symbol, expiration] = key.split('-');
      
      try {
        const optionsChain = await this.getOptionsChain(symbol, expiration, true);
        
        for (const trade of groupedTrades) {
          const matchingOption = optionsChain.find(option => 
            option.strike === trade.strike && 
            option.option_type === trade.type
          );

          results.push({
            trade,
            option: matchingOption,
            error: matchingOption ? undefined : 'Option not found in chain'
          });
        }

        // Add delay to respect rate limits
        await this.delay(1000);
        
      } catch (error) {
        // If chain fetch fails, add error for all trades in group
        for (const trade of groupedTrades) {
          results.push({
            trade,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method to build option symbol
  static buildOptionSymbol(
    underlying: string,
    expiration: string, // YYYY-MM-DD format
    strike: number,
    type: 'C' | 'P'
  ): string {
    // Convert date to YYMMDD format
    const [year, month, day] = expiration.split('-');
    const shortYear = year.slice(-2);
    
    // Format strike price (multiply by 1000 and pad to 8 digits)
    const strikeFormatted = (strike * 1000).toString().padStart(8, '0');
    
    return `${underlying.toUpperCase()}${shortYear}${month}${day}${type}${strikeFormatted}`;
  }
}

// Singleton instance
let tradierClient: TradierClient;

export const getTradierClient = (): TradierClient => {
  if (!tradierClient) {
    tradierClient = new TradierClient({
      apiKey: process.env.TRADIER_API_KEY!,
      baseUrl: process.env.TRADIER_BASE_URL || 'https://sandbox.tradier.com'
    });
  }
  return tradierClient;
};

// Export types
export type {
  OptionContract,
  OptionGreeks,
  StockQuote,
  HistoricalDay,
  ExpirationDatesResponse
};