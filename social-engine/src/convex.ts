import type { Env, SocialAvailabilityContext, SlotCandidate } from "./types";

function adminHeaders(env: Env) {
  return { "Content-Type": "application/json", "X-Admin-Key": env.CONVEX_BRAIN_ADMIN_KEY };
}

export async function fetchAvailabilityContext(env: Env, body: any): Promise<SocialAvailabilityContext> {
  const res = await fetch(`${env.CONVEX_BRAIN_BASE_URL}/brain/social/context`, {
    method: "POST",
    headers: adminHeaders(env),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).data;
}

export async function writeMeetingProposal(env: Env, body: {
  proposerUserId: string;
  inviteeUserId: string;
  proposalId: string;
  title: string;
  durationMinutes: number;
  candidates: SlotCandidate[];
  runId: string;
}) {
  const res = await fetch(`${env.CONVEX_BRAIN_BASE_URL}/brain/social/writeMeetingProposal`, {
    method: "POST",
    headers: adminHeaders(env),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}
