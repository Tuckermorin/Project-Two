/**
 * Enhanced IPS Data Access Layer - Multiple IPS Support
 * Copy this into: src/lib/ips-data-service.ts
 */

// For now, we'll use mock data. Replace with your actual database connection
// import { createClient } from '@supabase/supabase-js';

interface IPSConfiguration {
  id: string;
  user_id: string;
  name: string;
  description?: string;
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

interface FactorDefinition {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative' | 'options';
  category: string;
  description?: string;
  data_type: string;
  unit?: string;
}

export class IPSDataService {
  // Enhanced mock data with multiple IPSs
  private mockIPSs: IPSConfiguration[] = [
    {
      id: 'ips-1',
      user_id: 'demo-user-id',
      name: 'Conservative PCS Strategy',
      description: 'Low-risk put credit spreads with high probability of success',
      is_active: true,
      total_factors: 12,
      active_factors: 10,
      total_weight: 62,
      avg_weight: 6.2,
      created_at: '2025-07-01T00:00:00Z',
      last_modified: '2025-08-01',
      performance: { winRate: 85, avgROI: 4.2, totalTrades: 24 },
      criteria: {
        minIV: 40,
        maxDelta: 0.20,
        targetROI: 6,
        maxPositions: 3
      }
    },
    {
      id: 'ips-2',
      user_id: 'demo-user-id',
      name: 'Aggressive Growth IPS',
      description: 'Higher risk tolerance with aggressive profit targets',
      is_active: false,
      total_factors: 15,
      active_factors: 13,
      total_weight: 101,
      avg_weight: 7.8,
      created_at: '2025-06-15T00:00:00Z',
      last_modified: '2025-07-15',
      performance: { winRate: 72, avgROI: 8.1, totalTrades: 18 },
      criteria: {
        minIV: 30,
        maxDelta: 0.35,
        targetROI: 12,
        maxPositions: 5
      }
    },
    {
      id: 'ips-3',
      user_id: 'demo-user-id',
      name: 'Earnings Play Strategy',
      description: 'Specialized strategy for pre-earnings volatility plays',
      is_active: false,
      total_factors: 8,
      active_factors: 6,
      total_weight: 51,
      avg_weight: 8.5,
      created_at: '2025-05-20T00:00:00Z',
      last_modified: '2025-06-20',
      performance: { winRate: 65, avgROI: 15.3, totalTrades: 12 },
      criteria: {
        minIV: 60,
        maxDelta: 0.25,
        targetROI: 20,
        maxPositions: 2
      }
    }
  ];

