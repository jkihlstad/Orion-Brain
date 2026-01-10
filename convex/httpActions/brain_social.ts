import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";

function requireAdmin(req: Request): boolean {
  const key = req.headers.get("X-Admin-Key");
  return key !== null && key === process.env.CONVEX_BRAIN_ADMIN_KEY;
}

export const socialContext = httpAction(async (ctx, req) => {
  if (!requireAdmin(req)) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const data = await ctx.runQuery(api.brainSocial.getContext, {
    proposerUserId: String(body.proposerUserId),
    inviteeUserId: String(body.inviteeUserId),
    durationMinutes: Number(body.durationMinutes),
    horizonDays: Number(body.horizonDays ?? 14),
    title: String(body.title ?? "Meeting")
  });
  return Response.json({ data });
});

export const writeMeetingProposal = httpAction(async (ctx, req) => {
  if (!requireAdmin(req)) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  await ctx.runMutation(api.brainSocial.writeMeetingProposal, {
    proposerUserId: String(body.proposerUserId),
    inviteeUserId: String(body.inviteeUserId),
    proposalId: String(body.proposalId),
    title: String(body.title),
    durationMinutes: Number(body.durationMinutes),
    candidates: body.candidates,
    runId: String(body.runId)
  });
  return Response.json({ ok: true });
});
