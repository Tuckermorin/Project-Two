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
 * Export all tools as an array for easy registration with the LLM
 */
export const agentTools = [
  new GetQuoteTool(),
  new GetCompanyOverviewTool(),
  new SearchNewsTool(),
  new GetOptionsChainTool(),
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
