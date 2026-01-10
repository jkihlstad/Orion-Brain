import { fetchSchedulerContext, writeSchedulerProposals } from "./convex";
import { openRouterEnrichTasks } from "./openrouter";
import { buildAvailabilityWindows } from "./scheduler/windows";
import { scheduleGreedy } from "./scheduler/greedy";
import type { Env, QueueMessage, SchedulerContext, ProposalWriteRequest } from "./scheduler/types";

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      ctx.waitUntil(handleMessage(msg.body, env));
    }
  },

  // Optional: health endpoint
  async fetch(req: Request, env: Env) {
    return new Response("ok");
  }
};

async function handleMessage(body: QueueMessage, env: Env) {
  if (body.type !== "SCHEDULE_REOPTIMIZE") return;

  // 1) Fetch consolidated context from Convex
  const context: SchedulerContext = await fetchSchedulerContext(env, {
    userId: body.userId,
    horizonDays: body.horizonDays ?? 7
  });

  // 2) Use OpenRouter to enrich tasks (duration/priority/splittable)
  const enrichedTasks = await openRouterEnrichTasks(env, context.tasks);

  // 3) Build availability windows from user schedule settings
  const windows = buildAvailabilityWindows({
    nowMs: Date.now(),
    horizonDays: context.horizonDays,
    timezone: context.timezone,
    settings: context.scheduleSettings,
    existingEvents: context.calendarEvents,
    locks: context.locks
  });

  // 4) Deterministic scheduling → propose time blocks
  const proposals = scheduleGreedy({
    windows,
    tasks: enrichedTasks,
    existingBlocks: context.existingTimeBlocks,
    meetingBufferMinutes: context.scheduleSettings.meetingBufferMinutes,
    allowTaskSplitting: context.scheduleSettings.allowTaskSplitting
  });

  // 5) Write proposals back to Convex for Calendar app inbox
  const writeReq: ProposalWriteRequest = {
    userId: body.userId,
    runId: body.runId ?? crypto.randomUUID(),
    proposals
  };

  await writeSchedulerProposals(env, writeReq);
}
