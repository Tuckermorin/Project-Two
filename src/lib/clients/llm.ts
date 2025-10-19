import { ChatOllama } from "@langchain/ollama";

const DEFAULT_MODEL = "gpt-oss:20b";
const DEFAULT_TEMPERATURE = 0.2;

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

const ollamaBaseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST);

const llm = new ChatOllama({
  model: DEFAULT_MODEL,
  temperature: DEFAULT_TEMPERATURE,
  baseUrl: ollamaBaseUrl,
  numCtx: 32768,
});

export async function rationaleLLM(prompt: string) {
  try {
    const messages = [
      {
        role: "system" as const,
        content: "You are an expert options trading analyst and mentor. Write in a conversational, insightful tone like you're explaining to a fellow trader. Focus on WHY trades work, not just WHAT the numbers are. Highlight pros and cons clearly. Use phrases like 'What I like here...', 'The risk to watch...', 'This setup shines because...'. Be specific with numbers and actionable insights. Output ONLY valid JSON in the exact format requested - no markdown formatting, no code blocks, no preamble.",
      },
      { role: "user" as const, content: prompt },
    ];

    const response = await llm.invoke(messages);
    return response.content?.toString().trim() ?? "Analysis unavailable";
  } catch (error) {
    console.error("LLM rationale error:", error);
    return "Analysis unavailable";
  }
}
