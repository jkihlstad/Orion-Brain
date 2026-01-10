import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const STATUSES = ["pending", "leased", "done", "failed"] as const;

export const counts = query({
  args: {},
  handler: async (ctx) => {
    // Simple scan for MVP. If you need huge scale later, maintain counters table.
    const events = await ctx.db.query("events").take(5000);

    const out: Record<string, number> = {};
    for (const s of STATUSES) out[s] = 0;
    out["unknown"] = 0;

    for (const e of events) {
      const s = (e as any).brainStatus;
      if (s && out[s] !== undefined) out[s] += 1;
      else out["unknown"] += 1;
    }

    return out;
  },
});

export const listFailed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 500);

    const failed = await ctx.db
      .query("events")
      .withIndex("by_brainStatus_ingestedAt", (q) => q.eq("brainStatus", "failed"))
      .order("desc")
      .take(limit);

    return failed.map((e: any) => ({
      _id: e._id,
      userId: e.userId,
      sourceApp: e.sourceApp,
      eventType: e.eventType,
      timestamp: e.timestamp,
      ingestedAt: e.ingestedAt,
      brainAttempts: e.brainAttempts ?? 0,
      brainError: e.brainError ?? null,
      idempotencyKey: e.idempotencyKey ?? null,
    }));
  },
});

/**
 * Requeue a single failed event
 */
export const requeueOne = mutation({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const ev = await ctx.db.get(args.eventId as any);
    if (!ev) throw new Error("Event not found");

    await ctx.db.patch(ev._id, {
      brainStatus: "pending",
      brainLeaseWorkerId: undefined,
      brainLeaseExpiresAt: undefined,
      brainError: undefined,
    });

    return { ok: true };
  },
});

/**
 * Requeue many failed events (latest first)
 */
export const requeueFailedBatch = mutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 250);
    const failed = await ctx.db
      .query("events")
      .withIndex("by_brainStatus_ingestedAt", (q) => q.eq("brainStatus", "failed"))
      .order("desc")
      .take(limit);

    for (const ev of failed) {
      await ctx.db.patch(ev._id, {
        brainStatus: "pending",
        brainLeaseWorkerId: undefined,
        brainLeaseExpiresAt: undefined,
        brainError: undefined,
      });
    }

    return { ok: true, requeued: failed.length };
  },
});

/**
 * Expire old leases: reclaim stuck leased jobs back to pending
 */
export const expireLeases = mutation({
  args: { olderThanMs: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const olderThanMs = Math.min(args.olderThanMs ?? 0, 7 * 24 * 60 * 60 * 1000); // cap 7d
    const limit = Math.min(args.limit ?? 100, 500);

    const leased = await ctx.db
      .query("events")
      .withIndex("by_brainStatus_ingestedAt", (q) => q.eq("brainStatus", "leased"))
      .take(limit * 3);

    const expired = leased.filter((e: any) => {
      const exp = e.brainLeaseExpiresAt ?? 0;
      if (exp === 0) return true;
      if (exp < now) return true;
      if (olderThanMs > 0 && (now - exp) > olderThanMs) return true;
      return false;
    }).slice(0, limit);

    for (const ev of expired) {
      await ctx.db.patch(ev._id, {
        brainStatus: "pending",
        brainLeaseWorkerId: undefined,
        brainLeaseExpiresAt: undefined,
      });
    }

    return { ok: true, expired: expired.length };
  },
});
