const OLLAMA_URL = process.env.OLLAMA_API_URL?.trim() || "http://golem:11434/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL?.trim() || "llama4:maverick";

export async function generateNarrative(
  input: {
    score: number;
    calibratedProbability: number;
    reasons: string[];
    confidence: "low" | "medium" | "high";
    rubricVersion: string;
    calibrationVersion: string;
    features: Record<string, unknown>;
    seed: number;
  },
): Promise<string> {
  const prompt = `You are a professional options desk risk manager. Write a concise explanation (max 90 words) for a scoring result.\n\nGuidelines:\n- You must acknowledge the raw score ${input.score.toFixed(1)} and success probability ${(input.calibratedProbability * 100).toFixed(0)}%.\n- Provide exactly 3 bullet points referencing the deterministic reasons below.\n- Tone: factual, professional, calm.\n- Do not invent data or alter numbers.\n- Close with a short sentence on next step confidence (${input.confidence}).\n\nDeterministic reasons:\n${input.reasons.map((r, idx) => `${idx + 1}. ${r}`).join("\n")}\n\nNormalized features:\n${JSON.stringify(input.features, null, 2)}\n`;

  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: "You turn structured scoring rationale into concise professional explanations." },
          { role: "user", content: prompt },
        ],
        options: {
          temperature: 0,
          top_p: 1,
          seed: input.seed,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Narrative model error ${res.status}`);
    }
    const json = await res.json();
    const output = json?.message?.content ?? json?.choices?.[0]?.message?.content ?? "";
    if (typeof output === "string" && output.trim()) {
      return output.trim();
    }
  } catch (error) {
    console.error("Narrative generation failed", error);
  }

  // Deterministic fallback
  const bullets = input.reasons.slice(0, 3).map((r) => `• ${r}`).join(" ");
  return `Score ${input.score.toFixed(1)} (p=${(input.calibratedProbability * 100).toFixed(0)}%, confidence ${input.confidence}). ${bullets}.`;
}
