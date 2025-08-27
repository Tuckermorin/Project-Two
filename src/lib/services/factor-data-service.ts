// src/lib/services/factor-data-service.ts

interface FactorValue {
  factorId: string;
  factorName: string;
  value: number | string;
  source: 'api' | 'manual' | 'calculated';
  lastUpdated: Date;
  confidence?: number; // 0-1 scale for API data quality
}

interface APIFactorResponse {
  success: boolean;
  factors: Record<string, FactorValue>;
  apiStatus: 'connected' | 'disconnected' | 'partial';
  timestamp: Date;
  failedFactors?: string[];
}

interface TradeFactorData {
  tradeId: string;
  ipsId: string;
  symbol: string;
  apiFactors: Record<string, FactorValue>;
  manualFactors: Record<string, FactorValue>;
  calculatedFactors: Record<string, FactorValue>;
  completionStatus: {
    apiFactorsComplete: boolean;
    manualFactorsComplete: boolean;
    overallComplete: boolean;
    completionPercentage: number;
  };
}

class FactorDataService {
  private cache = new Map<string, { data: any; timestamp: Date; ttl: number }>();
  private apiRetryCount = 3;
  private apiTimeout = 10000; // 10 seconds

  /**
   * Fetch API factors for a given symbol and IPS configuration
   */
  async fetchAPIFactors(
    symbol: string, 
    ipsId: string
  ): Promise<APIFactorResponse> {
    try {
      console.log(`Fetching API factors for ${symbol} using IPS ${ipsId}`);
      
      // Try to get cached data first
      const cacheKey = `api_factors_${symbol}_${ipsId}`;
      const cached = this.getFromCache<APIFactorResponse>(cacheKey, 5 * 60 * 1000); // 5 minute TTL
      
      if (cached && Date.now() - cached.timestamp.getTime() < (5 * 60 * 1000)) {
        console.log('Using cached API factor data');
        return cached;
      }

      // Use the real API endpoint
      const response = await fetch(`/api/trades/factors?symbol=${symbol}&ipsId=${ipsId}`);
      const data = await response.json();

      if (data.success) {
        const apiResponse: APIFactorResponse = {
          success: true,
          factors: data.data.factors,
          apiStatus: data.data.apiStatus as 'connected' | 'disconnected' | 'partial',
          timestamp: new Date(data.data.timestamp)
        };

        // Cache successful response
        this.setCache(cacheKey, apiResponse, 5 * 60 * 1000); // 5 minute TTL
        return apiResponse;
      } else {
        throw new Error(data.error || 'API request failed');
      }

    } catch (error) {
      console.error('Error fetching API factors:', error);
      return {
        success: false,
        factors: {},
        apiStatus: 'disconnected',
        timestamp: new Date(),
        failedFactors: []
      };
    }
  }

  /**
   * Fetch a single factor from the appropriate API
   */
  // Removed per project scope; use fetchAPIFactors() batching instead

