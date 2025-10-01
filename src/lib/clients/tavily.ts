import { http } from "./http";

const API = "https://api.tavily.com/search";
const key = process.env.TAVILY_API_KEY!;

export async function tavilySearch(
  query: string,
  opts?: { time_range?: string; max_results?: number }
) {
  try {
    const r = await http(API, {
      method: "POST",
      body: {
        api_key: key,
        query,
        include_answer: false,
        max_results: opts?.max_results ?? 5,
        time_range: opts?.time_range ?? "week",
      },
    });

    const results = ((r as any)?.results ?? []).map((x: any) => ({
      title: x.title,
      url: x.url,
      snippet: x.snippet,
      publishedAt: x.published_date,
    }));

    return { query, results };
  } catch (error) {
    console.error("Tavily search error:", error);
    return { query, results: [] };
  }
}
