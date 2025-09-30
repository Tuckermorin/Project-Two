// src/lib/api/alpha-vantage.ts

interface AlphaVantageConfig {
  apiKey: string;
  baseUrl?: string;
}

interface FundamentalData {
  symbol: string;
  overview?: CompanyOverview;
  incomeStatement?: FinancialStatement;
  balanceSheet?: FinancialStatement;
  cashFlow?: FinancialStatement;
  earnings?: EarningsData;
}

interface CompanyOverview {
  Symbol: string;
  Name: string;
  Description: string;
  Sector: string;
  Industry: string;
  MarketCapitalization: string;
  PERatio: string;
  PEGRatio: string;
  BookValue: string;
  DividendPerShare: string;
  DividendYield: string;
  EPS: string;
  RevenuePerShareTTM: string;
  ProfitMargin: string;
  OperatingMarginTTM: string;
  ReturnOnAssetsTTM: string;
  ReturnOnEquityTTM: string;
  RevenueTTM: string;
  GrossProfitTTM: string;
  DilutedEPSTTM: string;
  QuarterlyEarningsGrowthYOY: string;
  QuarterlyRevenueGrowthYOY: string;
  AnalystTargetPrice: string;
  TrailingPE: string;
  ForwardPE: string;
  PriceToSalesRatioTTM: string;
  PriceToBookRatio: string;
  EVToRevenue: string;
  EVToEBITDA: string;
  Beta: string;
  '52WeekHigh': string;
  '52WeekLow': string;
  '50DayMovingAverage': string;
  '200DayMovingAverage': string;
  SharesOutstanding: string;
  DividendDate: string;
  ExDividendDate: string;
}

interface FinancialStatement {
  symbol: string;
  annualReports: FinancialReport[];
  quarterlyReports: FinancialReport[];
}

interface FinancialReport {
  fiscalDateEnding: string;
  reportedCurrency: string;
  [key: string]: string; // Financial metrics are returned as strings
}

interface EarningsData {
  symbol: string;
  annualEarnings: EarningsReport[];
  quarterlyEarnings: QuarterlyEarningsReport[];
}

interface EarningsReport {
  fiscalDateEnding: string;
  reportedEPS: string;
}

interface QuarterlyEarningsReport {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: string;
  estimatedEPS: string;
  surprise: string;
  surprisePercentage: string;
}

interface QuoteData {
  price: any;
  '01. symbol': string;
  '02. open': string;
  '03. high': string;
  '04. low': string;
  '05. price': string;
  '06. volume': string;
  '07. latest trading day': string;
  '08. previous close': string;
  '09. change': string;
  '10. change percent': string;
}


interface RealtimeOptionsApiEntry {
  contractID?: string;
  contractId?: string;
  symbol?: string;
  expiration?: string;
  strike?: string | number;
  type?: string;
  last?: string | number;
  mark?: string | number;
  bid?: string | number;
  bid_size?: string | number;
  bidSize?: string | number;
  ask?: string | number;
  ask_size?: string | number;
  askSize?: string | number;
  volume?: string | number;
  open_interest?: string | number;
  openInterest?: string | number;
  date?: string;
  implied_volatility?: string | number;
  impliedVolatility?: string | number;
  delta?: string | number;
  gamma?: string | number;
  theta?: string | number;
  vega?: string | number;
  rho?: string | number;
}

interface RealtimeOptionsResponse {
  endpoint?: string;
  message?: string;
  data?: RealtimeOptionsApiEntry[];
}

export interface RealtimeOptionContract {
  contractId: string;
  symbol: string;
  expiration: string;
  strike: number | null;
  type: 'call' | 'put';
  last: number | null;
  mark: number | null;
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  volume: number | null;
  openInterest: number | null;
  date: string | null;
  impliedVolatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
}

class AlphaVantageError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'AlphaVantageError';
  }
}

export class AlphaVantageClient {
  private config: AlphaVantageConfig;
  private baseUrl: string;

  constructor(config: AlphaVantageConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://www.alphavantage.co';
    
    if (!config.apiKey) {
      throw new Error('Alpha Vantage API key is required');
    }
  }

