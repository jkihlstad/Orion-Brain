import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Read one registry entry
 */
export const get = query({
  args: { eventType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brainEventRegistry")
      .withIndex("by_eventType", (q) => q.eq("eventType", args.eventType))
      .first();
  },
});

/**
 * List enabled entries (useful for dashboards / ops)
 */
export const listEnabled = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 200, 1000);
    return await ctx.db
      .query("brainEventRegistry")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .take(limit);
  },
});

/**
 * List ALL registry rows (enabled + disabled)
 * Used by Admin dashboard.
 */
export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 500, 2000);

    const rows = await ctx.db
      .query("brainEventRegistry")
      .take(limit);

    // stable ordering by eventType
    rows.sort((a: any, b: any) => String(a.eventType).localeCompare(String(b.eventType)));
    return rows;
  },
});

/**
 * ADMIN: Upsert an entry
 */
export const upsert = mutation({
  args: {
    eventType: v.string(),
    isEnabled: v.boolean(),
    requiresMediaRef: v.optional(
      v.union(v.literal("audioRef"), v.literal("videoRef"), v.literal("imageRef"))
    ),
    defaultBrainStatus: v.union(v.literal("pending"), v.literal("none")),
    maxAttempts: v.optional(v.number()),
    leaseMs: v.optional(v.number()),
    cooldownMs: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("brainEventRegistry")
      .withIndex("by_eventType", (q) => q.eq("eventType", args.eventType))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isEnabled: args.isEnabled,
        requiresMediaRef: args.requiresMediaRef,
        defaultBrainStatus: args.defaultBrainStatus,
        maxAttempts: args.maxAttempts,
        leaseMs: args.leaseMs,
        cooldownMs: args.cooldownMs,
        notes: args.notes,
        updatedAt: now,
      });
      return { ok: true, id: existing._id, created: false };
    }

    const id = await ctx.db.insert("brainEventRegistry", {
      eventType: args.eventType,
      isEnabled: args.isEnabled,
      requiresMediaRef: args.requiresMediaRef,
      defaultBrainStatus: args.defaultBrainStatus,
      maxAttempts: args.maxAttempts,
      leaseMs: args.leaseMs,
      cooldownMs: args.cooldownMs,
      notes: args.notes,
      updatedAt: now,
    });

    return { ok: true, id, created: true };
  },
});

/**
 * ADMIN: Seed defaults (safe to run repeatedly).
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const defaults = [
      {
        eventType: "audio_recorded",
        isEnabled: true,
        requiresMediaRef: "audioRef" as const,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 5,
        leaseMs: 90_000,
        notes: "Transcribe + segment + embed + cluster + prompt for labeling",
      },
      {
        eventType: "speaker_cluster_labeled",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 5,
        leaseMs: 90_000,
        notes: "Backfill LanceDB + update Neo4j + mark cluster labeled",
      },
      // Social scheduling signals (System #6)
      {
        eventType: "social.availability.settings.updated",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 3,
        leaseMs: 60_000,
        notes: "User updated their availability sharing settings",
      },
      {
        eventType: "social.edge.created",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 3,
        leaseMs: 60_000,
        notes: "Explicit social link created (friend/team/partner)",
      },
      {
        eventType: "social.meeting.requested",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 5,
        leaseMs: 120_000,
        notes: "Cross-user meeting proposal initiated",
      },
      {
        eventType: "social.meeting.responded",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 5,
        leaseMs: 90_000,
        notes: "Meeting proposal accepted/declined - triggers schedule update",
      },
      // Suite-wide scheduling triggers (Motion-like behavior)
      {
        eventType: "calendar.event.created",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 3,
        leaseMs: 60_000,
        notes: "New calendar event - triggers re-optimization",
      },
      {
        eventType: "calendar.event.updated",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 3,
        leaseMs: 60_000,
        notes: "Calendar event modified - triggers re-optimization",
      },
      {
        eventType: "tasks.task.created",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 3,
        leaseMs: 60_000,
        notes: "New task created - triggers scheduling",
      },
      {
        eventType: "tasks.task.updated",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 3,
        leaseMs: 60_000,
        notes: "Task updated - triggers re-optimization",
      },
      {
        eventType: "email.triage.task_extracted",
        isEnabled: true,
        defaultBrainStatus: "pending" as const,
        maxAttempts: 3,
        leaseMs: 60_000,
        notes: "Task extracted from email - triggers scheduling",
      },
    ];

    const results: any[] = [];
    for (const d of defaults) {
      const existing = await ctx.db
        .query("brainEventRegistry")
        .withIndex("by_eventType", (q) => q.eq("eventType", d.eventType))
        .first();

      if (existing) {
        results.push({ eventType: d.eventType, ok: true, created: false });
        continue;
      }

      await ctx.db.insert("brainEventRegistry", {
        ...d,
        updatedAt: Date.now(),
      } as any);

      results.push({ eventType: d.eventType, ok: true, created: true });
    }

    return { ok: true, results };
  },
});
