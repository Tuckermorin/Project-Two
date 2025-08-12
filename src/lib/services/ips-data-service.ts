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

// Basic fallback factor definitions used if database query fails
// These represent a minimal set of factors across all categories.
const FALLBACK_FACTORS: FactorDefinition[] = [
  // Quantitative
  { id: 'fallback-market-cap', name: 'Market Capitalization', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: '$', source: 'alpha_vantage' },
  { id: 'fallback-pe-ratio', name: 'P/E Ratio', type: 'quantitative', category: 'Company Overview', data_type: 'ratio', unit: 'ratio', source: 'alpha_vantage' },
  { id: 'fallback-dividend-yield', name: 'Dividend Yield', type: 'quantitative', category: 'Company Overview', data_type: 'percentage', unit: '%', source: 'alpha_vantage' },
  { id: 'fallback-beta', name: 'Beta', type: 'quantitative', category: 'Company Overview', data_type: 'numeric', unit: 'coefficient', source: 'alpha_vantage' },
  // Qualitative
  { id: 'fallback-management-quality', name: 'Management Quality', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
  { id: 'fallback-economic-moat', name: 'Economic Moat', type: 'qualitative', category: 'Business Model', data_type: 'rating', unit: '1-5' },
  { id: 'fallback-competitive-position', name: 'Competitive Position', type: 'qualitative', category: 'Business Model', data_type: 'rating', unit: '1-5' },
  // Options
  { id: 'fallback-implied-volatility', name: 'Implied Volatility', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' },
  { id: 'fallback-delta', name: 'Delta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
  { id: 'fallback-theta', name: 'Theta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' }
];

// This array will be populated from the database at runtime. It is exported so
// existing imports continue to function. Components that rely on this value
// should call `getAllFactors` first to ensure it's populated.
let ALL_FACTORS: FactorDefinition[] = [...FALLBACK_FACTORS];

class IPSDataService {
  // Store IPS configurations in memory (replace with database in production)
  private ipsConfigurations: Map<string, IPSConfiguration[]> = new Map();

  // Get available trading strategies
  getAvailableStrategies(): TradingStrategy[] {
    return TRADING_STRATEGIES;
  }

  // Get all factors from the database (falls back to built-in list on error)
  async getAllFactors(): Promise<FactorDefinition[]> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabase
        .from('factors')
        .select('id, name, type, category, data_type, unit, source');

      if (error || !data) {
        console.error('Failed to fetch factors:', error?.message);
        return ALL_FACTORS;
      }

      ALL_FACTORS = data as FactorDefinition[];
      return ALL_FACTORS;
    } catch (err) {
      console.error('Error loading factors:', err);
      return ALL_FACTORS;
    }
  }

  // Get factors by type
  async getFactorsByType(type: 'quantitative' | 'qualitative' | 'options'): Promise<FactorDefinition[]> {
    const factors = await this.getAllFactors();
    return factors.filter(factor => factor.type === type);
  }

  // Get factors for selected strategies
  async getFactorsForStrategies(strategyIds: string[]): Promise<{
    availableFactors: FactorDefinition[];
    recommendedFactors: string[];
    requiredTypes: string[];
  }> {
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

    // Get all available factors and filter by required types
    const allFactors = await this.getAllFactors();
    const availableFactors = allFactors.filter(factor => requiredTypes.has(factor.type));

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
    // TODO: Replace with database insert
    const newIPS: IPSConfiguration = {
      id: `ips-${Date.now()}`,
      user_id: userId,
      name: ipsData.name || 'Untitled Strategy',
      description: ipsData.description,
      strategies: ipsData.strategies || [],
      is_active: ipsData.is_active ?? true,
      created_at: new Date().toISOString(),
      ...ipsData
    };

    const userIPSs = this.ipsConfigurations.get(userId) || [];
    userIPSs.push(newIPS);
    this.ipsConfigurations.set(userId, userIPSs);

    return Promise.resolve(newIPS);
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