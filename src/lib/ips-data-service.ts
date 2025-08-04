/**
 * IPS Data Access Layer - Clean Version
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
    { id: 'quant-capex', name: 'CapEx', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },
    { id: 'quant-free-cash-flow', name: 'Free Cash Flow', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },
    { id: 'quant-fcf-yield', name: 'FCF Yield', type: 'quantitative', category: 'Cash Flow', data_type: 'percentage', unit: '%' },
    { id: 'quant-cash-conversion', name: 'Cash Conversion', type: 'quantitative', category: 'Cash Flow', data_type: 'percentage', unit: '%' },
    { id: 'quant-financing-cash-flows', name: 'Financing Cash Flows', type: 'quantitative', category: 'Cash Flow', data_type: 'numeric', unit: '$' },

    // Quantitative Factors - Valuation
    { id: 'quant-pe-ratio', name: 'P/E Ratio', type: 'quantitative', category: 'Valuation', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-peg-ratio', name: 'PEG Ratio', type: 'quantitative', category: 'Valuation', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-evebitda', name: 'EV/EBITDA', type: 'quantitative', category: 'Valuation', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-evsales', name: 'EV/Sales', type: 'quantitative', category: 'Valuation', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-pb-ratio', name: 'P/B Ratio', type: 'quantitative', category: 'Valuation', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-pfcf', name: 'P/FCF', type: 'quantitative', category: 'Valuation', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-dividend-yield', name: 'Dividend Yield', type: 'quantitative', category: 'Valuation', data_type: 'percentage', unit: '%' },
    { id: 'quant-payout-ratio', name: 'Payout Ratio', type: 'quantitative', category: 'Valuation', data_type: 'percentage', unit: '%' },

    // Quantitative Factors - Profitability
    { id: 'quant-roe', name: 'ROE', type: 'quantitative', category: 'Profitability', data_type: 'percentage', unit: '%' },
    { id: 'quant-roa', name: 'ROA', type: 'quantitative', category: 'Profitability', data_type: 'percentage', unit: '%' },
    { id: 'quant-roic', name: 'ROIC', type: 'quantitative', category: 'Profitability', data_type: 'percentage', unit: '%' },

    // Quantitative Factors - Efficiency
    { id: 'quant-asset-turnover', name: 'Asset Turnover', type: 'quantitative', category: 'Efficiency', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-inventory-turnover', name: 'Inventory Turnover', type: 'quantitative', category: 'Efficiency', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-receivables-turnover', name: 'Receivables Turnover', type: 'quantitative', category: 'Efficiency', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-dso', name: 'DSO', type: 'quantitative', category: 'Efficiency', data_type: 'numeric', unit: 'days' },
    { id: 'quant-dio', name: 'DIO', type: 'quantitative', category: 'Efficiency', data_type: 'numeric', unit: 'days' },

    // Quantitative Factors - Leverage & Liquidity
    { id: 'quant-debt-to-equity', name: 'Debt-to-Equity', type: 'quantitative', category: 'Leverage & Liquidity', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-interest-coverage', name: 'Interest Coverage', type: 'quantitative', category: 'Leverage & Liquidity', data_type: 'ratio', unit: 'ratio' },
    { id: 'quant-altman-z-score', name: 'Altman Z-score', type: 'quantitative', category: 'Leverage & Liquidity', data_type: 'numeric', unit: 'score' },

    // Quantitative Factors - Growth
    { id: 'quant-revenue-cagr', name: 'Revenue CAGR', type: 'quantitative', category: 'Growth', data_type: 'percentage', unit: '%' },
    { id: 'quant-ebitda-cagr', name: 'EBITDA CAGR', type: 'quantitative', category: 'Growth', data_type: 'percentage', unit: '%' },
    { id: 'quant-eps-cagr', name: 'EPS CAGR', type: 'quantitative', category: 'Growth', data_type: 'percentage', unit: '%' },
    { id: 'quant-fcf-cagr', name: 'FCF CAGR', type: 'quantitative', category: 'Growth', data_type: 'percentage', unit: '%' },
    { id: 'quant-analyst-forecasts', name: 'Analyst Forecasts', type: 'quantitative', category: 'Growth', data_type: 'percentage', unit: '%' },

    // Quantitative Factors - Market & Trading
    { id: 'quant-market-cap', name: 'Market Cap', type: 'quantitative', category: 'Market & Trading', data_type: 'numeric', unit: '$' },
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
    { id: 'qual-industry-trends', name: 'Industry Trends', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-cyclicality', name: 'Cyclicality', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-diversification', name: 'Diversification', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-recurring-revenue', name: 'Recurring Revenue', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-secular-trends', name: 'Secular Trends', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-supply-chain-resilience', name: 'Supply Chain Resilience', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },
    { id: 'qual-pricing-power', name: 'Pricing Power', type: 'qualitative', category: 'Business Model & Industry', data_type: 'rating', unit: '1-5' },

    // Qualitative Factors - Product & Innovation
    { id: 'qual-product-pipeline', name: 'Product Pipeline', type: 'qualitative', category: 'Product & Innovation', data_type: 'rating', unit: '1-5' },
    { id: 'qual-patents-ip', name: 'Patents/IP', type: 'qualitative', category: 'Product & Innovation', data_type: 'rating', unit: '1-5' },
    { id: 'qual-customer-feedback', name: 'Customer Feedback', type: 'qualitative', category: 'Product & Innovation', data_type: 'rating', unit: '1-5' },
    { id: 'qual-differentiation', name: 'Differentiation', type: 'qualitative', category: 'Product & Innovation', data_type: 'rating', unit: '1-5' },
    { id: 'qual-innovation-speed', name: 'Innovation Speed', type: 'qualitative', category: 'Product & Innovation', data_type: 'rating', unit: '1-5' },

    // Qualitative Factors - ESG & Intangibles
    { id: 'qual-environmental-impact', name: 'Environmental Impact', type: 'qualitative', category: 'ESG & Intangibles', data_type: 'rating', unit: '1-5' },
    { id: 'qual-social-reputation', name: 'Social Reputation', type: 'qualitative', category: 'ESG & Intangibles', data_type: 'rating', unit: '1-5' },
    { id: 'qual-governance-quality', name: 'Governance Quality', type: 'qualitative', category: 'ESG & Intangibles', data_type: 'rating', unit: '1-5' },
    { id: 'qual-litigation-risk', name: 'Litigation Risk', type: 'qualitative', category: 'ESG & Intangibles', data_type: 'rating', unit: '1-5' },
    { id: 'qual-brand-strength', name: 'Brand Strength', type: 'qualitative', category: 'ESG & Intangibles', data_type: 'rating', unit: '1-5' },
    { id: 'qual-media-reputation', name: 'Media Reputation', type: 'qualitative', category: 'ESG & Intangibles', data_type: 'rating', unit: '1-5' },

    // Qualitative Factors - Macro & External
    { id: 'qual-regulatory-risk', name: 'Regulatory Risk', type: 'qualitative', category: 'Macro & External', data_type: 'rating', unit: '1-5' },
    { id: 'qual-interest-rate-sensitivity', name: 'Interest Rate Sensitivity', type: 'qualitative', category: 'Macro & External', data_type: 'rating', unit: '1-5' },
    { id: 'qual-fx-exposure', name: 'FX Exposure', type: 'qualitative', category: 'Macro & External', data_type: 'rating', unit: '1-5' },
    { id: 'qual-supply-chain-dependency', name: 'Supply Chain Dependency', type: 'qualitative', category: 'Macro & External', data_type: 'rating', unit: '1-5' },
    { id: 'qual-commodity-exposure', name: 'Commodity Exposure', type: 'qualitative', category: 'Macro & External', data_type: 'rating', unit: '1-5' },

    // Options Factors - Options Metrics
    { id: 'opt-implied-volatility-iv', name: 'Implied Volatility (IV)', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' },
    { id: 'opt-historical-volatility', name: 'Historical Volatility', type: 'options', category: 'Options Metrics', data_type: 'percentage', unit: '%' },
    { id: 'opt-delta', name: 'Delta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
    { id: 'opt-theta', name: 'Theta', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
    { id: 'opt-gamma', name: 'Gamma', type: 'options', category: 'Options Metrics', data_type: 'numeric', unit: 'decimal' },
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

  private mockIPS: IPSConfiguration | null = null;

  async getActiveIPS(userId: string): Promise<IPSConfiguration | null> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.mockIPS;
  }

  async createIPS(userId: string, ipsData: any): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.mockIPS = {
      id: 'ips-' + Date.now(),
      user_id: userId,
      name: ipsData.name,
      description: ipsData.description,
      is_active: true,
      total_factors: 0,
      active_factors: 0,
      total_weight: 0,
      avg_weight: 0,
      created_at: new Date().toISOString()
    };
    
    return this.mockIPS;
  }

  async updateIPS(ipsId: string, ipsData: any): Promise<IPSConfiguration> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (this.mockIPS) {
      this.mockIPS.name = ipsData.name;
      this.mockIPS.description = ipsData.description;
    }
    
    return this.mockIPS!;
  }

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
    if (this.mockIPS) {
      this.mockIPS.total_factors = factorConfigs.length;
      this.mockIPS.active_factors = factorConfigs.filter(c => c.enabled).length;
      this.mockIPS.total_weight = factorConfigs
        .filter(c => c.enabled)
        .reduce((sum, c) => sum + c.weight, 0);
      this.mockIPS.avg_weight = (this.mockIPS.active_factors ?? 0) > 0 
        ? (this.mockIPS.total_weight ?? 0) / (this.mockIPS.active_factors ?? 1)
        : 0;
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
    
    return {
      ips: this.mockIPS,
      factors: [],
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
  }
}

export const ipsDataService = new IPSDataService();