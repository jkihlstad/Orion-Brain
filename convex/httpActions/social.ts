import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";

export const listMeetingInvites = httpAction(async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401 });
  const userId = identity.subject;

  const data = await ctx.runQuery(api.social.listInvites, { userId });
  return Response.json({ data });
});

export const respondToInvite = httpAction(async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401 });
  const userId = identity.subject;

  const body = await req.json();
  if (!body?.proposalId || !body?.decision) return new Response("Bad Request", { status: 400 });

  await ctx.runMutation(api.social.respondInvite, {
    userId,
    proposalId: String(body.proposalId),
    decision: String(body.decision),
    selectedStartAt: body.selectedStartAt ? Number(body.selectedStartAt) : undefined,
    selectedEndAt: body.selectedEndAt ? Number(body.selectedEndAt) : undefined
  });

  return Response.json({ ok: true });
});

export const listSentProposals = httpAction(async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401 });
  const userId = identity.subject;

  const data = await ctx.runQuery(api.social.listSentProposals, { userId });
  return Response.json({ data });
});

export const updateAvailabilitySettings = httpAction(async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401 });
  const userId = identity.subject;

  const body = await req.json();

  await ctx.runMutation(api.social.updateAvailabilitySettings, {
    userId,
    shareMode: String(body.shareMode ?? "none"),
    shareTitles: Boolean(body.shareTitles),
    shareNotes: Boolean(body.shareNotes),
    minShareHour: Number(body.minShareHour ?? 9),
    maxShareHour: Number(body.maxShareHour ?? 17),
    shareWeekends: Boolean(body.shareWeekends),
    allowlistUserIds: Array.isArray(body.allowlistUserIds) ? body.allowlistUserIds.map(String) : []
  });

  return Response.json({ ok: true });
});
