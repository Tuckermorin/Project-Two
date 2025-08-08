/**
 * Complete IPS Data Service - Fixed Strategy-Based Factor Selection
 * Copy this into: src/lib/services/ips-data-service.ts
 */

// Strategy definitions
interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  requiredFactorTypes: ('quantitative' | 'qualitative' | 'options')[];
  recommendedFactors: string[];
}

// Strategy configurations - All with correct factor names
const TRADING_STRATEGIES: TradingStrategy[] = [
  {
    id: 'buy-hold-stocks',
    name: 'Buy & Hold Stocks',
    description: 'Long-term equity positions based on fundamental analysis',
    requiredFactorTypes: ['quantitative', 'qualitative'],
    recommendedFactors: [
      'Quarterly Revenue Growth YoY',
      'P/E Ratio',
      'Return on Equity TTM',
      'Total Liabilities',
      'Market Leadership',
      'Economic Moat',
      'Management Quality'
    ]
  },
  {
    id: 'put-credit-spreads',
    name: 'Put Credit Spreads',
    description: 'Sell put spreads for income generation',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility',
      'Delta', 
      'Theta',
      'Beta',
      'Management Quality',
      'IV Rank',
      'Economic Moat',
      'Return on Equity TTM'
    ]
  },
  {
    id: 'call-credit-spreads',
    name: 'Call Credit Spreads',
    description: 'Sell call spreads at resistance levels',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility',
      'Delta',
      'Theta',
      'P/E Ratio',
      'IV Rank',
      'Competitive Position',
      'Volume',
      'Beta'
    ]
  },
  {
    id: 'long-calls',
    name: 'Long Calls',
    description: 'Directional bullish plays with defined risk',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Quarterly Revenue Growth YoY',
      'Earnings Surprise',
      'Delta',
      'Implied Volatility',
      'Market Leadership',
      'Volume',
      'Innovation & R&D',
      'Beta'
    ]
  },
  {
    id: 'long-puts',
    name: 'Long Puts',
    description: 'Directional bearish plays or portfolio hedging',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Beta',
      'Delta',
      'Implied Volatility',
      'P/E Ratio',
      'Regulatory Environment',
      'Volume',
      'Economic Moat',
      'Theta'
    ]
  },
  {
    id: 'iron-condors',
    name: 'Iron Condors',
    description: 'Range-bound strategies for low volatility periods',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility',
      'Delta',
      'Theta',
      'Gamma',
      'Beta',
      'Economic Moat',
      'IV Rank',
      'Volume'
    ]
  },
  {
    id: 'covered-calls',
    name: 'Covered Calls',
    description: 'Income generation on existing equity positions',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Dividend Yield',
      'Delta',
      'Time Value',
      'Beta',
      'Management Quality',
      'Volume',
      'Economic Moat',
      'Theta'
    ]
  }
];

