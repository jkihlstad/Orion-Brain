import type { Env, SlotCandidate } from "./types";

export async function rankSlotCandidates(env: Env, input: {
  title: string;
  durationMinutes: number;
  candidates: { startAt: number; endAt: number }[];
}): Promise<SlotCandidate[]> {

  const system = `You rank meeting times. Return JSON only: array of {startAt,endAt,score(0..1),reason}.
Higher score = better slot for focus + minimal disruption. Keep reasons short.`;

  const user = JSON.stringify(input);

  const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2
    }),
  });

  if (!res.ok) {
    return input.candidates.map(c => ({ ...c, score: 0.5, reason: "Fallback ranking." }));
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) return input.candidates.map(c => ({ ...c, score: 0.5, reason: "No model output." }));

  try {
    const arr = JSON.parse(content);
    return Array.isArray(arr) ? arr : input.candidates.map(c => ({ ...c, score: 0.5, reason: "Bad JSON." }));
  } catch {
    return input.candidates.map(c => ({ ...c, score: 0.5, reason: "Parse failed." }));
  }
}
