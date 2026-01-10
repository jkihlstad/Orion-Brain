import type { ApiWorkerEnv } from "../../../../shared/env";
import type { SearchRequest } from "../../../../shared/types";
import { readJson, json } from "../../../../shared/utils/json";
import { embedText } from "../../../../shared/adapters/openrouter";
import { lancedbSearch } from "../../../../shared/adapters/lancedb";

export async function handleSearch(req: Request, env: ApiWorkerEnv, clerkUserId: string) {
  const body = await readJson<SearchRequest>(req);
  const topK = Math.min(body.topK ?? 20, 100);

  const privacyScope = body.privacyScope ?? "private";

  const vector = await embedText(env, body.query);

  const hits = await lancedbSearch(env, {
    table: "text_events",
    vector,
    topK,
    filters: {
      clerkUserId,
      privacyScope
    }
  });

  return json({
    user: clerkUserId,
    results: hits.map((h) => ({
      eventId: h.eventId,
      score: h.score,
      snippet: h.metadata?.snippet,
      timestamp: h.metadata?.timestamp,
      sourceApp: h.metadata?.sourceApp
    }))
  });
}
