/**
 * Any OpenAI-compatible chat endpoint. Defaults to Google Gemini's compatibility endpoint, whose free tier
 * (a key from aistudio.google.com) is enough for this prototype. Groq, OpenRouter or OpenAI work by
 * changing AI_BASE_URL and AI_MODEL.
 */
export type AiConfig = { key: string; baseUrl: string; model: string };

export function aiConfig(): AiConfig | null {
  const key = process.env.AI_API_KEY?.trim();
  if (!key) return null;
  return {
    key,
    baseUrl: (process.env.AI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, ""),
    model: process.env.AI_MODEL?.trim() || "gemini-2.5-flash",
  };
}

export class AiError extends Error {}

/** Asks for a JSON object and returns it parsed. */
export async function completeJson(cfg: AiConfig, system: string, user: string): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | { message?: string }[];
  } | null;

  if (!res.ok) {
    const err = Array.isArray(body?.error) ? body?.error[0] : body?.error;
    if (res.status === 429) throw new AiError("The AI provider's free-tier rate limit was hit. Try again in a minute.");
    if (res.status === 401 || res.status === 403) throw new AiError("The AI provider rejected AI_API_KEY.");
    throw new AiError(err?.message || `AI request failed (${res.status})`);
  }

  const text = body?.choices?.[0]?.message?.content ?? "";
  return parseJson(text);
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new AiError("The AI reply was not valid JSON.");
  }
}
