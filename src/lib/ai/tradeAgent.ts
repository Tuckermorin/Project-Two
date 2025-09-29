import { ChatOllama } from "@langchain/ollama";
import type { BaseMessageLike } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";

import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { getMarketDataService } from "@/lib/services/market-data-service";

const DEFAULT_MODEL = (process.env.OLLAMA_MODEL ?? "llama4:maverick").trim();
const DEFAULT_RECURSION_LIMIT = (() => {
  const raw = Number(process.env.TRADE_AGENT_MAX_STEPS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6;
})();
const DEFAULT_TEMPERATURE = (() => {
  const raw = Number(process.env.TRADE_AGENT_TEMPERATURE);
  return Number.isFinite(raw) ? raw : 0.1;
})();

const normalizeBaseUrl = (raw?: string | null): string => {
  const fallback = "http://golem:11434";
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const url = new URL(trimmed);
    if (url.pathname && url.pathname !== "/") {
      url.pathname = "/";
    }
    url.search = "";
    url.hash = "";
    const base = url.origin + (url.pathname === "/" ? "" : url.pathname);
    return base.replace(/\/$/, "");
  } catch (error) {
    return trimmed.replace(/\/api\/chat$/i, "").replace(/\/$/, "") || fallback;
  }
};

const tradeTools = (() => {
  const alpha = getAlphaVantageClient();
  const marketService = getMarketDataService();

  const searchSymbols = tool(
    async ({ query, limit }) => {
      const trimmed = query.trim();
      if (!trimmed) {
        return { error: "Query is required." };
      }
      const matches = await alpha.searchSymbols(trimmed);
      const capped = matches.slice(0, limit ?? 10);
      return { results: capped };
    },
    {
      name: "search_symbols",
      description: "Search ticker symbols by keyword using Alpha Vantage.",
      schema: z.object({
        query: z.string().min(1, "Provide a company name or ticker symbol."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(10)
          .describe("Maximum number of results to return."),
      }),
    }
  );

  const getQuote = tool(
    async ({ symbol }) => {
      const clean = symbol.trim().toUpperCase();
      if (!clean) {
        return { error: "Symbol is required." };
      }
      const quote = await alpha.getQuote(clean);
      const num = (value: unknown) => {
        const cast = Number(value);
        return Number.isFinite(cast) ? cast : null;
      };
      return {
        symbol: quote?.["01. symbol"] ?? clean,
        price: num(quote?.["05. price"] ?? null),
        change: num(quote?.["09. change"] ?? null),
        change_percent: num(String(quote?.["10. change percent"] ?? "0").replace("%", "")),
        volume: num(quote?.["06. volume"] ?? null),
        previous_close: num(quote?.["08. previous close"] ?? null),
        latest_trading_day: quote?.["07. latest trading day"] ?? null,
      };
    },
    {
      name: "get_quote",
      description: "Get the latest daily quote for a symbol via Alpha Vantage.",
      schema: z.object({
        symbol: z.string().min(1, "Ticker symbol is required, e.g. AAPL."),
      }),
    }
  );

  const getApiFactors = tool(
    async ({ symbol, ipsId }) => {
      const clean = symbol.trim().toUpperCase();
      if (!clean) {
        return { error: "Symbol is required." };
      }
      const stock = await marketService.getUnifiedStockData(clean, true);
      return {
        symbol: clean,
        factors: {
          pe_ratio:
            stock.fundamentals?.eps && stock.currentPrice
              ? stock.currentPrice / stock.fundamentals.eps
              : null,
          beta: stock.beta ?? null,
          market_cap: stock.marketCap ?? stock.fundamentals?.marketCap ?? null,
          revenue_growth: stock.fundamentals?.revenueGrowth ?? null,
          roe: stock.fundamentals?.roe ?? null,
          roa: stock.fundamentals?.roa ?? null,
          eps: stock.fundamentals?.eps ?? null,
        },
        context: {
          price: stock.currentPrice,
          change: stock.priceChange,
          change_percent: stock.priceChangePercent,
          volume: stock.volume,
          ips_id: ipsId ?? null,
          market_cap: stock.marketCap ?? null,
        },
        lastUpdated: new Date().toISOString(),
      };
    },
    {
      name: "get_api_factors",
      description: "Fetch cached market and fundamentals snapshot for a symbol.",
      schema: z.object({
        symbol: z.string().min(1, "Ticker symbol is required."),
        ipsId: z.string().optional(),
      }),
    }
  );

  return [searchSymbols, getQuote, getApiFactors];
})();

const agentCache = new Map<string, ReturnType<typeof createReactAgent>>();

const getAgent = (model: string, baseUrl: string, temperature: number) => {
  const cacheKey = `${baseUrl}::${model}::${temperature}`;
  const cached = agentCache.get(cacheKey);
  if (cached) return cached;

  const llm = new ChatOllama({
    baseUrl,
    model,
    temperature,
  });

  const agent = createReactAgent({ llm, tools: tradeTools });
  agentCache.set(cacheKey, agent);
  return agent;
};

export interface TradeAgentInvocation {
  messages: BaseMessageLike[];
  model?: string;
  temperature?: number;
  recursionLimit?: number;
  baseUrl?: string;
}

export interface TradeAgentResult {
  message: AIMessage;
  model: string;
}

export const runTradeAgent = async ({
  messages,
  model,
  temperature,
  recursionLimit,
  baseUrl,
}: TradeAgentInvocation): Promise<TradeAgentResult> => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages array is required for the trade agent.");
  }

  const resolvedModel = model && model.trim() ? model.trim() : DEFAULT_MODEL;
  const resolvedTemperature =
    typeof temperature === "number" && Number.isFinite(temperature)
      ? temperature
      : DEFAULT_TEMPERATURE;
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl ?? process.env.OLLAMA_API_URL ?? process.env.OLLAMA_HOST);
  const agent = getAgent(resolvedModel, resolvedBaseUrl, resolvedTemperature);

  const state = await agent.invoke(
    { messages },
    { recursionLimit: recursionLimit ?? DEFAULT_RECURSION_LIMIT }
  );

  const finalMessage = state.messages[state.messages.length - 1];
  if (!(finalMessage instanceof AIMessage)) {
    throw new Error("Agent did not produce a final AI message.");
  }

  return {
    message: finalMessage,
    model: resolvedModel,
  };
};
