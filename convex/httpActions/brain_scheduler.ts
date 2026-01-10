import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";

function requireAdmin(req: Request): boolean {
  const key = req.headers.get("X-Admin-Key");
  if (!key) return false;
  return key === process.env.CONVEX_BRAIN_ADMIN_KEY;
}

export const schedulerContext = httpAction(async (ctx, req) => {
  if (!requireAdmin(req)) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const userId = String(body.userId);
  const horizonDays = Number(body.horizonDays ?? 7);

  const data = await ctx.runQuery(api.brainScheduler.getContext, { userId, horizonDays });
  return Response.json({ data });
});

export const writeProposals = httpAction(async (ctx, req) => {
  if (!requireAdmin(req)) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const userId = String(body.userId);
  const runId = String(body.runId);
  const proposals = Array.isArray(body.proposals) ? body.proposals : [];

  await ctx.runMutation(api.brainScheduler.writeProposals, { userId, runId, proposals });
  return Response.json({ ok: true });
});
