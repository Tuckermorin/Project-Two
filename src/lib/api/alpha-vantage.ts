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
    
    try {
      // Make requests with delays to respect rate limits (5 requests/minute)
      const overview = await this.getCompanyOverview(symbol);
      await this.delay(12000); // 12 second delay between calls
      
      const incomeStatement = await this.getIncomeStatement(symbol);
      await this.delay(12000);
      
      const balanceSheet = await this.getBalanceSheet(symbol);
      await this.delay(12000);
      
      const cashFlow = await this.getCashFlow(symbol);
      await this.delay(12000);
      
      const earnings = await this.getEarnings(symbol);

      return {
        symbol: symbol.toUpperCase(),
        overview,
        incomeStatement,
        balanceSheet,
        cashFlow,
        earnings
      };
    } catch (error) {
      console.error(`Error fetching fundamental data for ${symbol}:`, error);
      throw error;
    }
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