// Complete Alpha Vantage factor definitions - all API supported
const ALPHA_VANTAGE_FACTORS = [
  // Company Overview Factors - All supported by Alpha Vantage API
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
  { id: 'av-return-on-assets', name: 'Return on Assets TTM', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-return-on-equity', name: 'Return on Equity TTM', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-revenue-growth', name: 'Quarterly Revenue Growth YoY', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-gross-profit', name: 'Gross Profit TTM', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-ebitda', name: 'EBITDA', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-beta', name: 'Beta', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: 'coefficient', source: 'alpha_vantage' },
  { id: 'av-52-week-high', name: '52 Week High', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-52-week-low', name: '52 Week Low', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-50-day-ma', name: '50 Day Moving Average', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-200-day-ma', name: '200 Day Moving Average', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },

  // Price & Quote Factors
  { id: 'av-volume', name: 'Volume', type: 'quantitative', category: 'Price & Quote', data_type: 'numeric', unit: 'shares', source: 'alpha_vantage' },

  // Financial Statement Factors - All supported by Alpha Vantage API
  { id: 'av-total-revenue', name: 'Total Revenue', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-cost-of-revenue', name: 'Cost of Revenue', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-gross-profit-statement', name: 'Gross Profit', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-operating-income', name: 'Operating Income', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-net-income', name: 'Net Income', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },

  // Balance Sheet Factors - All supported by Alpha Vantage API
  { id: 'av-total-assets', name: 'Total Assets', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-total-liabilities', name: 'Total Liabilities', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-total-equity', name: 'Total Shareholder Equity', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-current-assets', name: 'Current Assets', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-current-liabilities', name: 'Current Liabilities', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-long-term-debt', name: 'Long Term Debt', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },

  // Cash Flow Factors - All supported by Alpha Vantage API
  { id: 'av-operating-cash-flow', name: 'Operating Cash Flow', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-capital-expenditures', name: 'Capital Expenditures', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-free-cash-flow', name: 'Free Cash Flow', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-dividends-paid', name: 'Dividends Paid', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },

  // Earnings Factors - All supported by Alpha Vantage API
  { id: 'av-reported-eps', name: 'Reported EPS', type: 'quantitative', category: 'Earnings', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-estimated-eps', name: 'Estimated EPS', type: 'quantitative', category: 'Earnings', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-earnings-surprise', name: 'Earnings Surprise', type: 'quantitative', category: 'Earnings', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-surprise-percentage', name: 'Surprise Percentage', type: 'quantitative', category: 'Earnings', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
];

// Qualitative factors - require manual input
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

// Options factors - All require manual input
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
  strategies: string[]; // Array of strategy IDs
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
      strategies: ['buy-hold-stocks'], // Uses buy-hold-stocks strategy
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

  // Get factors filtered by strategy with proper qualitative inclusion
  getFactorsForStrategies(strategyIds: string[]): any {
    const selectedStrategies = TRADING_STRATEGIES.filter(s => strategyIds.includes(s.id));
    
    // Determine which factor types should be shown
    const requiredTypes = new Set<string>();
    selectedStrategies.forEach(strategy => {
      strategy.requiredFactorTypes.forEach(type => requiredTypes.add(type));
    });

    // Get recommended factors across all selected strategies
    const recommendedFactors = new Set<string>();
    selectedStrategies.forEach(strategy => {
      strategy.recommendedFactors.forEach(factor => recommendedFactors.add(factor));
    });

    // Filter factors based on required types
    const availableFactors = ALL_FACTORS.filter(factor => 
      requiredTypes.has(factor.type)
    );

    return {
      availableFactors,
      recommendedFactors: Array.from(recommendedFactors),
      requiredTypes: Array.from(requiredTypes)
    };
  }

  // Get all factors (for reference)
  getAllFactors() {
    return ALL_FACTORS;
  }

  // Get factors by type
  getFactorsByType(type: 'quantitative' | 'qualitative' | 'options') {
    return ALL_FACTORS.filter(factor => factor.type === type);
  }

  // CRUD operations for IPS configurations
  async getAllUserIPSs(userId: string): Promise<IPSConfiguration[]> {
    return this.mockIPSs.filter(ips => ips.user_id === userId);
  }

  async getIPSById(ipsId: string): Promise<IPSConfiguration | null> {
    return this.mockIPSs.find(ips => ips.id === ipsId) || null;
  }

  async createIPS(ipsData: Partial<IPSConfiguration>): Promise<IPSConfiguration> {
    const newIPS: IPSConfiguration = {
      id: `ips-${Date.now()}`,
      user_id: ipsData.user_id || 'user-123',
      name: ipsData.name || 'Untitled Strategy',
      description: ipsData.description,
      strategies: ipsData.strategies || [],
      is_active: ipsData.is_active ?? true,
      created_at: new Date().toISOString(),
      ...ipsData
    } as IPSConfiguration;

    this.mockIPSs.push(newIPS);
    return newIPS;
  }

  async updateIPS(ipsId: string, updates: Partial<IPSConfiguration>): Promise<IPSConfiguration | null> {
    const index = this.mockIPSs.findIndex(ips => ips.id === ipsId);
    if (index === -1) return null;

    this.mockIPSs[index] = {
      ...this.mockIPSs[index],
      ...updates,
      last_modified: new Date().toISOString()
    };

    return this.mockIPSs[index];
  }

  async deleteIPS(ipsId: string): Promise<boolean> {
    const index = this.mockIPSs.findIndex(ips => ips.id === ipsId);
    if (index === -1) return false;

    this.mockIPSs.splice(index, 1);
    return true;
  }

  async toggleIPSStatus(ipsId: string): Promise<IPSConfiguration | null> {
    const ips = this.mockIPSs.find(ips => ips.id === ipsId);
    if (!ips) return null;

    ips.is_active = !ips.is_active;
    ips.last_modified = new Date().toISOString();
    return ips;
  }
}

// Export singleton instance
export const ipsDataService = new IPSDataService();
export type { IPSConfiguration, TradingStrategy };
export { TRADING_STRATEGIES, ALL_FACTORS };