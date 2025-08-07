/**
 * Enhanced IPS Data Service - Strategy-Based Factor Selection
 * Copy this into: src/lib/ips-data-service.ts
 */

// Strategy definitions
interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  requiredFactorTypes: ('quantitative' | 'qualitative' | 'options')[];
  recommendedFactors: string[];
}

// Strategy configurations
const TRADING_STRATEGIES: TradingStrategy[] = [
  {
    id: 'buy-hold-stocks',
    name: 'Buy & Hold Stocks',
    description: 'Long-term equity positions based on fundamental analysis',
    requiredFactorTypes: ['quantitative', 'qualitative'],
    recommendedFactors: [
      'Revenue Growth', 'P/E Ratio', 'ROE', 'Debt-to-Equity',
      'Market Leadership', 'Economic Moat', 'Management Quality'
    ]
  },
  {
    id: 'put-credit-spreads',
    name: 'Put Credit Spreads',
    description: 'Sell put spreads for income generation',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility', 'Delta', 'Theta', 'Support Levels',
      'Revenue Stability', 'Beta', 'IV Rank', 'Management Quality'
    ]
  },
  {
    id: 'call-credit-spreads',
    name: 'Call Credit Spreads',
    description: 'Sell call spreads at resistance levels',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility', 'Delta', 'Theta', 'Resistance Levels',
      'P/E Ratio', 'RSI', 'IV Rank', 'Competitive Position'
    ]
  },
  {
    id: 'long-calls',
    name: 'Long Calls',
    description: 'Directional bullish plays with defined risk',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Revenue Growth', 'Earnings Surprise', 'Delta', 'Implied Volatility',
      'Market Leadership', 'Catalyst Events', 'Volume', 'Innovation & R&D'
    ]
  },
  {
    id: 'long-puts',
    name: 'Long Puts',
    description: 'Directional bearish plays or portfolio hedging',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Beta', 'Delta', 'Implied Volatility', 'Technical Weakness',
      'Earnings Risk', 'Market Correlation', 'Regulatory Environment'
    ]
  },
  {
    id: 'iron-condors',
    name: 'Iron Condors',
    description: 'Range-bound strategies for low volatility periods',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility', 'Delta', 'Theta', 'Gamma', 'Historical Volatility',
      'Support/Resistance Range', 'Beta', 'Economic Moat'
    ]
  },
  {
    id: 'covered-calls',
    name: 'Covered Calls',
    description: 'Income generation on existing equity positions',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Dividend Yield', 'Delta', 'Time Value', 'Resistance Levels',
      'Revenue Stability', 'Beta', 'Management Quality'
    ]
  }
];

