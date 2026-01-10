// convex/httpActions/brainPrompts.ts
import { httpAction } from "../_generated/server";
import { requireBrainKey, readJson, json } from "./_auth";

export const brainCreateLabelSpeakerPrompt = httpAction(async (ctx, req) => {
  const unauthorized = requireBrainKey(req);
  if (unauthorized) return unauthorized;

  const body = await readJson<{
    userId: string;            // Convex Id<"users"> as string
    clusterId: string;
    sampleCount: number;
    exampleMediaRefs?: string[];
  }>(req);

  if (!body.userId || !body.clusterId || typeof body.sampleCount !== "number") {
    return json({ error: "Missing/invalid fields" }, 400);
  }

  const idempotencyKey = `label_speaker:${body.userId}:${body.clusterId}`;

  const result = await ctx.runMutation("prompts:createLabelSpeakerPrompt", {
    userId: body.userId,
    payload: {
      clusterId: body.clusterId,
      sampleCount: body.sampleCount,
      exampleMediaRefs: body.exampleMediaRefs,
      suggestedCategories: [
        "friend",
        "family",
        "colleague",
        "boss",
        "partner",
        "romantic",
        "acquaintance",
        "other",
      ],
    },
    idempotencyKey,
    expiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    priority: "high",
  });

  return json(result);
});