  // Real factor definitions from Excel file
  private mockFactorDefinitions: FactorDefinition[] = [
    // Quantitative Factors - Income Statement
    { id: 'quant-revenue', name: 'Revenue', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$' },
    { id: 'quant-gross-margin', name: 'Gross Margin', type: 'quantitative', category: 'Income Statement', data_type: 'percentage', unit: '%' },
    { id: 'quant-operating-margin', name: 'Operating Margin', type: 'quantitative', category: 'Income Statement', data_type: 'percentage', unit: '%' },
    { id: 'quant-ebitda-margin', name: 'EBITDA Margin', type: 'quantitative', category: 'Income Statement', data_type: 'percentage', unit: '%' },
    { id: 'quant-net-margin', name: 'Net Margin', type: 'quantitative', category: 'Income Statement', data_type: 'percentage', unit: '%' },
    { id: 'quant-eps', name: 'EPS', type: 'quantitative', category: 'Income Statement', data_type: 'numeric', unit: '$' },
    { id: 'quant-yoyqoq-comparison', name: 'YoY/QoQ Comparison', type: 'quantitative', category: 'Income Statement', data_type: 'percentage', unit: '%' },

    // Quantitative Factors - Balance Sheet
    { id: 'quant-total-assets', name: 'Total Assets', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$' },
    { id: 'quant-total-liabilities', name: 'Total Liabilities', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$' },
    { id: 'quant-current-ratio', name: 'Current Ratio', type: 'quantitative', category: 'Balance Sheet', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-quick-ratio', name: 'Quick Ratio', type: 'quantitative', category: 'Balance Sheet', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-debt-levels', name: 'Debt Levels', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$' },
    { id: 'quant-book-value-per-share', name: 'Book Value per Share', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$' },
    { id: 'quant-net-tangible-assets', name: 'Net Tangible Assets', type: 'quantitative', category: 'Balance Sheet', data_type: 'numeric', unit: '$' },

    // Quantitative Factors - Cash Flow
    { id: 'quant-operating-cash-flow', name: 'Operating Cash Flow', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },
    { id: 'quant-free-cash-flow', name: 'Free Cash Flow', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },
    { id: 'quant-capex', name: 'CapEx', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },
    { id: 'quant-cash-flow-per-share', name: 'Cash Flow per Share', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },
    { id: 'quant-working-capital', name: 'Working Capital', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },

    // Quantitative Factors - Valuation Metrics
    { id: 'quant-pe-ratio', name: 'P/E Ratio', type: 'quantitative', category: 'Valuation Metrics', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-pb-ratio', name: 'P/B Ratio', type: 'quantitative', category: 'Valuation Metrics', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-ps-ratio', name: 'P/S Ratio', type: 'quantitative', category: 'Valuation Metrics', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-peg-ratio', name: 'PEG Ratio', type: 'quantitative', category: 'Valuation Metrics', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-ev-ebitda', name: 'EV/EBITDA', type: 'quantitative', category: 'Valuation Metrics', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-price-to-fcf', name: 'Price to FCF', type: 'quantitative', category: 'Valuation Metrics', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-market-cap', name: 'Market Cap', type: 'quantitative', category: 'Valuation Metrics', data_type: 'numeric', unit: '$' },

    // Quantitative Factors - Growth Metrics
    { id: 'quant-revenue-growth', name: 'Revenue Growth', type: 'quantitative', category: 'Growth Metrics', data_type: 'percentage', unit: '%' },
    { id: 'quant-earnings-growth', name: 'Earnings Growth', type: 'quantitative', category: 'Growth Metrics', data_type: 'percentage', unit: '%' },
    { id: 'quant-operating-leverage', name: 'Operating Leverage', type: 'quantitative', category: 'Growth Metrics', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-eps-growth', name: 'EPS Growth', type: 'quantitative', category: 'Growth Metrics', data_type: 'percentage', unit: '%' },
    { id: 'quant-book-value-growth', name: 'Book Value Growth', type: 'quantitative', category: 'Growth Metrics', data_type: 'percentage', unit: '%' },

    // Quantitative Factors - Market & Trading
    { id: 'quant-beta', name: 'Beta', type: 'quantitative', category: 'Market & Trading', data_type: 'numeric', unit: 'ratio' },
    { id: 'quant-short-interest', name: 'Short Interest', type: 'quantitative', category: 'Market & Trading', data_type: 'percentage', unit: '%' },
    { id: 'quant-avg-daily-volume', name: 'Avg Daily Volume', type: 'quantitative', category: 'Market & Trading', data_type: 'numeric', unit: 'shares' },
    { id: 'quant-institutional-ownership', name: 'Institutional Ownership', type: 'quantitative', category: 'Market & Trading', data_type: 'percentage', unit: '%' },
    { id: 'quant-insider-ownership-market', name: 'Insider Ownership', type: 'quantitative', category: 'Market & Trading', data_type: 'percentage', unit: '%' },
    { id: 'quant-options-open-interest', name: 'Options Open Interest', type: 'quantitative', category: 'Market & Trading', data_type: 'numeric', unit: 'contracts' },
    { id: 'quant-shares-outstanding', name: 'Shares Outstanding', type: 'quantitative', category: 'Market & Trading', data_type: 'numeric', unit: 'shares' },

    // Qualitative Factors - Management & Governance
    { id: 'qual-leadership-track-record', name: 'Leadership Track Record', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
    { id: 'qual-capital-allocation', name: 'Capital Allocation', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
    { id: 'qual-insider-ownership', name: 'Insider Ownership', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
    { id: 'qual-board-independence', name: 'Board Independence', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
    { id: 'qual-buyback-history', name: 'Buyback History', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
    { id: 'qual-guidance-quality', name: 'Guidance Quality', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },
    { id: 'qual-ma-execution', name: 'M&A Execution', type: 'qualitative', category: 'Management & Governance', data_type: 'rating', unit: '1-5' },

    // Qualitative Factors - Business Model & Industry
    { id: 'qual-business-model-clarity', name: 'Business Model Clarity', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-competitive-moat', name: 'Competitive Moat', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-industry-position', name: 'Industry Position', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-market-share', name: 'Market Share', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-innovation-rd', name: 'Innovation & R&D', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-regulatory-environment', name: 'Regulatory Environment', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-esg-factors', name: 'ESG Factors', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },

    // Options Factors - Options Metrics
    { id: 'opt-iv', name: 'Implied Volatility', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' },
    { id: 'opt-delta', name: 'Delta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
    { id: 'opt-gamma', name: 'Gamma', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
    { id: 'opt-theta', name: 'Theta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
    { id: 'opt-vega', name: 'Vega', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
    { id: 'opt-open-interest', name: 'Open Interest', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'contracts' },
    { id: 'opt-volume', name: 'Volume', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'contracts' },

    // Options Factors - Sentiment & Flow
    { id: 'opt-put-call-ratio', name: 'Put/Call Ratio', type: 'options', category: 'Sentiment & Flow', data_type: 'ratio', unit: 'ratio' },
    { id: 'opt-skew', name: 'Skew', type: 'options', category: 'Sentiment & Flow', data_type: 'percentage', unit: '%' },
    { id: 'opt-options-chain-liquidity', name: 'Options Chain Liquidity', type: 'options', category: 'Sentiment & Flow', data_type: 'rating', unit: '1-5' },
    { id: 'opt-market-implied-move', name: 'Market-Implied Move', type: 'options', category: 'Sentiment & Flow', data_type: 'percentage', unit: '%' },
    { id: 'opt-iv-rank-iv-percentile', name: 'IV Rank / IV Percentile', type: 'options', category: 'Sentiment & Flow', data_type: 'percentile', unit: '%' }
  ];

  // **NEW METHODS FOR MULTIPLE IPS SUPPORT**

  async getAllUserIPSs(userId: string): Promise<IPSConfiguration[]> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.mockIPSs.filter(ips => ips.user_id === userId);
  }

  async getActiveIPSs(userId: string): Promise<IPSConfiguration[]> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.mockIPSs.filter(ips => ips.user_id === userId && ips.is_active);
  }

  async getInactiveIPSs(userId: string): Promise<IPSConfiguration[]> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.mockIPSs.filter(ips => ips.user_id === userId && !ips.is_active);
  }

  async activateIPS(ipsId: string): Promise<IPSConfiguration | null> {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    if (ips) {
      ips.is_active = true;
      ips.last_modified = new Date().toISOString().split('T')[0];
    }
    return ips || null;
  }

  async deactivateIPS(ipsId: string): Promise<IPSConfiguration | null> {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    if (ips) {
      ips.is_active = false;
      ips.last_modified = new Date().toISOString().split('T')[0];
    }
    return ips || null;
  }

  async duplicateIPS(ipsId: string, newName: string): Promise<IPSConfiguration | null> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const originalIPS = this.mockIPSs.find(i => i.id === ipsId);
    if (!originalIPS) return null;

    const duplicatedIPS: IPSConfiguration = {
      ...originalIPS,
      id: 'ips-' + Date.now(),
      name: newName,
      is_active: false, // New duplicates start as inactive
      created_at: new Date().toISOString(),
      last_modified: new Date().toISOString().split('T')[0]
    };

    this.mockIPSs.push(duplicatedIPS);
    return duplicatedIPS;
  }

  async deleteIPS(ipsId: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const index = this.mockIPSs.findIndex(i => i.id === ipsId);
    if (index > -1) {
      this.mockIPSs.splice(index, 1);
      return true;
    }
    return false;
  }

  // **UPDATED EXISTING METHODS**

  async getActiveIPS(userId: string): Promise<IPSConfiguration | null> {
    // Return the first active IPS (for backward compatibility)
    await new Promise(resolve => setTimeout(resolve, 500));
    const activeIPSs = this.mockIPSs.filter(ips => ips.user_id === userId && ips.is_active);
    return activeIPSs.length > 0 ? activeIPSs[0] : null;
  }

  async getIPSById(ipsId: string): Promise<IPSConfiguration | null> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return this.mockIPSs.find(ips => ips.id === ipsId) || null;
  }

  async createIPS(userId: string, ipsData: any): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newIPS: IPSConfiguration = {
      id: 'ips-' + Date.now(),
      user_id: userId,
      name: ipsData.name,
      description: ipsData.description,
      is_active: true, // New IPSs start as active
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

  async updateIPS(ipsId: string, ipsData: any): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    if (!ips) throw new Error('IPS not found');

    ips.name = ipsData.name;
    ips.description = ipsData.description;
    ips.last_modified = new Date().toISOString().split('T')[0];
    
    if (ipsData.criteria) {
      ips.criteria = { ...ips.criteria, ...ipsData.criteria };
    }
    
    return ips;
  }

  // **EXISTING METHODS (unchanged)**

  async getFactorDefinitions(filters: any = {}) {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    let filtered = this.mockFactorDefinitions;
    
    if (filters.type) {
      filtered = filtered.filter(f => f.type === filters.type);
    }
    
    // Group by type and category
    const grouped = filtered.reduce((acc: any, factor) => {
      if (!acc[factor.type]) acc[factor.type] = {};
      if (!acc[factor.type][factor.category]) acc[factor.type][factor.category] = [];
      acc[factor.type][factor.category].push(factor);
      return acc;
    }, {});

    return { raw: filtered, grouped };
  }

  async getIPSFactorConfigurations(ipsId: string) {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Return empty array for now - in real app, this would return saved configurations
    return [];
  }

  async saveFactorConfigurations(ipsId: string, factorConfigs: any[]) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Update mock IPS stats
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    if (ips) {
      ips.total_factors = factorConfigs.length;
      ips.active_factors = factorConfigs.filter(c => c.enabled).length;
      ips.total_weight = factorConfigs
        .filter(c => c.enabled)
        .reduce((sum, c) => sum + c.weight, 0);
      ips.avg_weight = (ips.active_factors ?? 0) > 0 
        ? (ips.total_weight ?? 0) / (ips.active_factors ?? 1)
        : 0;
      ips.last_modified = new Date().toISOString().split('T')[0];
    }
    
    return factorConfigs;
  }

  async createScoringSession(ipsId: string, userId: string, sessionName?: string) {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return {
      id: 'session-' + Date.now(),
      ips_id: ipsId,
      user_id: userId,
      session_name: sessionName || 'Trading Session'
    };
  }

  async saveTradeScore(sessionId: string, ipsId: string, scoreResults: any) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      tradeScore: {
        id: 'trade-score-' + Date.now(),
        session_id: sessionId,
        ips_id: ipsId,
        ...scoreResults
      },
      factorScores: []
    };
  }

  async exportIPSConfiguration(ipsId: string) {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const ips = this.mockIPSs.find(i => i.id === ipsId);
    return {
      ips: ips,
      factors: [],
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
  }
}

export const ipsDataService = new IPSDataService();