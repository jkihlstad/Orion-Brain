import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getContext = query({
  args: { userId: v.string(), horizonDays: v.number() },
  handler: async (ctx, { userId, horizonDays }) => {
    const settingsRow = await ctx.db
      .query("scheduleSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const scheduleSettings = settingsRow?.settings ?? null;

    const locks = await ctx.db
      .query("scheduleLocks")
      .withIndex("by_userId_active", (q) => q.eq("userId", userId).eq("isActive", true))
      .collect();

    // TODO: replace with your real calendar snapshot events projection
    const calendarEvents: any[] = [];

    // TODO: replace with your tasks materialized view
    const tasks: any[] = [];

    return {
      userId,
      timezone: "America/Los_Angeles",
      horizonDays,
      scheduleSettings: scheduleSettings ?? {
        version: 1,
        windows: [],
        meetingBufferMinutes: 10,
        minFocusBlockMinutes: 30,
        allowTaskSplitting: true,
        allowRescheduleMeetings: false,
        calendarsIncluded: [],
        reoptimizeOnNewMeeting: true,
        reoptimizeOnTaskChange: true
      },
      locks,
      calendarEvents,
      existingTimeBlocks: calendarEvents.filter((e: any) => e.kind === "block"),
      tasks
    };
  },
});

export const writeProposals = mutation({
  args: {
    userId: v.string(),
    runId: v.string(),
    proposals: v.any()
  },
  handler: async (ctx, { userId, runId, proposals }) => {
    const now = Date.now();

    for (const p of proposals as any[]) {
      const proposalId = String(p.proposalId);

      const existing = await ctx.db
        .query("calendarProposals")
        .withIndex("by_userId_proposalId", (q) => q.eq("userId", userId).eq("proposalId", proposalId))
        .unique();

      const row = {
        userId,
        proposalId,
        status: "open",
        generatedAt: Number(p.generatedAt ?? now),
        action: String(p.action),
        title: String(p.title),
        startAt: Number(p.startAt),
        endAt: Number(p.endAt),
        notes: p.notes ? String(p.notes) : undefined,
        reason: String(p.reason ?? "Scheduled by Brain."),
        confidence: Number(p.confidence ?? 0.7),
        blockId: p.blockId ? String(p.blockId) : undefined,
        ekEventId: p.ekEventId ? String(p.ekEventId) : undefined,
        sourceEventIds: Array.isArray(p.sourceEventIds) ? p.sourceEventIds.map(String) : [],
        brainRunId: runId
      };

      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("calendarProposals", row);
    }
  }
});
