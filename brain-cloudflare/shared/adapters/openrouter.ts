import { errorLog } from "../utils/log";

const OR_BASE = "https://openrouter.ai/api/v1";

export type EmbeddingResponse = { embedding: number[] };

export async function embedText(env: { OPENROUTER_API_KEY: string }, input: string) {
  const res = await fetch(`${OR_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input
    })
  });

  if (!res.ok) {
    const t = await res.text();
    errorLog("OpenRouter embed error", res.status, t);
    throw new Error(`OpenRouter embeddings failed: ${res.status}`);
  }

  const data = await res.json() as any;
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("OpenRouter: missing embedding");
  return vec as number[];
}

export async function sentiment(env: { OPENROUTER_API_KEY: string }, text: string) {
  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "Return JSON with fields: polarity (neg|neu|pos), score (0..1), emotions (array)." },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) throw new Error(`OpenRouter sentiment failed: ${res.status}`);
  const data = await res.json() as any;
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}

export async function transcribeAudioViaExternalService(
  _env: { OPENROUTER_API_KEY: string },
  _audioUrl: string
): Promise<{ text: string }> {
  return { text: "" };
}
