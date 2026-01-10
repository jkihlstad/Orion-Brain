// convex/httpActions/brainAck.ts
import { httpAction } from "../_generated/server";
import { requireBrainKey, readJson, json } from "./_auth";

export const brainAckDone = httpAction(async (ctx, req) => {
  const unauthorized = requireBrainKey(req);
  if (unauthorized) return unauthorized;

  const body = await readJson<{ eventId: string; workerId: string }>(req);
  if (!body.eventId || !body.workerId) return json({ error: "Missing fields" }, 400);

  const result = await ctx.runMutation("brainQueue:ackBrainEventDone", {
    eventId: body.eventId,
    workerId: body.workerId,
  });

  return json(result);
});

export const brainAckFailed = httpAction(async (ctx, req) => {
  const unauthorized = requireBrainKey(req);
  if (unauthorized) return unauthorized;

  const body = await readJson<{
    eventId: string;
    workerId: string;
    error: string;
    retry?: boolean;
  }>(req);

  if (!body.eventId || !body.workerId || !body.error) return json({ error: "Missing fields" }, 400);

  const result = await ctx.runMutation("brainQueue:ackBrainEventFailed", {
    eventId: body.eventId,
    workerId: body.workerId,
    error: body.error,
    retry: body.retry ?? false,
  });

  return json(result);
});
