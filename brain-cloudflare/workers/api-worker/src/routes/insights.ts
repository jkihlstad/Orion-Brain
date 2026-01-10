import type { ApiWorkerEnv } from "../../../../shared/env";
import type { InsightRequest } from "../../../../shared/types";
import { readJson, json } from "../../../../shared/utils/json";

export async function handleInsights(req: Request, _env: ApiWorkerEnv, clerkUserId: string) {
  const body = await readJson<InsightRequest>(req);

  return json({
    user: clerkUserId,
    focus: body.focus ?? "daily_summary",
    insight: "TODO: retrieve top events from LanceDB and summarize via OpenRouter",
    citations: []
  });
}
