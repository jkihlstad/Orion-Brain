import type { Env, SchedulerContextRequest, SchedulerContext, ProposalWriteRequest } from "./scheduler/types";

function adminHeaders(env: Env) {
  return {
    "Content-Type": "application/json",
    "X-Admin-Key": env.CONVEX_BRAIN_ADMIN_KEY
  };
}

export async function fetchSchedulerContext(env: Env, req: SchedulerContextRequest): Promise<SchedulerContext> {
  const res = await fetch(`${env.CONVEX_BRAIN_BASE_URL}/brain/scheduler/context`, {
    method: "POST",
    headers: adminHeaders(env),
    body: JSON.stringify(req)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`context fetch failed ${res.status}: ${txt}`);
  }
  return (await res.json()).data as SchedulerContext;
}

export async function writeSchedulerProposals(env: Env, req: ProposalWriteRequest): Promise<void> {
  const res = await fetch(`${env.CONVEX_BRAIN_BASE_URL}/brain/scheduler/writeProposals`, {
    method: "POST",
    headers: adminHeaders(env),
    body: JSON.stringify(req)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`proposal write failed ${res.status}: ${txt}`);
  }
}
