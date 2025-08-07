// src/lib/services/ips-data-service.ts
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Types
export interface IPSConfiguration {
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
    minIV?: number;
    maxDelta?: number;
    targetROI?: number;
    maxPositions?: number;
  };
}

export interface IPSFactorConfiguration {
  id: string;
  ips_id: string;
  factor_id: string;
  factor_name: string;
  weight: number;
  enabled: boolean;
  target_config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  requiredCapital: string;
  timeCommitment: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  marketConditions: string[];
  keyMetrics: string[];
  requiredFactorTypes: ('quantitative' | 'qualitative' | 'options')[];
  recommendedFactors: string[];
}

// Factor definitions (keeping the same structure as before)
const ALPHA_VANTAGE_FACTORS = [
  { id: 'stock-price', name: 'Current Stock Price', type: 'stock', category: 'Price & Volume', data_type: 'numeric', unit: '$' },
  { id: 'stock-volume', name: 'Volume', type: 'stock', category: 'Price & Volume', data_type: 'numeric', unit: 'shares' },
  { id: 'stock-market-cap', name: 'Market Capitalization', type: 'stock', category: 'Fundamentals', data_type: 'numeric', unit: '$' },
  { id: 'stock-pe-ratio', name: 'P/E Ratio', type: 'stock', category: 'Fundamentals', data_type: 'ratio', unit: 'ratio' },
  { id: 'stock-dividend-yield', name: 'Dividend Yield', type: 'stock', category: 'Fundamentals', data_type: 'percentage', unit: '%' },
  { id: 'stock-52w-high', name: '52-Week High', type: 'stock', category: 'Price & Volume', data_type: 'numeric', unit: '$' },
  { id: 'stock-52w-low', name: '52-Week Low', type: 'stock', category: 'Price & Volume', data_type: 'numeric', unit: '$' },
  { id: 'stock-beta', name: 'Beta', type: 'stock', category: 'Risk Metrics', data_type: 'numeric', unit: 'coefficient' },
  { id: 'stock-rsi', name: 'RSI (14-day)', type: 'stock', category: 'Technical Indicators', data_type: 'oscillator', unit: '0-100' },
  { id: 'stock-macd', name: 'MACD', type: 'stock', category: 'Technical Indicators', data_type: 'momentum', unit: 'price' },
  { id: 'stock-sma-20', name: 'SMA (20-day)', type: 'stock', category: 'Technical Indicators', data_type: 'numeric', unit: '$' },
  { id: 'stock-sma-50', name: 'SMA (50-day)', type: 'stock', category: 'Technical Indicators', data_type: 'numeric', unit: '$' },
  { id: 'stock-ema-12', name: 'EMA (12-day)', type: 'stock', category: 'Technical Indicators', data_type: 'numeric', unit: '$' },
  { id: 'stock-ema-26', name: 'EMA (26-day)', type: 'stock', category: 'Technical Indicators', data_type: 'numeric', unit: '$' },
];

const QUALITATIVE_FACTORS = [
  { id: 'earnings-announcement', name: 'Earnings Announcement', type: 'qualitative', category: 'Corporate Events', data_type: 'date', unit: 'days_until' },
  { id: 'ex-dividend-date', name: 'Ex-Dividend Date', type: 'qualitative', category: 'Corporate Events', data_type: 'date', unit: 'days_until' },
  { id: 'analyst-rating', name: 'Analyst Rating', type: 'qualitative', category: 'Analyst Coverage', data_type: 'rating', unit: '1-5' },
  { id: 'news-sentiment', name: 'News Sentiment', type: 'qualitative', category: 'Market Sentiment', data_type: 'sentiment', unit: '-1 to 1' },
  { id: 'sector-performance', name: 'Sector Performance', type: 'qualitative', category: 'Market Context', data_type: 'percentage', unit: '%' },
  { id: 'market-regime', name: 'Market Regime', type: 'qualitative', category: 'Market Context', data_type: 'categorical', unit: 'bull/bear/neutral' },
];

