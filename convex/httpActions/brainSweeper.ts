// convex/httpActions/brainSweeper.ts
import { httpAction } from "../_generated/server";
import { requireBrainKey, readJson, json } from "./_auth";

export const brainListPendingEvents = httpAction(async (ctx, req) => {
  const unauthorized = requireBrainKey(req);
  if (unauthorized) return unauthorized;

  const body = await readJson<{ limit?: number; dryRun?: boolean }>(req);
  const limit = Math.min(body.limit ?? 100, 500);
  const dryRun = body.dryRun === true;

  // Uses your existing indexed query (fast)
  const pending = await ctx.runQuery("brainQueue:listPendingSpeakerLabels", { limit });

  // Return compact jobs to enqueue
  const jobs = pending.map((e: any) => ({
    eventId: e._id,
    userId: e.userId,
    eventType: e.eventType,
    sourceApp: e.sourceApp,
  }));

  return json({ jobs, dryRun });
});
