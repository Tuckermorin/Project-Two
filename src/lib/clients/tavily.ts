import { http } from "./http";

const API = "https://api.tavily.com/search";
const key = process.env.TAVILY_API_KEY!;

export async function tavilySearch(
  query: string,
  opts?: { time_range?: string; max_results?: number }
) {
  // Check if API key is configured
  if (!key || key === "undefined" || key === "null" || !key.trim()) {
    console.error("[Tavily] TAVILY_API_KEY is not configured");
    return {
      query,
      results: [],
      error: "TAVILY_API_KEY not configured"
    };
  }

  console.log(`[Tavily] Searching for: "${query}" (time_range: ${opts?.time_range ?? "week"}, max_results: ${opts?.max_results ?? 5})`);

  try {
    const requestBody = {
      api_key: key,
      query,
      include_answer: false,
      max_results: opts?.max_results ?? 5,
      time_range: opts?.time_range ?? "week",
    };

    console.log(`[Tavily] Request body:`, { ...requestBody, api_key: "[REDACTED]" });

    const r = await http(API, {
      method: "POST",
      body: requestBody,
    });

    console.log(`[Tavily] Response:`, r);

    if ((r as any)?.error) {
      console.error(`[Tavily] API returned error:`, (r as any).error);
      return {
        query,
        results: [],
        error: (r as any).error
      };
    }

    const results = ((r as any)?.results ?? []).map((x: any) => ({
      title: x.title,
      url: x.url,
      snippet: x.snippet,
      publishedAt: x.published_date,
    }));

    console.log(`[Tavily] Found ${results.length} results for "${query}"`);

    if (results.length > 0) {
      console.log(`[Tavily] Sample result:`, results[0]);
    }

    return { query, results };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Tavily] Search error for "${query}":`, errorMessage);
    console.error(`[Tavily] Full error:`, error);

    return {
      query,
      results: [],
      error: errorMessage
    };
  }
}
