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

interface TechnicalIndicatorDataPoint {
  [date: string]: {
    [indicator: string]: string;
  };
}

interface SMAResponse {
  'Meta Data': {
    '1: Symbol': string;
    '2: Indicator': string;
    '3: Last Refreshed': string;
    '4: Interval': string;
    '5: Time Period': number;
    '6: Series Type': string;
    '7: Time Zone': string;
  };
  'Technical Analysis: SMA': TechnicalIndicatorDataPoint;
}

interface MOMResponse {
  'Meta Data': {
    '1: Symbol': string;
    '2: Indicator': string;
    '3: Last Refreshed': string;
    '4: Interval': string;
    '5: Time Period': number;
    '6: Series Type': string;
    '7: Time Zone': string;
  };
  'Technical Analysis: MOM': TechnicalIndicatorDataPoint;
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

  /**
   * Get Simple Moving Average (SMA) technical indicator
   * @param symbol Stock symbol
   * @param interval Time interval (daily, weekly, monthly)
   * @param timePeriod Number of data points (e.g., 50, 200)
   * @param seriesType Price type (close, open, high, low)
   * @returns Latest SMA value or null
   */
  async getSMA(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' = 'daily',
    timePeriod: number = 200,
    seriesType: 'close' | 'open' | 'high' | 'low' = 'close'
  ): Promise<number | null> {
    console.log(`Fetching SMA(${timePeriod}) for ${symbol}`);

    try {
      const response = await this.makeRequest<SMAResponse>({
        function: 'SMA',
        symbol: symbol.toUpperCase(),
        interval,
        time_period: String(timePeriod),
        series_type: seriesType
      });

      const technicalData = response['Technical Analysis: SMA'];
      if (!technicalData) return null;

      // Get the most recent date's SMA value
      const dates = Object.keys(technicalData).sort().reverse();
      if (dates.length === 0) return null;

      const latestDate = dates[0];
      const smaValue = technicalData[latestDate]['SMA'];

      return smaValue ? parseFloat(smaValue) : null;
    } catch (error) {
      console.error(`Failed to fetch SMA(${timePeriod}) for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get Momentum (MOM) technical indicator
   * @param symbol Stock symbol
   * @param interval Time interval (daily, weekly, monthly)
   * @param timePeriod Number of periods (default: 10)
   * @param seriesType Price type (close, open, high, low)
   * @returns Latest momentum value or null
   */
  async getMOM(
    symbol: string,
    interval: 'daily' | 'weekly' | 'monthly' = 'daily',
    timePeriod: number = 10,
    seriesType: 'close' | 'open' | 'high' | 'low' = 'close'
  ): Promise<number | null> {
    console.log(`Fetching MOM(${timePeriod}) for ${symbol}`);

    try {
      const response = await this.makeRequest<MOMResponse>({
        function: 'MOM',
        symbol: symbol.toUpperCase(),
        interval,
        time_period: String(timePeriod),
        series_type: seriesType
      });

      const technicalData = response['Technical Analysis: MOM'];
      if (!technicalData) return null;

      // Get the most recent date's momentum value
      const dates = Object.keys(technicalData).sort().reverse();
      if (dates.length === 0) return null;

      const latestDate = dates[0];
      const momValue = technicalData[latestDate]['MOM'];

      return momValue ? parseFloat(momValue) : null;
    } catch (error) {
      console.error(`Failed to fetch MOM(${timePeriod}) for ${symbol}:`, error);
      return null;
    }
  }

  async getCompleteFundamentalData(symbol: string): Promise<FundamentalData> {
    console.log(`Fetching complete fundamental data for ${symbol}`);
    const throttle = Number(process.env.ALPHA_VANTAGE_MIN_DELAY_MS || process.env.ALPHA_VANTAGE_THROTTLE_MS || 10);

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

  /**
   * Get historical options data for IV caching and analysis
   * https://www.alphavantage.co/documentation/#historical-options
   */
  async getHistoricalOptions(
    symbol: string,
    opts: { date?: string } = {}
  ): Promise<RealtimeOptionContract[]> {
    const params: Record<string, string> = {
      function: 'HISTORICAL_OPTIONS',
      symbol: symbol.toUpperCase(),
    };

    if (opts.date) {
      params.date = opts.date;
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

  async getTreasuryYield(maturity: '3month' | '2year' | '5year' | '7year' | '10year' | '30year' = '10year') {
    const data = await this.makeRequest<any>({ function: 'TREASURY_YIELD', maturity, interval: 'daily' });
    return this.latestFromDataSeries(data);
  }

  async getRealGDP(interval: 'quarterly' | 'annual' = 'quarterly') {
    const data = await this.makeRequest<any>({ function: 'REAL_GDP', interval });
    return this.latestFromDataSeries(data);
  }

  async getRealGDPPerCapita() {
    const data = await this.makeRequest<any>({ function: 'REAL_GDP_PER_CAPITA' });
    return this.latestFromDataSeries(data);
  }

  async getConsumerSentiment() {
    const data = await this.makeRequest<any>({ function: 'CONSUMER_SENTIMENT' });
    return this.latestFromDataSeries(data);
  }

  async getRetailSales() {
    const data = await this.makeRequest<any>({ function: 'RETAIL_SALES' });
    return this.latestFromDataSeries(data);
  }

  async getDurableGoods() {
    const data = await this.makeRequest<any>({ function: 'DURABLES' });
    return this.latestFromDataSeries(data);
  }

  async getNonfarmPayroll() {
    const data = await this.makeRequest<any>({ function: 'NONFARM_PAYROLL' });
    return this.latestFromDataSeries(data);
  }

  async getInflation() {
    const data = await this.makeRequest<any>({ function: 'INFLATION' });
    return this.latestFromDataSeries(data);
  }

  async getInflationExpectation() {
    const data = await this.makeRequest<any>({ function: 'INFLATION_EXPECTATION' });
    return this.latestFromDataSeries(data);
  }

  // ---------- Extended Technical Indicators ----------

  async getEMA(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'EMA', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: EMA');
    const v = latest?.values?.EMA != null ? Number(latest.values.EMA) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getWMA(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'WMA', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: WMA');
    const v = latest?.values?.WMA != null ? Number(latest.values.WMA) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getDEMA(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'DEMA', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: DEMA');
    const v = latest?.values?.DEMA != null ? Number(latest.values.DEMA) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getTEMA(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'TEMA', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: TEMA');
    const v = latest?.values?.TEMA != null ? Number(latest.values.TEMA) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getTRIMA(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'TRIMA', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: TRIMA');
    const v = latest?.values?.TRIMA != null ? Number(latest.values.TRIMA) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getKAMA(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'KAMA', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: KAMA');
    const v = latest?.values?.KAMA != null ? Number(latest.values.KAMA) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getT3(symbol: string, timePeriod = 5, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'T3', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: T3');
    const v = latest?.values?.T3 != null ? Number(latest.values.T3) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getVWAP(symbol: string, interval: '1min' | '5min' | '15min' | '30min' | '60min' = '60min') {
    const data = await this.makeRequest<any>({
      function: 'VWAP', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: VWAP');
    const v = latest?.values?.VWAP != null ? Number(latest.values.VWAP) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getBBANDS(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'BBANDS', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: BBANDS');
    const upper = latest?.values?.['Real Upper Band'] != null ? Number(latest.values['Real Upper Band']) : null;
    const middle = latest?.values?.['Real Middle Band'] != null ? Number(latest.values['Real Middle Band']) : null;
    const lower = latest?.values?.['Real Lower Band'] != null ? Number(latest.values['Real Lower Band']) : null;
    return {
      upper: Number.isFinite(upper) ? upper : null,
      middle: Number.isFinite(middle) ? middle : null,
      lower: Number.isFinite(lower) ? lower : null,
      date: latest?.date || null
    };
  }

  async getATR(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'ATR', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: ATR');
    const v = latest?.values?.ATR != null ? Number(latest.values.ATR) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getNATR(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'NATR', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: NATR');
    const v = latest?.values?.NATR != null ? Number(latest.values.NATR) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getSTOCH(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'STOCH', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: STOCH');
    const slowK = latest?.values?.SlowK != null ? Number(latest.values.SlowK) : null;
    const slowD = latest?.values?.SlowD != null ? Number(latest.values.SlowD) : null;
    return {
      slowK: Number.isFinite(slowK) ? slowK : null,
      slowD: Number.isFinite(slowD) ? slowD : null,
      date: latest?.date || null
    };
  }

  async getSTOCHF(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'STOCHF', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: STOCHF');
    const fastK = latest?.values?.FastK != null ? Number(latest.values.FastK) : null;
    const fastD = latest?.values?.FastD != null ? Number(latest.values.FastD) : null;
    return {
      fastK: Number.isFinite(fastK) ? fastK : null,
      fastD: Number.isFinite(fastD) ? fastD : null,
      date: latest?.date || null
    };
  }

  async getSTOCHRSI(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'STOCHRSI', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: STOCHRSI');
    const fastK = latest?.values?.FastK != null ? Number(latest.values.FastK) : null;
    const fastD = latest?.values?.FastD != null ? Number(latest.values.FastD) : null;
    return {
      fastK: Number.isFinite(fastK) ? fastK : null,
      fastD: Number.isFinite(fastD) ? fastD : null,
      date: latest?.date || null
    };
  }

  async getWILLR(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'WILLR', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: WILLR');
    const v = latest?.values?.WILLR != null ? Number(latest.values.WILLR) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getADX(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'ADX', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: ADX');
    const v = latest?.values?.ADX != null ? Number(latest.values.ADX) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getADXR(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'ADXR', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: ADXR');
    const v = latest?.values?.ADXR != null ? Number(latest.values.ADXR) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getCCI(symbol: string, timePeriod = 20, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'CCI', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: CCI');
    const v = latest?.values?.CCI != null ? Number(latest.values.CCI) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getMFI(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'MFI', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: MFI');
    const v = latest?.values?.MFI != null ? Number(latest.values.MFI) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getCMO(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'CMO', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: CMO');
    const v = latest?.values?.CMO != null ? Number(latest.values.CMO) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getROC(symbol: string, timePeriod = 10, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'ROC', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: ROC');
    const v = latest?.values?.ROC != null ? Number(latest.values.ROC) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getAROON(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'AROON', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: AROON');
    const aroonUp = latest?.values?.['Aroon Up'] != null ? Number(latest.values['Aroon Up']) : null;
    const aroonDown = latest?.values?.['Aroon Down'] != null ? Number(latest.values['Aroon Down']) : null;
    return {
      aroonUp: Number.isFinite(aroonUp) ? aroonUp : null,
      aroonDown: Number.isFinite(aroonDown) ? aroonDown : null,
      date: latest?.date || null
    };
  }

  async getAROONOSC(symbol: string, timePeriod = 14, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'AROONOSC', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod)
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: AROONOSC');
    const v = latest?.values?.AROONOSC != null ? Number(latest.values.AROONOSC) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getBOP(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'BOP', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: BOP');
    const v = latest?.values?.BOP != null ? Number(latest.values.BOP) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getTRIX(symbol: string, timePeriod = 30, interval: 'daily' | 'weekly' | 'monthly' = 'daily', seriesType: 'close' | 'open' | 'high' | 'low' = 'close') {
    const data = await this.makeRequest<any>({
      function: 'TRIX', symbol: symbol.toUpperCase(), interval, time_period: String(timePeriod), series_type: seriesType
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: TRIX');
    const v = latest?.values?.TRIX != null ? Number(latest.values.TRIX) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getULTOSC(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'ULTOSC', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: ULTOSC');
    const v = latest?.values?.ULTOSC != null ? Number(latest.values.ULTOSC) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getAD(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'AD', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: Chaikin A/D');
    const v = latest?.values?.['Chaikin A/D'] != null ? Number(latest.values['Chaikin A/D']) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getADOSC(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'ADOSC', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: ADOSC');
    const v = latest?.values?.ADOSC != null ? Number(latest.values.ADOSC) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
  }

  async getOBV(symbol: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const data = await this.makeRequest<any>({
      function: 'OBV', symbol: symbol.toUpperCase(), interval
    });
    const latest = this.extractLatestFromTA(data, 'Technical Analysis: OBV');
    const v = latest?.values?.OBV != null ? Number(latest.values.OBV) : null;
    return { value: Number.isFinite(v) ? v : null, date: latest?.date || null };
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
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error('Alpha Vantage API key is not configured. Please set ALPHA_VANTAGE_API_KEY or NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY in your environment.');
    }
    alphaVantageClient = new AlphaVantageClient({
      apiKey
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
