import type { Env, SocialQueueMessage } from "./types";
import { fetchAvailabilityContext, writeMeetingProposal } from "./convex";
import { findOverlapSlots } from "./overlap";
import { rankSlotCandidates } from "./openrouter";

export default {
  async queue(batch: MessageBatch<SocialQueueMessage>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      ctx.waitUntil(handle(msg.body, env));
    }
  },

  async fetch(req: Request, env: Env) {
    return new Response("social-engine ok");
  }
};

async function handle(m: SocialQueueMessage, env: Env) {
  if (m.type === "SOCIAL_MEETING_SUGGEST") {
    const runId = m.runId ?? crypto.randomUUID();
    const ctxData = await fetchAvailabilityContext(env, {
      proposerUserId: m.proposerUserId,
      inviteeUserId: m.inviteeUserId,
      durationMinutes: m.durationMinutes,
      title: m.title,
      horizonDays: 14
    });

    const overlap = findOverlapSlots(ctxData.proposerWindows, ctxData.inviteeWindows, m.durationMinutes);

    const ranked = await rankSlotCandidates(env, {
      title: m.title,
      durationMinutes: m.durationMinutes,
      candidates: overlap
    });

    const proposalId = crypto.randomUUID();
    await writeMeetingProposal(env, {
      proposerUserId: m.proposerUserId,
      inviteeUserId: m.inviteeUserId,
      proposalId,
      title: m.title,
      durationMinutes: m.durationMinutes,
      candidates: ranked.sort((a,b) => b.score - a.score).slice(0, 8),
      runId
    });
  }

  if (m.type === "SOCIAL_MEETING_FINALIZE") {
    // After invite accepted, enqueue SCHEDULE_REOPTIMIZE for both users
    // This integrates with Batch 3 scheduler
  }
}