  private async makeRequest<T>(params: Record<string, string>): Promise<T> {
    const url = new URL('/query', this.baseUrl);
    url.searchParams.set('apikey', this.config.apiKey);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    // Prefer realtime data if enabled on the account
    const entitlement = process.env.ALPHA_VANTAGE_ENTITLEMENT || 'realtime';
    if (entitlement) url.searchParams.set('entitlement', entitlement);

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new AlphaVantageError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      const data = await response.json();
      
      // Check for API error responses
      if (data['Error Message']) {
        throw new AlphaVantageError(data['Error Message']);
      }
      
      if (data['Note']) {
        throw new AlphaVantageError(
          'API rate limit exceeded. Please try again later.',
          429
        );
      }

      return data;
    } catch (error) {
      if (error instanceof AlphaVantageError) {
        throw error;
      }
      throw new AlphaVantageError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
  private parseNumber(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const lowered = trimmed.toLowerCase();
      if (!trimmed || lowered === 'none' || lowered === 'null' || lowered === 'na' || lowered === 'n/a') {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }



  /**
   * Alpha Vantage SYMBOL_SEARCH helper
   * https://www.alphavantage.co/documentation/#symbolsearch
   */
  async searchSymbols(query: string): Promise<Array<{
    symbol: string;
    name: string;
    type?: string;
    region?: string;
    currency?: string;
    matchScore?: number;
  }>> {
    const data = await this.makeRequest<{ bestMatches?: any[] }>({
      function: 'SYMBOL_SEARCH',
      keywords: query
    });
    const matches = Array.isArray((data as any)?.bestMatches)
      ? (data as any).bestMatches
      : [];
    return matches.map((m: any) => ({
      symbol: m['1. symbol'] ?? m.symbol ?? '',
      name: m['2. name'] ?? m.name ?? '',
      type: m['3. type'] ?? m.type,
      region: m['4. region'] ?? m.region,
      currency: m['8. currency'] ?? m.currency,
      matchScore: m['9. matchScore'] ? Number(m['9. matchScore']) : undefined,
    })).filter((r: any) => r.symbol);
  }

  async getCompanyOverview(symbol: string): Promise<CompanyOverview> {
    console.log(`Fetching company overview for ${symbol}`);
    
    const data = await this.makeRequest<CompanyOverview>({
      function: 'OVERVIEW',
      symbol: symbol.toUpperCase()
    });

    return data;
  }

  async getIncomeStatement(symbol: string): Promise<FinancialStatement> {
    console.log(`Fetching income statement for ${symbol}`);
    
    const data = await this.makeRequest<FinancialStatement>({
      function: 'INCOME_STATEMENT',
      symbol: symbol.toUpperCase()
    });

    return data;
  }

  async getBalanceSheet(symbol: string): Promise<FinancialStatement> {
    console.log(`Fetching balance sheet for ${symbol}`);
    
    const data = await this.makeRequest<FinancialStatement>({
      function: 'BALANCE_SHEET',
      symbol: symbol.toUpperCase()
    });

    return data;
  }

  async getCashFlow(symbol: string): Promise<FinancialStatement> {
    console.log(`Fetching cash flow for ${symbol}`);
    
    const data = await this.makeRequest<FinancialStatement>({
      function: 'CASH_FLOW',
      symbol: symbol.toUpperCase()
    });

    return data;
  }

  async getEarnings(symbol: string): Promise<EarningsData> {
    console.log(`Fetching earnings for ${symbol}`);
    
    const data = await this.makeRequest<EarningsData>({
      function: 'EARNINGS',
      symbol: symbol.toUpperCase()
    });

    return data;
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    console.log(`Fetching quote for ${symbol}`);
    
    const response = await this.makeRequest<{ 'Global Quote': QuoteData }>({
      function: 'GLOBAL_QUOTE',
      symbol: symbol.toUpperCase()
    });

    return response['Global Quote'];
  }

  async getCompleteFundamentalData(symbol: string): Promise<FundamentalData> {
    console.log(`Fetching complete fundamental data for ${symbol}`);
    const throttle = Number(process.env.ALPHA_VANTAGE_MIN_DELAY_MS || process.env.ALPHA_VANTAGE_THROTTLE_MS || 100);

    const fetchSafe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        const value = await fn();
        return value;
      } catch (error) {
        console.warn(`Alpha Vantage ${label} fetch failed for ${symbol}`, error);
        return null;
      } finally {
        if (throttle > 0) {
          await this.delay(throttle);
        }
      }
    };

    const overview = await fetchSafe('overview', () => this.getCompanyOverview(symbol));
    const incomeStatement = await fetchSafe('income statement', () => this.getIncomeStatement(symbol));
    const balanceSheet = await fetchSafe('balance sheet', () => this.getBalanceSheet(symbol));
    const cashFlow = await fetchSafe('cash flow', () => this.getCashFlow(symbol));
    const earnings = await fetchSafe('earnings', () => this.getEarnings(symbol));

    return {
      symbol: symbol.toUpperCase(),
      overview,
      incomeStatement,
      balanceSheet,
      cashFlow,
      earnings,
    };
  }


  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Rate limiting helper
  async batchFundamentalData(symbols: string[]): Promise<FundamentalData[]> {
    console.log(`Fetching fundamental data for ${symbols.length} symbols`);
    
    const results: FundamentalData[] = [];
    
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      
      try {
        console.log(`Processing ${i + 1}/${symbols.length}: ${symbol}`);
        const data = await this.getCompleteFundamentalData(symbol);
        results.push(data);
        
        // Add extra delay between symbols to be safe
        if (i < symbols.length - 1) {
          await this.delay(5000); // 5 second delay between symbols
        }
      } catch (error) {
        console.error(`Failed to fetch data for ${symbol}:`, error);
        // Continue with other symbols even if one fails
      }
    }
    
