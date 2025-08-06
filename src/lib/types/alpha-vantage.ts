// src/lib/types/alpha-vantage.ts

export interface CompanyOverview {
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

export interface FinancialStatement {
  symbol: string;
  annualReports: FinancialReport[];
  quarterlyReports: FinancialReport[];
}

export interface FinancialReport {
  fiscalDateEnding: string;
  reportedCurrency: string;
  [key: string]: string; // Financial metrics are returned as strings
}

export interface EarningsData {
  symbol: string;
  annualEarnings: EarningsReport[];
  quarterlyEarnings: QuarterlyEarningsReport[];
}

export interface EarningsReport {
  fiscalDateEnding: string;
  reportedEPS: string;
}

export interface QuarterlyEarningsReport {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: string;
  estimatedEPS: string;
  surprise: string;
  surprisePercentage: string;
}

export interface QuoteData {
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

export interface FundamentalData {
  symbol: string;
  overview?: CompanyOverview;
  incomeStatement?: FinancialStatement;
  balanceSheet?: FinancialStatement;
  cashFlow?: FinancialStatement;
  earnings?: EarningsData;
}

// src/lib/types/tradier.ts

export interface OptionContract {
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

export interface OptionGreeks {
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

export interface StockQuote {
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

export interface OptionsChainResponse {
  options?: {
    option: OptionContract[];
  };
}

export interface QuotesResponse {
  quotes: {
    quote: StockQuote | StockQuote[];
  };
}

export interface ExpirationDatesResponse {
  expirations: {
    date: string[];
  };
}

export interface HistoricalDataResponse {
  history?: {
    day: HistoricalDay[];
  };
}

export interface HistoricalDay {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// src/lib/types/market-data.ts

export interface UnifiedStockData {
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
  };
}

export interface UnifiedOptionsData {
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

export interface TradeSnapshot {
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

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SyncStatus {
  dataType: string;
  lastSyncAt: Date;
  syncStatus: 'success' | 'error' | 'in_progress';
  recordsProcessed: number;
  errorMessage?: string;
}