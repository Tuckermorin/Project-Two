// src/lib/api/tavily.ts
// Tavily API Client for web-based factor collection

interface TavilyConfig {
  apiKey: string;
  baseUrl?: string;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  responseTime: number;
}

interface TavilyExtractResponse {
  url: string;
  rawContent: string;
  content: string;
  success: boolean;
  error?: string;
}

interface NewsSentimentData {
  averageScore: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  totalArticles: number;
  recentHeadlines: string[];
}

interface AnalystData {
  averageRating: number;
  analystCount: number;
  avgPriceTarget: number | null;
  recentUpgrades: number;
  recentDowngrades: number;
}

class TavilyError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'TavilyError';
  }
}

export class TavilyClient {
  private config: TavilyConfig;
  private baseUrl: string;

  constructor(config: TavilyConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.tavily.com';

    if (!config.apiKey) {
      throw new Error('Tavily API key is required');
    }
  }

  private async makeRequest<T>(endpoint: string, body: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...body,
          api_key: this.config.apiKey,
        }),
      });

      if (!response.ok) {
        throw new TavilyError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      const data = await response.json();

      // Check for API error in response
      if (data.error) {
        throw new TavilyError(data.error);
      }

      return data;
    } catch (error) {
      if (error instanceof TavilyError) {
        throw error;
      }
      throw new TavilyError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Search for information using Tavily's search API
   */
  async search(
    query: string,
    options: {
      searchDepth?: 'basic' | 'advanced';
      topic?: 'general' | 'news' | 'finance';
      maxResults?: number;
      includeDomains?: string[];
      excludeDomains?: string[];
    } = {}
  ): Promise<TavilySearchResponse> {
    const response = await this.makeRequest<TavilySearchResponse>('/search', {
      query,
      search_depth: options.searchDepth || 'basic',
      topic: options.topic || 'general',
      max_results: options.maxResults || 5,
      include_domains: options.includeDomains,
      exclude_domains: options.excludeDomains,
    });

    return response;
  }

  /**
   * Extract content from a specific URL
   */
  async extract(url: string): Promise<TavilyExtractResponse> {
    const response = await this.makeRequest<TavilyExtractResponse>('/extract', {
      urls: [url],
    });

    return response;
  }

  /**
   * Get news sentiment for a stock symbol
   */
  async getNewsSentiment(symbol: string, daysBack: number = 7): Promise<NewsSentimentData> {
    const query = `${symbol} stock news sentiment analysis`;
    const searchResults = await this.search(query, {
      topic: 'finance',
      maxResults: 20,
      searchDepth: 'advanced',
    });

    // Analyze sentiment from titles and content
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    const headlines: string[] = [];

    const positiveKeywords = ['surge', 'rally', 'gain', 'rise', 'up', 'bullish', 'strong', 'growth', 'beat', 'upgrade'];
    const negativeKeywords = ['plunge', 'drop', 'fall', 'down', 'bearish', 'weak', 'decline', 'miss', 'downgrade', 'loss'];

    for (const result of searchResults.results) {
      const text = `${result.title} ${result.content}`.toLowerCase();
      headlines.push(result.title);

      const positiveMatches = positiveKeywords.filter(kw => text.includes(kw)).length;
      const negativeMatches = negativeKeywords.filter(kw => text.includes(kw)).length;

      if (positiveMatches > negativeMatches) {
        positiveCount++;
      } else if (negativeMatches > positiveMatches) {
        negativeCount++;
      } else {
        neutralCount++;
      }
    }

    const total = positiveCount + negativeCount + neutralCount || 1;
    const averageScore = ((positiveCount - negativeCount) / total) * 100; // -100 to 100 scale

    return {
      averageScore,
      positiveCount,
      negativeCount,
      neutralCount,
      totalArticles: searchResults.results.length,
      recentHeadlines: headlines.slice(0, 5),
    };
  }

  /**
   * Get analyst ratings and recommendations
   */
  async getAnalystData(symbol: string): Promise<AnalystData> {
    const query = `${symbol} analyst rating recommendation price target`;
    const searchResults = await this.search(query, {
      topic: 'finance',
      maxResults: 10,
      searchDepth: 'advanced',
    });

    let upgradeCount = 0;
    let downgradeCount = 0;
    const priceTargets: number[] = [];
    const ratings: number[] = [];

    // Parse analyst data from search results
    for (const result of searchResults.results) {
      const content = result.content.toLowerCase();

      if (content.includes('upgrade')) upgradeCount++;
      if (content.includes('downgrade')) downgradeCount++;

      // Extract price targets (basic pattern matching)
      const priceTargetMatch = content.match(/price target[:\s]+\$?(\d+)/i);
      if (priceTargetMatch) {
        priceTargets.push(parseFloat(priceTargetMatch[1]));
      }

      // Extract ratings (looking for buy, hold, sell)
      if (content.includes('strong buy') || content.includes('buy rating')) {
        ratings.push(5);
      } else if (content.includes('buy')) {
        ratings.push(4);
      } else if (content.includes('hold')) {
        ratings.push(3);
      } else if (content.includes('sell')) {
        ratings.push(2);
      }
    }

    const averageRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 3;

    const avgPriceTarget = priceTargets.length > 0
      ? priceTargets.reduce((a, b) => a + b, 0) / priceTargets.length
      : null;

    return {
      averageRating,
      analystCount: Math.max(ratings.length, searchResults.results.length),
      avgPriceTarget,
      recentUpgrades: upgradeCount,
      recentDowngrades: downgradeCount,
    };
  }

  /**
   * Get SEC filings count for a symbol
   */
  async getSECFilingsCount(symbol: string, daysBack: number = 90): Promise<number> {
    const query = `${symbol} SEC filing 8-K 10-Q 10-K`;
    const searchResults = await this.search(query, {
      topic: 'finance',
      maxResults: 20,
      includeDomains: ['sec.gov'],
    });

    return searchResults.results.length;
  }

  /**
   * Get insider trading activity
   */
  async getInsiderActivity(symbol: string): Promise<{ netBuying: number; transactionCount: number }> {
    const query = `${symbol} insider trading buying selling activity`;
    const searchResults = await this.search(query, {
      topic: 'finance',
      maxResults: 10,
      searchDepth: 'advanced',
    });

    let buyingCount = 0;
    let sellingCount = 0;

    for (const result of searchResults.results) {
      const content = result.content.toLowerCase();
      if (content.includes('insider buy') || content.includes('director purchase')) {
        buyingCount++;
      }
      if (content.includes('insider sell') || content.includes('director sale')) {
        sellingCount++;
      }
    }

    const totalTransactions = buyingCount + sellingCount;
    const netBuying = totalTransactions > 0 ? ((buyingCount - sellingCount) / totalTransactions) * 100 : 0;

    return {
      netBuying,
      transactionCount: totalTransactions,
    };
  }

  /**
   * Get institutional ownership data
   */
  async getInstitutionalOwnership(symbol: string): Promise<{ ownershipPercent: number | null; topHolders: string[] }> {
    const query = `${symbol} institutional ownership percentage holders`;
    const searchResults = await this.search(query, {
      topic: 'finance',
      maxResults: 5,
      searchDepth: 'advanced',
    });

    const holders: string[] = [];
    let ownershipPercent: number | null = null;

    for (const result of searchResults.results) {
      const content = result.content;

      // Extract ownership percentage
      const ownershipMatch = content.match(/institutional ownership[:\s]+(\d+(?:\.\d+)?)%/i);
      if (ownershipMatch && !ownershipPercent) {
        ownershipPercent = parseFloat(ownershipMatch[1]);
      }

      // Extract holder names (basic pattern - looking for common institutional investors)
      const institutionalKeywords = ['vanguard', 'blackrock', 'fidelity', 'state street', 'capital', 'management'];
      for (const keyword of institutionalKeywords) {
        if (content.toLowerCase().includes(keyword) && !holders.some(h => h.toLowerCase().includes(keyword))) {
          const match = content.match(new RegExp(`([A-Z][a-z]+\\s+)*${keyword}[^.,]*`, 'i'));
          if (match) holders.push(match[0]);
        }
      }
    }

    return {
      ownershipPercent,
      topHolders: holders.slice(0, 5),
    };
  }

  /**
   * Get short interest data
   */
  async getShortInterest(symbol: string): Promise<{ shortInterestPercent: number | null; daysToCovet: number | null }> {
    const query = `${symbol} short interest percentage float days to cover`;
    const searchResults = await this.search(query, {
      topic: 'finance',
      maxResults: 5,
      searchDepth: 'advanced',
    });

    let shortInterestPercent: number | null = null;
    let daysToCover: number | null = null;

    for (const result of searchResults.results) {
      const content = result.content;

      // Extract short interest percentage
      if (!shortInterestPercent) {
        const shortMatch = content.match(/short interest[:\s]+(\d+(?:\.\d+)?)%/i);
        if (shortMatch) {
          shortInterestPercent = parseFloat(shortMatch[1]);
        }
      }

      // Extract days to cover
      if (!daysToCover) {
        const daysMatch = content.match(/days to cover[:\s]+(\d+(?:\.\d+)?)/i);
        if (daysMatch) {
          daysToCover = parseFloat(daysMatch[1]);
        }
      }
    }

    return {
      shortInterestPercent,
      daysToCover,
    };
  }

  /**
   * Get social media sentiment (aggregated from news and social mentions)
   */
  async getSocialSentiment(symbol: string): Promise<{ sentimentScore: number; mentionCount: number }> {
    const query = `${symbol} stock social media sentiment reddit twitter stocktwits`;
    const searchResults = await this.search(query, {
      topic: 'general',
      maxResults: 15,
    });

    const positiveKeywords = ['bullish', 'moon', 'rocket', 'buy', 'long', 'calls', 'strong'];
    const negativeKeywords = ['bearish', 'sell', 'short', 'puts', 'weak', 'dump'];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const result of searchResults.results) {
      const text = `${result.title} ${result.content}`.toLowerCase();

      const positiveMatches = positiveKeywords.filter(kw => text.includes(kw)).length;
      const negativeMatches = negativeKeywords.filter(kw => text.includes(kw)).length;

      positiveCount += positiveMatches;
      negativeCount += negativeMatches;
    }

    const total = positiveCount + negativeCount || 1;
    const sentimentScore = ((positiveCount - negativeCount) / total) * 100;

    return {
      sentimentScore,
      mentionCount: searchResults.results.length,
    };
  }
}

// Singleton instance
let tavilyClient: TavilyClient | null = null;

export const getTavilyClient = (): TavilyClient => {
  if (!tavilyClient) {
    const apiKey = process.env.TAVILY_API_KEY || process.env.NEXT_PUBLIC_TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error('Tavily API key is not configured. Please set TAVILY_API_KEY or NEXT_PUBLIC_TAVILY_API_KEY in your environment.');
    }
    tavilyClient = new TavilyClient({ apiKey });
  }
  return tavilyClient;
};

// Export types
export type {
  TavilySearchResult,
  TavilySearchResponse,
  TavilyExtractResponse,
  NewsSentimentData,
  AnalystData,
};
