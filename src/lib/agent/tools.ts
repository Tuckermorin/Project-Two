/**
 * LangChain StructuredTool definitions for the AI Agent
 *
 * These tools are used by the LLM to fetch market data, quotes, and fundamentals
 * during the trade analysis process.
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getQuote, getOptionsChain } from "@/lib/clients/alphaVantage";
import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { tavilySearch } from "@/lib/clients/tavily";

/**
 * Tool: Fetch stock quote
 * Retrieves current price and basic quote data for a given symbol
 */
export class GetQuoteTool extends StructuredTool {
  name = "get_quote";
  description = "Fetches the current stock quote including price, volume, and change for a given ticker symbol. Use this when you need to know the current market price of a stock.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
  });

  async _call(input: { symbol: string }): Promise<string> {
    try {
      const quote = await getQuote(input.symbol);
      const globalQuote = quote["Global Quote"] || {};

      return JSON.stringify({
        symbol: globalQuote["01. symbol"] || input.symbol,
        price: globalQuote["05. price"] || "N/A",
        change: globalQuote["09. change"] || "N/A",
        changePercent: globalQuote["10. change percent"] || "N/A",
        volume: globalQuote["06. volume"] || "N/A",
        latestTradingDay: globalQuote["07. latest trading day"] || "N/A",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Fetch company fundamentals
 * Retrieves company overview including PE ratio, beta, market cap, etc.
 */
export class GetCompanyOverviewTool extends StructuredTool {
  name = "get_company_overview";
  description = "Fetches fundamental data about a company including PE ratio, beta, market cap, sector, industry, and financial metrics. Use this when you need to analyze company fundamentals for trade decisions.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
  });

  async _call(input: { symbol: string }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const overview = await avClient.getCompanyOverview(input.symbol);

      return JSON.stringify({
        name: overview.Name || input.symbol,
        sector: overview.Sector || "N/A",
        industry: overview.Industry || "N/A",
        marketCap: overview.MarketCapitalization || "N/A",
        peRatio: overview.PERatio || "N/A",
        beta: overview.Beta || "N/A",
        eps: overview.EPS || "N/A",
        dividendYield: overview.DividendYield || "N/A",
        profitMargin: overview.ProfitMargin || "N/A",
        roe: overview.ReturnOnEquityTTM || "N/A",
        week52High: overview["52WeekHigh"] || "N/A",
        week52Low: overview["52WeekLow"] || "N/A",
        analystTarget: overview.AnalystTargetPrice || "N/A",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Search recent news
 * Uses Tavily API to search for recent news and research about a company or topic
 */
export class SearchNewsTool extends StructuredTool {
  name = "search_news";
  description = "Searches for recent news articles and research about a company or market topic. Use this to understand current market sentiment, recent events, or news that might affect a trade decision.";

  schema = z.object({
    query: z.string().describe("The search query (e.g., 'AAPL earnings', 'Federal Reserve interest rates')"),
    maxResults: z.number().optional().default(5).describe("Maximum number of results to return (default: 5)"),
  });

  async _call(input: { query: string; maxResults?: number }): Promise<string> {
    try {
      const results = await tavilySearch(input.query, {
        time_range: "week",
        max_results: input.maxResults || 5,
      });

      if (results.error) {
        return JSON.stringify({ error: results.error });
      }

      const articles = results.results.map((r: any) => ({
        title: r.title || "No title",
        snippet: r.snippet || "",
        url: r.url || "",
        publishedAt: r.publishedAt || null,
      }));

      return JSON.stringify({ articles, count: articles.length });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get options chain data
 * Retrieves options chain data including strikes, IVs, and greeks
 */
export class GetOptionsChainTool extends StructuredTool {
  name = "get_options_chain";
  description = "Fetches the options chain for a given symbol including strikes, implied volatility, greeks (delta, gamma, theta, vega), and open interest. Use this when analyzing options strategies or volatility.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
  });

  async _call(input: { symbol: string }): Promise<string> {
    try {
      const result = await getOptionsChain(input.symbol);

      // Summarize the data to avoid overwhelming the LLM
      const summary = {
        symbol: input.symbol,
        asof: result.asof,
        totalContracts: result.contracts.length,
        expirations: [...new Set(result.contracts.map((c: any) => c.expiry))].slice(0, 5),
        sampleContracts: result.contracts.slice(0, 10).map((c: any) => ({
          strike: c.strike,
          type: c.option_type,
          expiry: c.expiry,
          iv: c.iv,
          delta: c.delta,
          bid: c.bid,
          ask: c.ask,
        })),
      };

      return JSON.stringify(summary);
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get Income Statement
 * Retrieves quarterly and annual income statement data
 */
export class GetIncomeStatementTool extends StructuredTool {
  name = "get_income_statement";
  description = "Fetches income statement data (revenue, gross profit, operating income, net income) for quarterly and annual periods. Use this to analyze company profitability trends.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
  });

  async _call(input: { symbol: string }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getIncomeStatement(input.symbol);

      const quarterly = data.quarterlyReports?.slice(0, 4).map((r: any) => ({
        date: r.fiscalDateEnding,
        revenue: r.totalRevenue || "N/A",
        grossProfit: r.grossProfit || "N/A",
        operatingIncome: r.operatingIncome || "N/A",
        netIncome: r.netIncome || "N/A",
      }));

      return JSON.stringify({
        symbol: input.symbol,
        quarterly,
        mostRecentQuarter: quarterly?.[0] || null,
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get Balance Sheet
 * Retrieves balance sheet data including assets, liabilities, and equity
 */
export class GetBalanceSheetTool extends StructuredTool {
  name = "get_balance_sheet";
  description = "Fetches balance sheet data (total assets, total liabilities, shareholder equity, current ratio components) for quarterly and annual periods. Use this to analyze financial health and leverage.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
  });

  async _call(input: { symbol: string }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getBalanceSheet(input.symbol);

      const quarterly = data.quarterlyReports?.slice(0, 4).map((r: any) => ({
        date: r.fiscalDateEnding,
        totalAssets: r.totalAssets || "N/A",
        totalLiabilities: r.totalLiabilities || "N/A",
        totalEquity: r.totalShareholderEquity || "N/A",
        currentAssets: r.totalCurrentAssets || "N/A",
        currentLiabilities: r.totalCurrentLiabilities || "N/A",
      }));

      return JSON.stringify({
        symbol: input.symbol,
        quarterly,
        mostRecent: quarterly?.[0] || null,
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get Cash Flow
 * Retrieves cash flow statement data
 */
export class GetCashFlowTool extends StructuredTool {
  name = "get_cash_flow";
  description = "Fetches cash flow statement data (operating cash flow, capital expenditures, free cash flow) for quarterly and annual periods. Use this to analyze cash generation ability.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
  });

  async _call(input: { symbol: string }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getCashFlow(input.symbol);

      const quarterly = data.quarterlyReports?.slice(0, 4).map((r: any) => ({
        date: r.fiscalDateEnding,
        operatingCashFlow: r.operatingCashflow || "N/A",
        capitalExpenditures: r.capitalExpenditures || "N/A",
        freeCashFlow: r.operatingCashflow && r.capitalExpenditures
          ? (parseFloat(r.operatingCashflow) - Math.abs(parseFloat(r.capitalExpenditures))).toString()
          : "N/A",
      }));

      return JSON.stringify({
        symbol: input.symbol,
        quarterly,
        mostRecent: quarterly?.[0] || null,
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get Earnings History
 * Retrieves historical earnings data with estimates and surprises
 */
export class GetEarningsTool extends StructuredTool {
  name = "get_earnings";
  description = "Fetches historical earnings data including reported EPS, estimated EPS, and earnings surprises. Use this to analyze earnings consistency and predict future performance.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
  });

  async _call(input: { symbol: string }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getEarnings(input.symbol);

      const quarterly = data.quarterlyEarnings?.slice(0, 8).map((r: any) => ({
        date: r.fiscalDateEnding,
        reportedDate: r.reportedDate || "N/A",
        reportedEPS: r.reportedEPS || "N/A",
        estimatedEPS: r.estimatedEPS || "N/A",
        surprise: r.surprise || "N/A",
        surprisePercentage: r.surprisePercentage || "N/A",
      }));

      return JSON.stringify({
        symbol: input.symbol,
        quarterlyEarnings: quarterly,
        latestEarnings: quarterly?.[0] || null,
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get News Sentiment
 * Retrieves recent news with sentiment analysis
 */
export class GetNewsSentimentTool extends StructuredTool {
  name = "get_news_sentiment";
  description = "Fetches recent news articles with sentiment scores (positive, negative, neutral) for a given symbol. Use this to gauge market sentiment and potential catalysts.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
    limit: z.number().optional().default(50).describe("Number of articles to retrieve (default: 50)"),
  });

  async _call(input: { symbol: string; limit?: number }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getNewsSentiment(input.symbol, input.limit || 50);

      return JSON.stringify({
        symbol: input.symbol,
        averageSentiment: data.average_score,
        articleCount: data.count,
        positive: data.positive,
        negative: data.negative,
        neutral: data.neutral,
        sentimentLabel:
          data.average_score > 0.15
            ? "Bullish"
            : data.average_score < -0.15
            ? "Bearish"
            : "Neutral",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get RSI (Relative Strength Index)
 * Retrieves RSI technical indicator
 */
export class GetRSITool extends StructuredTool {
  name = "get_rsi";
  description = "Fetches the Relative Strength Index (RSI) indicator. RSI values above 70 suggest overbought conditions, below 30 suggest oversold. Use this to identify potential reversal points.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
    timePeriod: z.number().optional().default(14).describe("RSI time period (default: 14)"),
    interval: z.enum(["daily", "weekly", "monthly"]).optional().default("daily").describe("Time interval"),
  });

  async _call(input: { symbol: string; timePeriod?: number; interval?: "daily" | "weekly" | "monthly" }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getRSI(
        input.symbol,
        input.timePeriod || 14,
        input.interval || "daily",
        "close"
      );

      return JSON.stringify({
        symbol: input.symbol,
        rsi: data.value,
        date: data.date,
        signal:
          data.value && data.value > 70
            ? "Overbought"
            : data.value && data.value < 30
            ? "Oversold"
            : "Neutral",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get MACD
 * Retrieves MACD technical indicator
 */
export class GetMACDTool extends StructuredTool {
  name = "get_macd";
  description = "Fetches the MACD (Moving Average Convergence Divergence) indicator including MACD line, signal line, and histogram. Use this to identify trend changes and momentum.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
    interval: z.enum(["daily", "weekly", "monthly"]).optional().default("daily").describe("Time interval"),
  });

  async _call(input: { symbol: string; interval?: "daily" | "weekly" | "monthly" }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getMACD(input.symbol, input.interval || "daily", "close");

      return JSON.stringify({
        symbol: input.symbol,
        macd: data.macd,
        signal: data.signal,
        histogram: data.histogram,
        date: data.date,
        crossover:
          data.macd && data.signal
            ? data.macd > data.signal
              ? "Bullish"
              : "Bearish"
            : "N/A",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get SMA (Simple Moving Average)
 * Retrieves SMA technical indicator
 */
export class GetSMATool extends StructuredTool {
  name = "get_sma";
  description = "Fetches the Simple Moving Average (SMA) for a given time period. Use this to identify trend direction and support/resistance levels.";

  schema = z.object({
    symbol: z.string().describe("The stock ticker symbol (e.g., AAPL, MSFT)"),
    timePeriod: z.number().optional().default(50).describe("SMA time period (default: 50)"),
    interval: z.enum(["daily", "weekly", "monthly"]).optional().default("daily").describe("Time interval"),
  });

  async _call(input: { symbol: string; timePeriod?: number; interval?: "daily" | "weekly" | "monthly" }): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getSMA(
        input.symbol,
        input.timePeriod || 50,
        input.interval || "daily",
        "close"
      );

      return JSON.stringify({
        symbol: input.symbol,
        sma: data.value,
        period: input.timePeriod || 50,
        date: data.date,
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get CPI (Consumer Price Index)
 * Retrieves inflation data
 */
export class GetCPITool extends StructuredTool {
  name = "get_cpi";
  description = "Fetches the Consumer Price Index (CPI), a key inflation indicator. Use this to understand inflation trends and potential Fed policy impacts on markets.";

  schema = z.object({});

  async _call(input: {}): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getCPI();

      return JSON.stringify({
        indicator: "CPI",
        value: data.value,
        date: data.date,
        description: "Consumer Price Index - Inflation measure",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get Unemployment Rate
 * Retrieves unemployment data
 */
export class GetUnemploymentTool extends StructuredTool {
  name = "get_unemployment";
  description = "Fetches the unemployment rate, a key economic health indicator. Use this to assess economic conditions and potential market impacts.";

  schema = z.object({});

  async _call(input: {}): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getUnemploymentRate();

      return JSON.stringify({
        indicator: "Unemployment Rate",
        value: data.value,
        date: data.date,
        unit: "Percentage",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get Federal Funds Rate
 * Retrieves Fed Funds Rate
 */
export class GetFedFundsRateTool extends StructuredTool {
  name = "get_fed_funds_rate";
  description = "Fetches the Federal Funds Rate, the target interest rate set by the Federal Reserve. Use this to understand monetary policy and its impact on markets.";

  schema = z.object({});

  async _call(input: {}): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getFederalFundsRate();

      return JSON.stringify({
        indicator: "Federal Funds Rate",
        value: data.value,
        date: data.date,
        unit: "Percentage",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Tool: Get Treasury Yield (10-Year)
 * Retrieves 10-year Treasury yield
 */
export class GetTreasuryYieldTool extends StructuredTool {
  name = "get_treasury_yield";
  description = "Fetches the 10-year Treasury yield, a benchmark for risk-free rate and economic expectations. Use this to assess market risk appetite and valuation metrics.";

  schema = z.object({});

  async _call(input: {}): Promise<string> {
    try {
      const avClient = getAlphaVantageClient();
      const data = await avClient.getTreasuryYield10Y();

      return JSON.stringify({
        indicator: "10-Year Treasury Yield",
        value: data.value,
        date: data.date,
        unit: "Percentage",
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Export all tools as an array for easy registration with the LLM
 */
export const agentTools = [
  // Core tools
  new GetQuoteTool(),
  new GetCompanyOverviewTool(),
  new SearchNewsTool(),
  new GetOptionsChainTool(),

  // Fundamental Data tools
  new GetIncomeStatementTool(),
  new GetBalanceSheetTool(),
  new GetCashFlowTool(),
  new GetEarningsTool(),

  // Alpha Intelligence tools
  new GetNewsSentimentTool(),

  // Technical Indicators tools
  new GetRSITool(),
  new GetMACDTool(),
  new GetSMATool(),

  // Macro/Economic tools
  new GetCPITool(),
  new GetUnemploymentTool(),
  new GetFedFundsRateTool(),
  new GetTreasuryYieldTool(),
];

/**
 * Bind tools to a model
 * Example usage:
 *
 * import { ChatOllama } from "@langchain/ollama";
 * import { agentTools } from "./tools";
 *
 * const model = new ChatOllama({ model: "llama3" });
 * const modelWithTools = model.bind({ tools: agentTools });
 */
