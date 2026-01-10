// convex/httpActions/brainLease.ts
import { httpAction } from "../_generated/server";
import { requireBrainKey, readJson, json } from "./_auth";

export const brainLeaseSpeakerLabelEvents = httpAction(async (ctx, req) => {
  const unauthorized = requireBrainKey(req);
  if (unauthorized) return unauthorized;

  const body = await readJson<{ workerId: string; limit?: number }>(req);
  const workerId = body.workerId;
  const limit = Math.min(body.limit ?? 25, 100);

  if (!workerId) return json({ error: "Missing workerId" }, 400);

  const leased = await ctx.runMutation("brainQueue:leaseSpeakerLabelEvents", {
    workerId,
    limit,
  });

  return json(leased);
});