// Complete Alpha Vantage factor definitions
const ALPHA_VANTAGE_FACTORS = [
  // Company Overview Factors
  { id: 'av-market-cap', name: 'Market Capitalization', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-pe-ratio', name: 'P/E Ratio', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-peg-ratio', name: 'PEG Ratio', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-book-value', name: 'Book Value per Share', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-dividend-per-share', name: 'Dividend per Share', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-dividend-yield', name: 'Dividend Yield', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-eps', name: 'Earnings per Share', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-revenue-per-share', name: 'Revenue per Share TTM', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-profit-margin', name: 'Profit Margin', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-operating-margin', name: 'Operating Margin TTM', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-roa', name: 'Return on Assets TTM', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-roe', name: 'Return on Equity TTM', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-revenue-ttm', name: 'Revenue TTM', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-gross-profit', name: 'Gross Profit TTM', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-diluted-eps', name: 'Diluted EPS TTM', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-earnings-growth', name: 'Quarterly Earnings Growth YoY', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-revenue-growth', name: 'Quarterly Revenue Growth YoY', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-analyst-target', name: 'Analyst Target Price', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-trailing-pe', name: 'Trailing P/E', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-forward-pe', name: 'Forward P/E', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-price-to-sales', name: 'Price-to-Sales Ratio TTM', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-price-to-book', name: 'Price-to-Book Ratio', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-ev-revenue', name: 'EV-to-Revenue', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-ev-ebitda', name: 'EV-to-EBITDA', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-beta', name: 'Beta', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: 'decimal', source: 'alpha_vantage' },
  { id: 'av-52w-high', name: '52-Week High', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-52w-low', name: '52-Week Low', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-50day-ma', name: '50-Day Moving Average', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-200day-ma', name: '200-Day Moving Average', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-shares-outstanding', name: 'Shares Outstanding', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: 'shares', source: 'alpha_vantage' },

  // Price & Quote Factors
  { id: 'av-current-price', name: 'Current Price', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-open-price', name: 'Open Price', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-high-price', name: 'High Price', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-low-price', name: 'Low Price', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-volume', name: 'Volume', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: 'shares', source: 'alpha_vantage' },
  { id: 'av-previous-close', name: 'Previous Close', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-price-change', name: 'Price Change', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-price-change-pct', name: 'Price Change %', type: 'quantitative', category: 'Price & Quote', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },

  // Financial Statement Factors (Income, Balance, Cash Flow)
  { id: 'av-total-revenue', name: 'Total Revenue', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-gross-profit', name: 'Gross Profit', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-operating-income', name: 'Operating Income', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-net-income', name: 'Net Income', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-ebitda', name: 'EBITDA', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-research-development', name: 'Research & Development', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  
  { id: 'av-total-assets', name: 'Total Assets', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-total-liabilities', name: 'Total Liabilities', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-stockholder-equity', name: 'Stockholder Equity', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-retained-earnings', name: 'Retained Earnings', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-working-capital', name: 'Working Capital', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  
  { id: 'av-operating-cashflow', name: 'Operating Cash Flow', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-payments-for-capex', name: 'Payments for CapEx', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-free-cashflow', name: 'Free Cash Flow', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-dividends-paid', name: 'Dividends Paid', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },

  // Earnings Factors
  { id: 'av-reported-eps', name: 'Reported EPS', type: 'quantitative', category: 'Earnings', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-estimated-eps', name: 'Estimated EPS', type: 'quantitative', category: 'Earnings', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-earnings-surprise', name: 'Earnings Surprise', type: 'quantitative', category: 'Earnings', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-surprise-percentage', name: 'Surprise Percentage', type: 'quantitative', category: 'Earnings', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
];

// Existing qualitative and options factors
const QUALITATIVE_FACTORS = [
  { id: 'qual-market-leadership', name: 'Market Leadership', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
  { id: 'qual-management-quality', name: 'Management Quality', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
  { id: 'qual-economic-moat', name: 'Economic Moat', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
  { id: 'qual-competitive-position', name: 'Competitive Position', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
  { id: 'qual-brand-strength', name: 'Brand Strength', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
  { id: 'qual-innovation-rd', name: 'Innovation & R&D', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
  { id: 'qual-regulatory-environment', name: 'Regulatory Environment', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
  { id: 'qual-esg-factors', name: 'ESG Factors', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
];

const OPTIONS_FACTORS = [
  { id: 'opt-iv', name: 'Implied Volatility', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' },
  { id: 'opt-delta', name: 'Delta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  { id: 'opt-gamma', name: 'Gamma', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  { id: 'opt-theta', name: 'Theta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  { id: 'opt-vega', name: 'Vega', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  { id: 'opt-rho', name: 'Rho', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  { id: 'opt-open-interest', name: 'Open Interest', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'contracts' },
  { id: 'opt-volume', name: 'Option Volume', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'contracts' },
  { id: 'opt-bid-ask-spread', name: 'Bid-Ask Spread', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: '$' },
  { id: 'opt-time-value', name: 'Time Value', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: '$' },
  { id: 'opt-intrinsic-value', name: 'Intrinsic Value', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: '$' },
  
  { id: 'opt-put-call-ratio', name: 'Put/Call Ratio', type: 'options', category: 'Sentiment & Flow', data_type: 'ratio', unit: 'ratio' },
  { id: 'opt-iv-rank', name: 'IV Rank', type: 'options', category: 'Sentiment & Flow', data_type: 'percentile', unit: '%' },
  { id: 'opt-iv-percentile', name: 'IV Percentile', type: 'options', category: 'Sentiment & Flow', data_type: 'percentile', unit: '%' },
  { id: 'opt-skew', name: 'Volatility Skew', type: 'options', category: 'Sentiment & Flow', data_type: 'percentage', unit: '%' },
  { id: 'opt-chain-liquidity', name: 'Options Chain Liquidity', type: 'options', category: 'Sentiment & Flow', data_type: 'rating', unit: '1-5' },
  { id: 'opt-market-implied-move', name: 'Market-Implied Move', type: 'options', category: 'Sentiment & Flow', data_type: 'percentage', unit: '%' },
];

// Combined factor definitions
const ALL_FACTORS = [
  ...ALPHA_VANTAGE_FACTORS,
  ...QUALITATIVE_FACTORS,
  ...OPTIONS_FACTORS
];

// Extended IPS interface with strategies
interface IPSConfiguration {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  strategies: string[]; // NEW: Array of strategy IDs
  is_active: boolean;
  total_factors?: number;
  active_factors?: number;
  total_weight?: number;
  avg_weight?: number;
  created_at: string;
  last_modified?: string;
  performance?: {
    winRate: number;
    avgROI: number;
    totalTrades: number;
  };
  criteria?: {
    minIV: number;
    maxDelta: number;
    targetROI: number;
    maxPositions: number;
  };
}

class IPSDataService {
  private mockIPSs: IPSConfiguration[] = [
    {
      id: 'ips-1',
      user_id: 'user-123',
      name: 'Conservative Growth Strategy',
      description: 'Focus on established companies with steady growth',
      strategies: ['buy-hold-stocks'],
      is_active: true,
      total_factors: 8,
      active_factors: 6,
      total_weight: 100,
      avg_weight: 16.7,
      created_at: '2024-01-15T10:30:00Z',
      last_modified: '2024-01-20',
      performance: { winRate: 73, avgROI: 12.4, totalTrades: 15 },
      criteria: { minIV: 30, maxDelta: 0.30, targetROI: 8, maxPositions: 5 }
    },
    {
      id: 'ips-2',
      user_id: 'user-123',
      name: 'Put Credit Spread Strategy',
      description: 'High probability options trades with defined risk',
      strategies: ['put-credit-spreads'],
      is_active: true,
      total_factors: 12,
      active_factors: 10,
      total_weight: 100,
      avg_weight: 10,
      created_at: '2024-01-18T14:15:00Z',
      last_modified: '2024-01-25',
      performance: { winRate: 85, avgROI: 6.2, totalTrades: 28 },
      criteria: { minIV: 40, maxDelta: 0.25, targetROI: 6, maxPositions: 3 }
    }
  ];

  // Get available trading strategies
  getAvailableStrategies(): TradingStrategy[] {
    return TRADING_STRATEGIES;
  }

  // Get factors filtered by strategy
  getFactorsForStrategies(strategyIds: string[]): any {
    const selectedStrategies = TRADING_STRATEGIES.filter(s => strategyIds.includes(s.id));
    
    // Determine which factor types should be shown
    const requiredTypes = new Set<string>();
    selectedStrategies.forEach(strategy => {
      strategy.requiredFactorTypes.forEach(type => requiredTypes.add(type));
    });

    // Filter factors by required types
    const filteredFactors = ALL_FACTORS.filter(factor => 
      requiredTypes.has(factor.type as any)
    );

    // Group factors by type and category
    const grouped = filteredFactors.reduce((acc: any, factor) => {
      if (!acc[factor.type]) acc[factor.type] = {};
      if (!acc[factor.type][factor.category]) acc[factor.type][factor.category] = [];
      acc[factor.type][factor.category].push(factor);
      return acc;
    }, {});

    return {
      raw: filteredFactors,
      grouped,
      recommendedFactors: selectedStrategies.flatMap(s => s.recommendedFactors)
    };
  }

  // Get all factor definitions (for search functionality)
  getAllFactorDefinitions(): any {
    const grouped = ALL_FACTORS.reduce((acc: any, factor) => {
      if (!acc[factor.type]) acc[factor.type] = {};
      if (!acc[factor.type][factor.category]) acc[factor.type][factor.category] = [];
      acc[factor.type][factor.category].push(factor);
      return acc;
    }, {});

    return {
      raw: ALL_FACTORS,
      grouped
    };
  }

  // Search factors by name or category
  searchFactors(query: string): any {
    const lowerQuery = query.toLowerCase();
    const matchingFactors = ALL_FACTORS.filter(factor => 
      factor.name.toLowerCase().includes(lowerQuery) ||
      factor.category.toLowerCase().includes(lowerQuery)
    );

    const grouped = matchingFactors.reduce((acc: any, factor) => {
      if (!acc[factor.type]) acc[factor.type] = {};
      if (!acc[factor.type][factor.category]) acc[factor.type][factor.category] = [];
      acc[factor.type][factor.category].push(factor);
      return acc;
    }, {});

    return {
      raw: matchingFactors,
      grouped
    };
  }

  // Existing methods updated to handle strategies
  async createIPS(userId: string, ipsData: any): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newIPS: IPSConfiguration = {
      id: 'ips-' + Date.now(),
      user_id: userId,
      name: ipsData.name,
      description: ipsData.description,
      strategies: ipsData.strategies || [], // NEW: Store selected strategies
      is_active: true,
      total_factors: 0,
      active_factors: 0,
      total_weight: 0,
      avg_weight: 0,
      created_at: new Date().toISOString(),
      last_modified: new Date().toISOString().split('T')[0],
      performance: { winRate: 0, avgROI: 0, totalTrades: 0 },
      criteria: {
        minIV: ipsData.criteria?.minIV || 40,
        maxDelta: ipsData.criteria?.maxDelta || 0.25,
        targetROI: ipsData.criteria?.targetROI || 6,
        maxPositions: ipsData.criteria?.maxPositions || 3
      }
    };
    
    this.mockIPSs.push(newIPS);
    return newIPS;
  }

  async getAllUserIPSs(userId: string): Promise<IPSConfiguration[]> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.mockIPSs.filter(ips => ips.user_id === userId);
  }

  async getActiveIPS(userId: string): Promise<IPSConfiguration | null> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const activeIPSs = this.mockIPSs.filter(ips => ips.user_id === userId && ips.is_active);
    return activeIPSs.length > 0 ? activeIPSs[0] : null;
  }

  async getIPSById(ipsId: string): Promise<IPSConfiguration | null> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return this.mockIPSs.find(ips => ips.id === ipsId) || null;
  }

  async updateIPS(ipsId: string, ipsData: any): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    if (!ips) throw new Error('IPS not found');

    ips.name = ipsData.name;
    ips.description = ipsData.description;
    ips.strategies = ipsData.strategies || ips.strategies; // Update strategies
    ips.last_modified = new Date().toISOString().split('T')[0];
    
    if (ipsData.criteria) {
      ips.criteria = { ...ips.criteria, ...ipsData.criteria };
    }
    
    return ips;
  }

  // Factor configuration methods
  async saveFactorConfigurations(ipsId: string, factorConfigs: any[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`Saving factor configurations for IPS ${ipsId}`, factorConfigs);
  }

  async getFactorConfigurations(ipsId: string): Promise<any[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [];
  }

  // Performance tracking
  async updateIPSPerformance(ipsId: string, performance: any): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    if (ips) {
      ips.performance = { ...ips.performance, ...performance };
    }
  }

  // Utility methods
  async toggleIPSStatus(ipsId: string): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    if (!ips) throw new Error('IPS not found');
    
    ips.is_active = !ips.is_active;
    ips.last_modified = new Date().toISOString().split('T')[0];
    return ips;
  }

  async duplicateIPS(ipsId: string, userId: string): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 500));
    const originalIPS = this.mockIPSs.find(i => i.id === ipsId);
    if (!originalIPS) throw new Error('IPS not found');

    const duplicatedIPS: IPSConfiguration = {
      ...originalIPS,
      id: 'ips-' + Date.now(),
      user_id: userId,
      name: `${originalIPS.name} (Copy)`,
      is_active: false, // Copies start as inactive
      created_at: new Date().toISOString(),
      last_modified: new Date().toISOString().split('T')[0],
      performance: { winRate: 0, avgROI: 0, totalTrades: 0 }
    };
    
    this.mockIPSs.push(duplicatedIPS);
    return duplicatedIPS;
  }

  async deleteIPS(ipsId: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const index = this.mockIPSs.findIndex(i => i.id === ipsId);
    if (index === -1) throw new Error('IPS not found');
    
    this.mockIPSs.splice(index, 1);
  }
}

// Singleton instance
export const ipsDataService = new IPSDataService();

// Export types
export type {
  IPSConfiguration,
  TradingStrategy
};