  /**
   * Fetch factor from Alpha Vantage (fundamental data)
   */
  private async fetchAlphaVantageFactor(
    symbol: string, 
    factorName: string
  ): Promise<FactorValue | null> {
    try {
      const response = await fetch(`/api/market-data/fundamental?symbol=${symbol}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Alpha Vantage API error: ${data.message}`);
      }

      const stockData = data.data;
      let value: number | undefined;

      // Map factor names to API response fields
      switch (factorName) {
        case 'P/E Ratio':
          value = stockData.peRatio;
          break;
        case 'Beta':
          value = stockData.beta;
          break;
        case 'Revenue Growth YoY':
          value = stockData.fundamentals?.revenueGrowth;
          break;
        case 'Return on Equity':
          value = stockData.fundamentals?.roe;
          break;
        case 'Debt to Equity':
          value = stockData.fundamentals?.debtToEquity;
          break;
        case 'Dividend Yield':
          value = stockData.fundamentals?.dividendYield;
          break;
        // Add more mappings as needed
        default:
          console.warn(`Unknown Alpha Vantage factor: ${factorName}`);
          return null;
      }

      if (value === undefined || value === null) {
        return null;
      }

      return {
        factorId: this.getFactorId(factorName),
        factorName,
        value,
        source: 'api',
        lastUpdated: new Date(),
        confidence: 0.95 // High confidence for Alpha Vantage data
      };

    } catch (error) {
      console.error(`Alpha Vantage factor fetch failed for ${factorName}:`, error);
      return null;
    }
  }

  /**
   * Fetch factor from Tradier (options/market data)
   */
  // Removed per project scope; options API not integrated

  /**
   * Save manual factor data
   */
  async saveManualFactors(
    tradeId: string,
    manualFactors: Record<string, any>
  ): Promise<boolean> {
    try {
      const factorValues: Record<string, FactorValue> = {};
      
      Object.entries(manualFactors).forEach(([factorName, value]) => {
        factorValues[factorName] = {
          factorId: this.getFactorId(factorName),
          factorName,
          value,
          source: 'manual',
          lastUpdated: new Date()
        };
      });

      // In a real app, this would save to your database
      console.log('Saving manual factors for trade:', tradeId, factorValues);
      
      return true;
    } catch (error) {
      console.error('Error saving manual factors:', error);
      return false;
    }
  }

  /**
   * Get complete factor data for a trade
   */
  async getTradeFactorData(
    tradeId: string,
    symbol: string,
    ipsId: string,        // Add ipsId parameter
    ipsFactors: string[]
  ): Promise<TradeFactorData> {
    // Fetch API factors - now we have the proper ipsId
    const apiResponse = await this.fetchAPIFactors(symbol, ipsId);
    
    // Get manual factors from storage (in real app, from database)
    const manualFactors = await this.getStoredManualFactors(tradeId);
    
    // Calculate completion status
    const apiFactorNames = ipsFactors.filter(f => this.isAPIFactor(f));
    const manualFactorNames = ipsFactors.filter(f => !this.isAPIFactor(f));
    
    const apiFactorsComplete = apiFactorNames.every(name => 
      apiResponse.factors[name] !== undefined
    );
    
    const manualFactorsComplete = manualFactorNames.every(name => 
      manualFactors[name] !== undefined
    );
    
    const totalFactors = ipsFactors.length;
    const completedFactors = Object.keys(apiResponse.factors).length + 
                            Object.keys(manualFactors).length;
    
    return {
      tradeId,
      ipsId, // Now use the actual ipsId parameter
      symbol,
      apiFactors: apiResponse.factors,
      manualFactors,
      calculatedFactors: {}, // Would include calculated factors
      completionStatus: {
        apiFactorsComplete,
        manualFactorsComplete,
        overallComplete: apiFactorsComplete && manualFactorsComplete,
        completionPercentage: (completedFactors / totalFactors) * 100
      }
    };
  }

  /**
   * Handle API fallback - allow manual input for API factors when API is down
   */
  async saveAPIFactorOverride(
    tradeId: string,
    factorName: string,
    value: number | string
  ): Promise<boolean> {
    try {
      const factorValue: FactorValue = {
        factorId: this.getFactorId(factorName),
        factorName,
        value,
        source: 'manual', // Mark as manual override
        lastUpdated: new Date(),
        confidence: 0.7 // Lower confidence for manual overrides
      };

      // In real app, save to database with flag indicating this is an override
      console.log('Saving API factor override:', factorValue);
      
      return true;
    } catch (error) {
      console.error('Error saving API factor override:', error);
      return false;
    }
  }

  /**
   * Calculate IPS score based on all factor values
   */
  async calculateIPSScore(
    ipsId: string,
    factorValues: Record<string, FactorValue>
  ): Promise<number> {
    try {
      // In real app, this would:
      // 1. Fetch IPS configuration and factor weights
      // 2. Apply scoring algorithm
      // 3. Return weighted score
      
      // Simplified scoring for demo
      const scores = Object.values(factorValues).map(factor => {
        if (typeof factor.value === 'number') {
          // Normalize different factor types to 0-100 scale
          return this.normalizeFactorScore(factor.factorName, factor.value);
        }
        return 50; // Default for non-numeric factors
      });

      const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return Math.min(100, Math.max(0, averageScore));
      
    } catch (error) {
      console.error('Error calculating IPS score:', error);
      throw error;
    }
  }

  /**
   * Retry API call with exponential backoff
   */
  private async retryAPICall<T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await Promise.race([
          apiCall(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('API timeout')), this.apiTimeout)
          )
        ]);
      } catch (error) {
        lastError = error as Error;
        console.warn(`API call attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  // Helper methods
  private isAPIFactor(factorName: string): boolean {
    const apiFactorNames = [
      'P/E Ratio', 'Beta', 'Revenue Growth YoY', 'Return on Equity',
      'Debt to Equity', 'Dividend Yield', 'Market Cap', 'Volume',
      'Implied Volatility', 'Delta', 'Theta', 'Vega', 'Gamma'
    ];
    return apiFactorNames.includes(factorName);
  }

  private isAlphaVantageFactor(factorName: string): boolean {
    const alphaVantageFactors = [
      'P/E Ratio', 'Beta', 'Revenue Growth YoY', 'Return on Equity',
      'Debt to Equity', 'Dividend Yield', 'Market Cap', 'Volume'
    ];
    return alphaVantageFactors.includes(factorName);
  }

  // Removed

  private getFactorId(factorName: string): string {
    // Convert factor name to ID format
    return factorName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  private normalizeFactorScore(factorName: string, value: number): number {
    // Simplified normalization - in real app would use factor-specific logic
    switch (factorName) {
      case 'P/E Ratio':
        // Lower P/E generally better, normalize around 15-25 range
        return Math.max(0, Math.min(100, 100 - ((value - 15) * 2)));
      case 'Beta':
        // Beta around 1.0 is neutral, adjust based on strategy preference
        return Math.max(0, Math.min(100, 100 - Math.abs(value - 1.0) * 50));
      case 'Revenue Growth YoY':
        // Higher growth is better
        return Math.max(0, Math.min(100, value * 5 + 50));
      case 'Return on Equity':
        // Higher ROE is better
        return Math.max(0, Math.min(100, value * 4));
      default:
        // Default normalization
        return Math.max(0, Math.min(100, value));
    }
  }

  private async getStoredManualFactors(tradeId: string): Promise<Record<string, FactorValue>> {
    // In real app, fetch from database
    // For demo, return empty object
    return {};
  }

  // Cache management
  private getFromCache<T>(key: string, ttl: number): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp.getTime() > ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: new Date(),
      ttl
    });
  }
}

// Singleton instance
let factorDataService: FactorDataService;

export function getFactorDataService(): FactorDataService {
  if (!factorDataService) {
    factorDataService = new FactorDataService();
  }
  return factorDataService;
}

export type { FactorValue, APIFactorResponse, TradeFactorData };