const OPTIONS_FACTORS = [
  { id: 'opt-implied-volatility', name: 'Implied Volatility', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' },
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

const ALL_FACTORS = [...ALPHA_VANTAGE_FACTORS, ...QUALITATIVE_FACTORS, ...OPTIONS_FACTORS];

// Trading strategies
const AVAILABLE_STRATEGIES: TradingStrategy[] = [
  {
    id: 'put-credit-spread',
    name: 'Put Credit Spread',
    description: 'Sell a put option and buy a put option at a lower strike price',
    category: 'Credit Spreads',
    difficulty: 'Intermediate',
    requiredCapital: '$2,000 - $10,000',
    timeCommitment: '1-2 hours/week',
    riskLevel: 'Medium',
    marketConditions: ['Neutral', 'Bullish'],
    keyMetrics: ['IV Rank', 'Delta', 'DTE', 'Liquidity'],
    requiredFactorTypes: ['options', 'quantitative'],
    recommendedFactors: ['opt-implied-volatility', 'opt-delta', 'opt-volume', 'stock-volume', 'opt-iv-rank']
  },
  {
    id: 'call-credit-spread',
    name: 'Call Credit Spread',
    description: 'Sell a call option and buy a call option at a higher strike price',
    category: 'Credit Spreads',
    difficulty: 'Intermediate',
    requiredCapital: '$2,000 - $10,000',
    timeCommitment: '1-2 hours/week',
    riskLevel: 'Medium',
    marketConditions: ['Neutral', 'Bearish'],
    keyMetrics: ['IV Rank', 'Delta', 'DTE', 'Liquidity'],
    requiredFactorTypes: ['options', 'quantitative'],
    recommendedFactors: ['opt-implied-volatility', 'opt-delta', 'opt-volume', 'stock-volume', 'opt-iv-rank']
  },
  {
    id: 'iron-condor',
    name: 'Iron Condor',
    description: 'Combination of put credit spread and call credit spread',
    category: 'Neutral Strategies',
    difficulty: 'Advanced',
    requiredCapital: '$3,000 - $15,000',
    timeCommitment: '2-3 hours/week',
    riskLevel: 'Medium',
    marketConditions: ['Neutral', 'Low Volatility'],
    keyMetrics: ['IV Rank', 'Delta', 'Expected Move', 'Liquidity'],
    requiredFactorTypes: ['options', 'quantitative', 'qualitative'],
    recommendedFactors: ['opt-implied-volatility', 'opt-delta', 'opt-gamma', 'opt-theta', 'opt-market-implied-move', 'stock-volume']
  },
  {
    id: 'long-call',
    name: 'Long Call',
    description: 'Buy a call option to profit from upward price movement',
    category: 'Directional',
    difficulty: 'Beginner',
    requiredCapital: '$500 - $5,000',
    timeCommitment: '30 min/week',
    riskLevel: 'High',
    marketConditions: ['Bullish'],
    keyMetrics: ['Delta', 'IV', 'DTE', 'Volume'],
    requiredFactorTypes: ['options', 'quantitative'],
    recommendedFactors: ['opt-delta', 'opt-implied-volatility', 'opt-volume', 'stock-price', 'stock-volume']
  },
  {
    id: 'long-put',
    name: 'Long Put',
    description: 'Buy a put option to profit from downward price movement',
    category: 'Directional',
    difficulty: 'Beginner',
    requiredCapital: '$500 - $5,000',
    timeCommitment: '30 min/week',
    riskLevel: 'High',
    marketConditions: ['Bearish'],
    keyMetrics: ['Delta', 'IV', 'DTE', 'Volume'],
    requiredFactorTypes: ['options', 'quantitative'],
    recommendedFactors: ['opt-delta', 'opt-implied-volatility', 'opt-volume', 'stock-price', 'stock-volume']
  },
];

export class IPSDataService {
  // Get current user ID
  private async getCurrentUserId(): Promise<string> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      throw new Error('User not authenticated');
    }
    return user.id;
  }

  // IPS Configuration methods
  async createIPS(userId: string, ipsData: any): Promise<IPSConfiguration> {
    const { data, error } = await supabase
      .from('ips_configurations')
      .insert({
        user_id: userId,
        name: ipsData.name,
        description: ipsData.description,
        strategies: ipsData.strategies || [],
        criteria: ipsData.criteria || {}
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create IPS: ${error.message}`);
    }

    return data;
  }

  async getAllUserIPSs(userId: string): Promise<IPSConfiguration[]> {
    const { data, error } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch IPS configurations: ${error.message}`);
    }

    return data || [];
  }

  async getActiveIPS(userId: string): Promise<IPSConfiguration | null> {
    const { data, error } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return null;
      }
      throw new Error(`Failed to fetch active IPS: ${error.message}`);
    }

    return data;
  }

  async getIPSById(ipsId: string): Promise<IPSConfiguration | null> {
    const { data, error } = await supabase
      .from('ips_configurations')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return null;
      }
      throw new Error(`Failed to fetch IPS: ${error.message}`);
    }

    return data;
  }

  async updateIPS(ipsId: string, ipsData: any): Promise<IPSConfiguration> {
    const { data, error } = await supabase
      .from('ips_configurations')
      .update({
        name: ipsData.name,
        description: ipsData.description,
        strategies: ipsData.strategies,
        criteria: ipsData.criteria
      })
      .eq('id', ipsId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update IPS: ${error.message}`);
    }

    return data;
  }

  async toggleIPSStatus(ipsId: string): Promise<IPSConfiguration> {
    // First get current status
    const current = await this.getIPSById(ipsId);
    if (!current) {
      throw new Error('IPS not found');
    }

    const { data, error } = await supabase
      .from('ips_configurations')
      .update({ is_active: !current.is_active })
      .eq('id', ipsId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to toggle IPS status: ${error.message}`);
    }

    return data;
  }

  async duplicateIPS(ipsId: string, userId: string): Promise<IPSConfiguration> {
    const originalIPS = await this.getIPSById(ipsId);
    if (!originalIPS) {
      throw new Error('IPS not found');
    }

    const { data, error } = await supabase
      .from('ips_configurations')
      .insert({
        user_id: userId,
        name: `${originalIPS.name} (Copy)`,
        description: originalIPS.description,
        strategies: originalIPS.strategies,
        criteria: originalIPS.criteria,
        is_active: false // Copies start as inactive
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to duplicate IPS: ${error.message}`);
    }

    return data;
  }

  async deleteIPS(ipsId: string): Promise<void> {
    const { error } = await supabase
      .from('ips_configurations')
      .delete()
      .eq('id', ipsId);

    if (error) {
      throw new Error(`Failed to delete IPS: ${error.message}`);
    }
  }

  // Factor configuration methods
  async saveFactorConfigurations(ipsId: string, factorConfigs: any[]): Promise<void> {
    // First delete existing configurations
    const { error: deleteError } = await supabase
      .from('ips_factor_configurations')
      .delete()
      .eq('ips_id', ipsId);

    if (deleteError) {
      throw new Error(`Failed to clear existing factor configurations: ${deleteError.message}`);
    }

    // Insert new configurations
    if (factorConfigs.length > 0) {
      const configsToInsert = factorConfigs.map(config => ({
        ips_id: ipsId,
        factor_id: config.factorId,
        factor_name: config.factorName || config.factorId,
        weight: config.weight,
        enabled: config.enabled,
        target_config: config.targetConfig || {}
      }));

      const { error: insertError } = await supabase
        .from('ips_factor_configurations')
        .insert(configsToInsert);

      if (insertError) {
        throw new Error(`Failed to save factor configurations: ${insertError.message}`);
      }
    }

    // Update IPS stats
    await this.updateIPSFactorStats(ipsId, factorConfigs);
  }

  async getFactorConfigurations(ipsId: string): Promise<IPSFactorConfiguration[]> {
    const { data, error } = await supabase
      .from('ips_factor_configurations')
      .select('*')
      .eq('ips_id', ipsId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch factor configurations: ${error.message}`);
    }

    return data || [];
  }

  private async updateIPSFactorStats(ipsId: string, factorConfigs: any[]): Promise<void> {
    const totalFactors = factorConfigs.length;
    const activeFactors = factorConfigs.filter(config => config.enabled).length;
    const totalWeight = factorConfigs.reduce((sum, config) => sum + (config.enabled ? config.weight : 0), 0);
    const avgWeight = activeFactors > 0 ? totalWeight / activeFactors : 0;

    const { error } = await supabase
      .from('ips_configurations')
      .update({
        total_factors: totalFactors,
        active_factors: activeFactors,
        total_weight: totalWeight,
        avg_weight: avgWeight
      })
      .eq('id', ipsId);

    if (error) {
      console.error('Failed to update IPS factor stats:', error);
    }
  }

  // Performance tracking
  async updateIPSPerformance(ipsId: string, performance: any): Promise<void> {
    const { error } = await supabase
      .from('ips_configurations')
      .update({ performance })
      .eq('id', ipsId);

    if (error) {
      throw new Error(`Failed to update IPS performance: ${error.message}`);
    }
  }

  // Factor and strategy data methods
  getAvailableFactors(): any[] {
    return ALL_FACTORS;
  }

  getAvailableStrategies(): TradingStrategy[] {
    return AVAILABLE_STRATEGIES;
  }

  getFactorsForStrategies(strategies: string[]): { raw: any[], grouped: any } {
    // For now, return all factors. In a real implementation, you might filter based on strategies
    const matchingFactors = ALL_FACTORS;
    
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
}

// Singleton instance
export const ipsDataService = new IPSDataService();