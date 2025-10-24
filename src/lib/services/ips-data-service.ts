// src/lib/services/ips-data-service.ts

import type { IPSFactor } from "@/lib/types";

// Trading Strategy Definition
interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  requiredFactorTypes: ('quantitative' | 'options')[];
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
  api_factors?: number;
  manual_factors?: number;
  total_weight?: number;
  avg_weight?: number;
  created_at: string;
  last_modified?: string;
  exit_strategies?: any;
  watch_criteria?: any;
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
  type: 'quantitative' | 'options';
  category: string;
  data_type: string;
  unit: string;
  source?: string;
}

// Trading strategies definition (static configuration, not data)
// Only showing active strategies (Put/Call Credit Spreads)
const TRADING_STRATEGIES: TradingStrategy[] = [
  {
    id: 'put-credit-spreads',
    name: 'Put Credit Spreads',
    description: 'Bullish options strategy with defined risk',
    requiredFactorTypes: ['quantitative', 'options'],
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
    requiredFactorTypes: ['quantitative', 'options'],
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
  }
];

// Factor definitions for Alpha Vantage API (static configuration)
const ALPHA_VANTAGE_FACTORS: FactorDefinition[] = [
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
  // Add more as needed...
];

// Options factors (all from options API)
const OPTIONS_FACTORS: FactorDefinition[] = [
  { id: 'opt-iv', name: 'Implied Volatility', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' , source: 'alpha_vantage_options' },
  { id: 'opt-delta', name: 'Delta (Short Leg)', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' , source: 'alpha_vantage_options' },
  { id: 'opt-gamma', name: 'Gamma', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' , source: 'alpha_vantage_options' },
  { id: 'opt-theta', name: 'Theta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' , source: 'alpha_vantage_options' },
  { id: 'opt-vega', name: 'Vega', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' , source: 'alpha_vantage_options' },
  { id: 'opt-rho', name: 'Rho', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' , source: 'alpha_vantage_options' },
  { id: 'opt-open-interest', name: 'Open Interest', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'contracts' , source: 'alpha_vantage_options' },
  { id: 'opt-volume', name: 'Option Volume', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'contracts' , source: 'alpha_vantage_options' },
  { id: 'opt-bid-ask-spread', name: 'Bid-Ask Spread', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: '$' , source: 'alpha_vantage_options' },
  { id: 'opt-time-value', name: 'Time Value', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: '$' , source: 'alpha_vantage_options' },
  { id: 'opt-intrinsic-value', name: 'Intrinsic Value', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: '$' , source: 'alpha_vantage_options' },
  { id: 'opt-put-call-ratio', name: 'Put/Call Ratio', type: 'options', category: 'Sentiment & Flow', data_type: 'ratio', unit: 'ratio' },
  { id: 'opt-iv-rank', name: 'IV Rank', type: 'options', category: 'Sentiment & Flow', data_type: 'percentile', unit: '%' },
  { id: 'opt-iv-percentile', name: 'IV Percentile', type: 'options', category: 'Sentiment & Flow', data_type: 'percentile', unit: '%' },
  { id: 'opt-skew', name: 'Volatility Skew', type: 'options', category: 'Sentiment & Flow', data_type: 'percentage', unit: '%' },
  { id: 'opt-chain-liquidity', name: 'Options Chain Liquidity', type: 'options', category: 'Sentiment & Flow', data_type: 'rating', unit: '1-5' },
  // Add more as needed...
];

// Combined factors - All API-based (no manual/qualitative factors)
const ALL_FACTORS = [
  ...ALPHA_VANTAGE_FACTORS,
  ...OPTIONS_FACTORS
];

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === 't' || v === '1' || v === 'yes';
  }
  return false;
}

class IPSDataService {
  // Store IPS configurations in memory (replace with database in production)
  private ipsConfigurations: Map<string, IPSConfiguration[]> = new Map();

  // Get available trading strategies
  getAvailableStrategies(): TradingStrategy[] {
    return TRADING_STRATEGIES;
  }

  // Get all factors from database
  async getAllFactors(): Promise<FactorDefinition[]> {
    try {
      const response = await fetch('/api/factors', { cache: 'no-store' });
      if (!response.ok) {
        console.error('Failed to fetch factors from API');
        return ALL_FACTORS; // Fallback to static data
      }
      const factors = await response.json();
      return Array.isArray(factors) ? factors : ALL_FACTORS;
    } catch (error) {
      console.error('Error fetching factors:', error);
      return ALL_FACTORS; // Fallback to static data
    }
  }

  // Get factors by type from database
  async getFactorsByType(type: 'quantitative' | 'options'): Promise<FactorDefinition[]> {
    const allFactors = await this.getAllFactors();
    return allFactors.filter(factor => factor.type === type);
  }

  // Get factors for selected strategies from database
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

    // Fetch all factors from database
    const allFactors = await this.getAllFactors();

    // Filter available factors based on required types
    const availableFactors = allFactors.filter(factor =>
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
    try {
      // Fetch from the Next.js API which proxies Supabase
      const res = await fetch('/api/ips', { cache: 'no-store' });
      const rows = await res.json();

      if (!Array.isArray(rows)) {
        throw new Error('Invalid IPS response');
      }

      // The API returns ips_configurations rows directly
      // Just filter by user_id and map to IPSConfiguration type
      const userIPSs = rows
        .filter(r => r.user_id === userId)
        .map(r => ({
          id: r.id,
          user_id: r.user_id,
          name: r.name || 'Untitled IPS',
          description: r.description || '',
          strategies: Array.isArray(r.strategies) ? r.strategies : [],
          is_active: r.is_active !== false, // default to true
          total_factors: r.total_factors || 0,
          active_factors: r.active_factors || 0,
          api_factors: r.api_factors || 0,      // Add these if they exist
          manual_factors: r.manual_factors || 0,  // Add these if they exist
          total_weight: r.total_weight || 0,
          avg_weight: r.avg_weight || 0,
          win_rate: r.win_rate || 0,
          avg_roi: r.avg_roi || 0,
          total_trades: r.total_trades || 0,
          created_at: r.created_at || new Date().toISOString(),
          last_modified: r.last_modified || r.updated_at
        } as IPSConfiguration));

      // Cache for potential future use
      this.ipsConfigurations.set(userId, userIPSs);

      return userIPSs;
    } catch (error) {
      console.error('Error fetching IPS configurations:', error);
      // Fallback to any cached entries
      return this.ipsConfigurations.get(userId) || [];
    }
  }

  async getIPSById(ipsId: string): Promise<IPSConfiguration | null> {
    // TODO: Replace with database query
    for (const [userId, ipsList] of this.ipsConfigurations.entries()) {
      const ips = ipsList.find(i => i.id === ipsId);
      if (ips) return Promise.resolve(ips);
    }
    return Promise.resolve(null);
  }

  async getIPSFactors(ipsId: string): Promise<IPSFactor[]> {
    try {
      // Dedicated route returning already-shaped factors
      const response = await fetch(`/api/ips/${ipsId}/factors`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch IPS factors');
      const shaped = await response.json();
      return Array.isArray(shaped) ? (shaped as IPSFactor[]) : [];
    } catch (error) {
      console.error('Error fetching IPS factors:', error);
      return [];
    }
  }

  private isAPIFactor(factorName: string): boolean {
    const apiFactorNames = [
      'P/E Ratio', 'Beta', 'Revenue Growth YoY', 'Return on Equity',
      'Debt to Equity', 'Dividend Yield', 'Market Cap', 'Volume',
      'Implied Volatility', 'Delta', 'Theta', 'Vega', 'Gamma'
    ];
    return apiFactorNames.includes(factorName);
  }

  async createIPS(userId: string, ipsData: any): Promise<IPSConfiguration> {
    console.log('=== IPSDataService.createIPS ===');
    console.log('User ID:', userId);
    console.log('IPS Data received:', ipsData);
    
    // Build the request body for the API
    const factors = ipsData.factors || 
               (ipsData.strategies && ipsData.strategies[0]?.factors) || 
               [];

    console.log('Extracted factors:', factors);

    const requestBody = {
      user_id: userId,
      name: ipsData.name || 'Untitled Strategy',
      description: ipsData.description || '',
      is_active: ipsData.is_active ?? true,
      strategies: ipsData.strategies || [],
      factors: factors
    };

    console.log('Request body for API:', requestBody);
    console.log('Factors being sent:', requestBody.factors);

    try {
      const response = await fetch('/api/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log('API Response status:', response.status);
      console.log('API Response text:', responseText);

      if (!response.ok) {
        console.error('❌ API returned error:', responseText);
        let errorMessage = 'Failed to create IPS';
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Parse the successful response
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse successful response:', e);
        throw new Error('Invalid response format from server');
      }

      console.log('✅ IPS created successfully. Response:', responseData);

      // Transform API response to match IPSConfiguration interface
      const ipsConfig: IPSConfiguration = {
        id: responseData.ips_id,
        user_id: userId,
        name: ipsData.name || 'Untitled Strategy',
        description: ipsData.description || '',
        strategies: ipsData.strategies || [],
        is_active: ipsData.is_active ?? true,
        total_factors: ipsData.factors?.length || 0,
        active_factors: ipsData.factors?.filter((f: any) => f.weight > 0).length || 0,
        total_weight: ipsData.factors?.reduce((sum: number, f: any) => sum + (f.weight || 0), 0) || 0,
        avg_weight: ipsData.factors?.length > 0 
          ? (ipsData.factors.reduce((sum: number, f: any) => sum + (f.weight || 0), 0) / ipsData.factors.length)
          : 0,
        created_at: new Date().toISOString()
      };

      // Store in local cache
      const userIPSs = this.ipsConfigurations.get(userId) || [];
      userIPSs.push(ipsConfig);
      this.ipsConfigurations.set(userId, userIPSs);

      return ipsConfig;
      
    } catch (error) {
      console.error('❌ Error in createIPS:', error);
      throw error;
    }
  }

  async updateIPS(ipsId: string, updates: Partial<IPSConfiguration>): Promise<IPSConfiguration> {
    console.log('=== IPSDataService.updateIPS ===');
    console.log('IPS ID:', ipsId);
    console.log('Updates:', updates);

    try {
      const response = await fetch('/api/ips', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ipsId, ...updates })
      });

      const responseText = await response.text();
      console.log('API Response status:', response.status);
      console.log('API Response text:', responseText);

      if (!response.ok) {
        let errorMessage = 'Failed to update IPS';
        try {
          const errJson = JSON.parse(responseText);
          errorMessage = errJson.error || errorMessage;
        } catch {
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const { data } = JSON.parse(responseText);

      // Update local cache if present
      for (const [userId, ipsList] of this.ipsConfigurations.entries()) {
        const index = ipsList.findIndex(i => i.id === ipsId);
        if (index !== -1) {
          ipsList[index] = {
            ...ipsList[index],
            ...updates,
            ...data,
            last_modified: new Date().toISOString()
          } as IPSConfiguration;
          return ipsList[index];
        }
      }

      // If not found in cache, return normalized response
      return {
        id: ipsId,
        user_id: data.user_id,
        name: data.name,
        description: data.description,
        strategies: updates.strategies || [],
        is_active: data.is_active,
        total_factors: data.total_factors,
        active_factors: data.active_factors,
        total_weight: data.total_weight,
        avg_weight: data.avg_weight,
        created_at: data.created_at,
        last_modified: new Date().toISOString()
      } as IPSConfiguration;

    } catch (error) {
      console.error('❌ Error in updateIPS:', error);
      throw error;
    }
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

// Get factor configurations
async saveFactorConfigurations(ipsId: string, configurations: any[]): Promise<any> {
  console.log(`Saving factor configurations for IPS: ${ipsId}`, configurations);
  
  const transformedFactors = configurations.map(factor => {
    const factorName = factor.factor_name || 
                      factor.name || 
                      factor.factorName || 
                      factor.factor?.name || 
                      '';
    
    if (!factorName) {
      console.warn('Warning: Missing factor_name for factor:', factor);
    }
    
    return {
      ips_id: ipsId,
      factor_id: factor.factor_id || factor.id,
      factor_name: factorName,
      weight: factor.weight || 0,
      target_value: factor.target_value || factor.targetValue || null,
      target_operator: factor.target_operator || factor.targetOperator || null,
      preference_direction: factor.preference_direction || factor.preferenceDirection || null,
      enabled: factor.enabled !== undefined ? factor.enabled : true
    };
  });
  
  console.log('Transformed factor rows for database:', transformedFactors);

      // Use direct Supabase client (same as IPS page)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  
  const invalidFactors = transformedFactors.filter(f => !f.factor_name || !f.factor_id);
  if (invalidFactors.length > 0) {
    console.error('Invalid factors found (missing required fields):', invalidFactors);
    throw new Error('Some factors are missing required fields (factor_name or factor_id)');
  }
  
  try {
    const { data, error } = await supabase
      .from('ips_factors')
      .insert(transformedFactors)
      .select();
    
    if (error) {
      console.error('Error inserting factor configurations:', error);
      throw new Error(`Failed to save factor configurations: ${error.message}`);
    }
    
    console.log('✅ Factor configurations saved successfully:', data);
    return data;
  } catch (error) {
    console.error('❌ Error in saveFactorConfigurations:', error);
    throw error;
  }
}

}

export type NewIPS = {
  name: string;
  description?: string;
  is_active?: boolean;
  factors: { factor_id: string; weight: number; target_value?: number | null }[];
};

export async function createIPS(input: NewIPS) {
  console.log('Client: Sending IPS creation request:', input);
  
  const res = await fetch('/api/ips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  
  const json = await res.json();
  console.log('Client: Response status:', res.status);
  console.log('Client: Response data:', json);
  
  if (!res.ok) {
    throw new Error(json.error || `Failed to create IPS: ${res.status}`);
  }
  
  return json as { ips_id: string; rows: any[] };
}

export async function getIPS(id: string) {
  const res = await fetch(`/api/ips/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to fetch IPS');
  return json as any[];
}

export async function listIPS() {
  const res = await fetch('/api/ips');
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to list IPS');
  return json as any[];
}

// Export singleton instance
export const ipsDataService = new IPSDataService();
export type { IPSConfiguration, TradingStrategy, FactorDefinition };
export { TRADING_STRATEGIES, ALL_FACTORS };
