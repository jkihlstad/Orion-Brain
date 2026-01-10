import type { Env, TaskItem, EnrichedTaskItem } from "./scheduler/types";

type ORMessage = { role: "system" | "user" | "assistant"; content: string };

export async function openRouterEnrichTasks(env: Env, tasks: TaskItem[]): Promise<EnrichedTaskItem[]> {
  if (tasks.length === 0) return [];

  const toEnrich = tasks.slice(0, 50);

  const system = `You are a scheduling assistant.
Return JSON only: an array of tasks with fields:
id, estMinutes (integer), priority (1-5), deadlineFlex ("hard"|"soft"), splittable (boolean), reason (string).
Be conservative. Prefer 25/50/90 minute estimates.`;

  const user = `Enrich these tasks:\n${JSON.stringify(toEnrich, null, 2)}`;

  const messages: ORMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user }
  ];

  const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages,
      temperature: 0.2
    })
  });

  if (!res.ok) {
    return tasks.map(t => ({
      ...t,
      estMinutes: t.estMinutes ?? 30,
      priority: t.priority ?? 3,
      deadlineFlex: t.deadlineFlex ?? "soft",
      splittable: t.splittable ?? true,
      reason: "Fallback defaults (OpenRouter unavailable)."
    }));
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter: missing content");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return tasks.map(t => ({
      ...t,
      estMinutes: t.estMinutes ?? 30,
      priority: t.priority ?? 3,
      deadlineFlex: t.deadlineFlex ?? "soft",
      splittable: t.splittable ?? true,
      reason: "Fallback defaults (bad JSON)."
    }));
  }

  const byId = new Map<string, any>(parsed.map((x: any) => [String(x.id), x]));
  return tasks.map(t => {
    const e = byId.get(t.id);
    return {
      ...t,
      estMinutes: e?.estMinutes ?? (t.estMinutes ?? 30),
      priority: e?.priority ?? (t.priority ?? 3),
      deadlineFlex: e?.deadlineFlex ?? (t.deadlineFlex ?? "soft"),
      splittable: e?.splittable ?? (t.splittable ?? true),
      reason: e?.reason ?? "No reason provided."
    };
  });
}