    return results;
  }
  async getRealtimeOptions(
    symbol: string,
    opts: { requireGreeks?: boolean; contract?: string } = {}
  ): Promise<RealtimeOptionContract[]> {
    const params: Record<string, string> = {
      function: 'REALTIME_OPTIONS',
      symbol: symbol.toUpperCase(),
    };

    if (opts.contract) {
      params.contract = opts.contract;
    }

    if (opts.requireGreeks) {
      params.require_greeks = 'true';
    }

    const response = await this.makeRequest<RealtimeOptionsResponse>(params);
    const rows = Array.isArray(response?.data) ? response.data : [];

    return rows
      .filter((row) => !!row)
      .map((row) => {
        const rowData = row as any;
        const typeValue = String(rowData?.type ?? '').toLowerCase();
        const normalisedType: 'call' | 'put' = typeValue === 'put' ? 'put' : 'call';

        return {
          contractId: String(rowData?.contractID ?? rowData?.contractId ?? ''),
          symbol: String(rowData?.symbol ?? symbol).toUpperCase(),
          expiration: String(rowData?.expiration ?? ''),
          strike: this.parseNumber(rowData?.strike),
          type: normalisedType,
          last: this.parseNumber(rowData?.last),
          mark: this.parseNumber(rowData?.mark),
          bid: this.parseNumber(rowData?.bid),
          ask: this.parseNumber(rowData?.ask),
          bidSize: this.parseNumber(rowData?.bidSize ?? rowData?.bid_size),
          askSize: this.parseNumber(rowData?.askSize ?? rowData?.ask_size),
          volume: this.parseNumber(rowData?.volume),
          openInterest: this.parseNumber(rowData?.openInterest ?? rowData?.open_interest),
          date: rowData?.date ?? null,
          impliedVolatility: this.parseNumber(rowData?.impliedVolatility ?? rowData?.implied_volatility),
          delta: this.parseNumber(rowData?.delta),
          gamma: this.parseNumber(rowData?.gamma),
          theta: this.parseNumber(rowData?.theta),
          vega: this.parseNumber(rowData?.vega),
          rho: this.parseNumber(rowData?.rho),
        } satisfies RealtimeOptionContract;
      });
  }


  // ---------- Technical Indicators ----------
  private extractLatestFromTA(obj: any, key: string) {
    const block = obj?.[key];
    if (!block || typeof block !== 'object') return null;
    const first = Object.keys(block)[0];
    if (!first) return null;
    return { date: first, values: block[first] };
  }

  async getSMA(symbol: string, timePeriod = 50, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'SMA', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: SMA');
    const v = latest?.values?.SMA != null ? Number(latest.values.SMA) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getRSI(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'RSI', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: RSI');
    const v = latest?.values?.RSI != null ? Number(latest.values.RSI) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getMACD(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'MACD', symbol: symbol.toUpperCase(), interval, series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: MACD');
    const out = latest?.values || {};
    const macd = out.MACD != null ? Number(out.MACD) : null;
    const signal = out.MACD_Signal != null ? Number(out.MACD_Signal) : null;
    const hist = out.MACD_Hist != null ? Number(out.MACD_Hist) : null;
    return { macd: Number.isFinite(macd) ? macd : null, signal: Number.isFinite(signal) ? signal : null, histogram: Number.isFinite(hist) ? hist : null, date: latest?.date || null };
  }

  // ---------- Alpha Intelligence: News Sentiment ----------
  async getNewsSentiment(symbol: string, limit = 50) {
    const data = await this.makeRequest<any>({
      function: 'NEWS_SENTIMENT', tickers: symbol.toUpperCase(), sort: 'LATEST', limit: String(limit)
    });
    const feed: any[] = Array.isArray(data?.feed) ? data.feed : [];
    let sum = 0, n = 0, pos = 0, neg = 0, neu = 0;
    for (const item of feed) {
      const s = Number(item?.overall_sentiment_score);
      if (Number.isFinite(s)) { sum += s; n++; }
      const lbl = String(item?.overall_sentiment_label || '').toLowerCase();
      if (lbl.includes('positive')) pos++; else if (lbl.includes('negative')) neg++; else neu++;
    }
    const avg = n ? sum / n : null;
    return { average_score: avg, count: n, positive: pos, negative: neg, neutral: neu };
  }

  // ---------- Macro / Economic Indicators ----------
  private latestFromDataSeries(obj: any): { date: string | null; value: number | null } {
    const data = obj?.data || obj?.['data'] || obj?.['Data'] || obj?.['value'] || obj?.['series'];
    if (Array.isArray(data) && data.length) {
      const d = data[0];
      const val = Number(d?.value ?? d?.Value ?? d?.v);
      return { date: d?.date ?? d?.Date ?? null, value: Number.isFinite(val) ? val : null };
    }
    // Some endpoints return { data: { last_updated, value } }
    const value = Number(obj?.value);
    if (Number.isFinite(value)) return { date: obj?.last_updated || null, value };
    return { date: null, value: null };
  }

  async getCPI() {
    const data = await this.makeRequest<any>({ function: 'CPI', interval: 'monthly' });
    return this.latestFromDataSeries(data);
  }
  async getUnemploymentRate() {
    const data = await this.makeRequest<any>({ function: 'UNEMPLOYMENT' });
    return this.latestFromDataSeries(data);
  }
  async getFederalFundsRate() {
    const data = await this.makeRequest<any>({ function: 'FEDERAL_FUNDS_RATE', interval: 'monthly' });
    return this.latestFromDataSeries(data);
  }
  async getTreasuryYield10Y() {
    const data = await this.makeRequest<any>({ function: 'TREASURY_YIELD', maturity: '10year', interval: 'daily' });
    return this.latestFromDataSeries(data);
  }
  async getDailyAdjustedSeries(symbol: string, outputsize: 'compact' | 'full' = 'compact') {
    const data = await this.makeRequest<any>({
      function: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol: symbol.toUpperCase(),
      outputsize
    });
    const series = data?.['Time Series (Daily)'];
    if (!series || typeof series !== 'object') {
      throw new AlphaVantageError('TIME_SERIES_DAILY_ADJUSTED response missing data');
    }
    return series as Record<string, { [key: string]: string }>;
  }

}

// Singleton instance
let alphaVantageClient: AlphaVantageClient;

export const getAlphaVantageClient = (): AlphaVantageClient => {
  if (!alphaVantageClient) {
    alphaVantageClient = new AlphaVantageClient({
      apiKey: process.env.ALPHA_VANTAGE_API_KEY!
    });
  }
  return alphaVantageClient;
};

// Export types
export type {
  FundamentalData,
  CompanyOverview,
  FinancialStatement,
  FinancialReport,
  EarningsData,
  QuoteData
};
