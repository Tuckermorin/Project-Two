// src/lib/services/ips-data-service.ts

// Trading Strategy Definition
interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  requiredFactorTypes: ('quantitative' | 'qualitative' | 'options')[];
  recommendedFactors: string[];
}

// IPS Configuration Interface
interface IPSConfiguration {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  strategies: string[];
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

// Factor Definition Interface
interface FactorDefinition {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative' | 'options';
  category: string;
  data_type: string;
  unit: string;
  source?: string;
}

// Trading strategies definition (static configuration, not data)
const TRADING_STRATEGIES: TradingStrategy[] = [
  {
    id: 'buy-hold-stocks',
    name: 'Buy & Hold Stocks',
    description: 'Long-term equity investment strategy',
    requiredFactorTypes: ['quantitative', 'qualitative'],
    recommendedFactors: [
      'Market Capitalization',
      'P/E Ratio',
      'Revenue Growth',
      'Dividend Yield',
      'Return on Equity',
      'Management Quality',
      'Economic Moat',
      'Beta'
    ]
  },
  {
    id: 'put-credit-spreads',
    name: 'Put Credit Spreads',
    description: 'Bullish options strategy with defined risk',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility',
      'Delta',
      'Theta',
      'Support Levels',
      'Volume',
      'Trend Strength',
      'Economic Moat',
      'Earnings Quality'
    ]
  },
  {
    id: 'call-credit-spreads',
    name: 'Call Credit Spreads',
    description: 'Bearish options strategy with defined risk',
    requiredFactorTypes: ['quantitative', 'qualitative', 'options'],
    recommendedFactors: [
      'Implied Volatility',
      'Delta',
      'Theta',
      'Resistance Levels',
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

// Factor definitions for Alpha Vantage API (static configuration)
const ALPHA_VANTAGE_FACTORS: FactorDefinition[] = [
  // Company Overview Factors
  { id: 'av-market-cap', name: 'Market Capitalization', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'av-pe-ratio', name: 'P/E Ratio', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'av-dividend-yield', name: 'Dividend Yield', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-beta', name: 'Beta', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: 'coefficient', source: 'alpha_vantage' },
  { id: 'av-revenue-growth', name: 'Revenue Growth YoY', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'av-return-on-equity', name: 'Return on Equity TTM', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  // Add more as needed...
];

// Qualitative factors (manual input required)
const QUALITATIVE_FACTORS: FactorDefinition[] = [
  { id: 'qual-management-quality', name: 'Management Quality', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
  { id: 'qual-economic-moat', name: 'Economic Moat', type: 'qualitative', category: 'Business Model', data_type: 'rating', unit: '1-5' },
  { id: 'qual-competitive-position', name: 'Competitive Position', type: 'qualitative', category: 'Business Model', data_type: 'rating', unit: '1-5' },
  // Add more as needed...
];

// Options factors (manual input or from options API)
const OPTIONS_FACTORS: FactorDefinition[] = [
  { id: 'opt-iv', name: 'Implied Volatility', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' },
  { id: 'opt-delta', name: 'Delta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  { id: 'opt-theta', name: 'Theta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  // Add more as needed...
];

// Combined factors
const ALL_FACTORS = [
  ...ALPHA_VANTAGE_FACTORS,
  ...QUALITATIVE_FACTORS,
  ...OPTIONS_FACTORS
];

class IPSDataService {
  // Store IPS configurations in memory (replace with database in production)
  private ipsConfigurations: Map<string, IPSConfiguration[]> = new Map();

  // Get available trading strategies
  getAvailableStrategies(): TradingStrategy[] {
    return TRADING_STRATEGIES;
  }

  // Get all factors
  getAllFactors(): FactorDefinition[] {
    return ALL_FACTORS;
  }

  // Get factors by type
  getFactorsByType(type: 'quantitative' | 'qualitative' | 'options'): FactorDefinition[] {
    return ALL_FACTORS.filter(factor => factor.type === type);
  }

  // Get factors for selected strategies
  getFactorsForStrategies(strategyIds: string[]): {
    availableFactors: FactorDefinition[];
    recommendedFactors: string[];
    requiredTypes: string[];
  } {
    const selectedStrategies = TRADING_STRATEGIES.filter(s => strategyIds.includes(s.id));
    
    // Get required factor types
    const requiredTypes = new Set<string>();
    selectedStrategies.forEach(strategy => {
      strategy.requiredFactorTypes.forEach(type => requiredTypes.add(type));
    });

    // Get recommended factors
    const recommendedFactors = new Set<string>();
    selectedStrategies.forEach(strategy => {
      strategy.recommendedFactors.forEach(factor => recommendedFactors.add(factor));
    });

    // Filter available factors based on required types
    const availableFactors = ALL_FACTORS.filter(factor => 
      requiredTypes.has(factor.type)
    );

    return {
      availableFactors,
      recommendedFactors: Array.from(recommendedFactors),
      requiredTypes: Array.from(requiredTypes)
    };
  }

  // CRUD operations for IPS configurations
  async getAllUserIPSs(userId: string): Promise<IPSConfiguration[]> {
    // TODO: Replace with database query
    const userIPSs = this.ipsConfigurations.get(userId) || [];
    return Promise.resolve(userIPSs);
  }

  async getIPSById(ipsId: string): Promise<IPSConfiguration | null> {
    // TODO: Replace with database query
    for (const [userId, ipsList] of this.ipsConfigurations.entries()) {
      const ips = ipsList.find(i => i.id === ipsId);
      if (ips) return Promise.resolve(ips);
    }
    return Promise.resolve(null);
  }

  async createIPS(userId: string, ipsData: Partial<IPSConfiguration>): Promise<IPSConfiguration> {
    const newIPS = {
      user_id: userId,
      name: ipsData.name || 'Untitled Strategy',
      description: ipsData.description,
      strategies: ipsData.strategies || [],
      is_active: ipsData.is_active ?? true,
      created_at: new Date().toISOString(),
      ...ipsData
    };

    try {
      const response = await fetch('/api/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIPS)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to create IPS:', errorText);
        throw new Error(errorText || 'Failed to create IPS');
      }

      const { data } = await response.json();
      console.log('IPS created:', data);

      const userIPSs = this.ipsConfigurations.get(userId) || [];
      userIPSs.push(data);
      this.ipsConfigurations.set(userId, userIPSs);

      return data as IPSConfiguration;
    } catch (error) {
      console.error('Error creating IPS:', error);
      throw error;
    }
  }

  async updateIPS(ipsId: string, updates: Partial<IPSConfiguration>): Promise<IPSConfiguration> {
    // TODO: Replace with database update
    for (const [userId, ipsList] of this.ipsConfigurations.entries()) {
      const index = ipsList.findIndex(i => i.id === ipsId);
      if (index !== -1) {
        ipsList[index] = {
          ...ipsList[index],
          ...updates,
          last_modified: new Date().toISOString()
        };
        return Promise.resolve(ipsList[index]);
      }
    }
    throw new Error('IPS not found');
  }

  async deleteIPS(ipsId: string): Promise<boolean> {
    // TODO: Replace with database delete
    for (const [userId, ipsList] of this.ipsConfigurations.entries()) {
      const index = ipsList.findIndex(i => i.id === ipsId);
      if (index !== -1) {
        ipsList.splice(index, 1);
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
  }

  async toggleIPSStatus(ipsId: string): Promise<IPSConfiguration> {
    // TODO: Replace with database update
    const ips = await this.getIPSById(ipsId);
    if (!ips) throw new Error('IPS not found');
    
    return this.updateIPS(ipsId, { is_active: !ips.is_active });
  }

  async duplicateIPS(ipsId: string, userId: string): Promise<IPSConfiguration> {
    // TODO: Replace with database operations
    const original = await this.getIPSById(ipsId);
    if (!original) throw new Error('IPS not found');

    const duplicate = {
      ...original,
      id: undefined,
      name: `${original.name} (Copy)`,
      is_active: false,
      created_at: new Date().toISOString(),
      last_modified: undefined
    };

    return this.createIPS(userId, duplicate);
  }

  // Save factor configurations
  async saveFactorConfigurations(ipsId: string, configurations: any[]): Promise<void> {
    // TODO: Implement database save for factor configurations
    console.log('Saving factor configurations for IPS:', ipsId, configurations);
    return Promise.resolve();
  }

  // Get factor configurations
  async getFactorConfigurations(ipsId: string): Promise<any[]> {
    // TODO: Implement database retrieval for factor configurations
    return Promise.resolve([]);
  }
}

// Export singleton instance
export const ipsDataService = new IPSDataService();
export type { IPSConfiguration, TradingStrategy, FactorDefinition };
export { TRADING_STRATEGIES, ALL_FACTORS };