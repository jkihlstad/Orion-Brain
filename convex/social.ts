import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listInvites = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("meetingProposals")
      .withIndex("by_invitee_status", (q) => q.eq("inviteeUserId", userId).eq("status", "open"))
      .order("desc")
      .take(50);

    return rows.map(r => ({
      proposalId: r.proposalId,
      proposerUserId: r.proposerUserId,
      title: r.title,
      durationMinutes: r.durationMinutes,
      candidateSlots: r.candidateSlots,
      createdAt: r.createdAt
    }));
  }
});

export const respondInvite = mutation({
  args: {
    userId: v.string(),
    proposalId: v.string(),
    decision: v.string(),
    selectedStartAt: v.optional(v.number()),
    selectedEndAt: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("meetingProposals")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
      .unique();

    if (!row) return;

    if (row.inviteeUserId !== args.userId) {
      throw new Error("Not invitee");
    }

    const now = Date.now();
    const patch: any = {
      status: args.decision === "accepted" ? "accepted" : "declined",
      respondedAt: now
    };

    if (args.decision === "accepted" && args.selectedStartAt && args.selectedEndAt) {
      patch.selectedSlot = { startAt: args.selectedStartAt, endAt: args.selectedEndAt };
    }

    await ctx.db.patch(row._id, patch);
  }
});

export const listSentProposals = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("meetingProposals")
      .withIndex("by_proposer_status", (q) => q.eq("proposerUserId", userId))
      .order("desc")
      .take(50);

    return rows.map(r => ({
      proposalId: r.proposalId,
      inviteeUserId: r.inviteeUserId,
      title: r.title,
      status: r.status,
      durationMinutes: r.durationMinutes,
      selectedSlot: r.selectedSlot,
      createdAt: r.createdAt,
      respondedAt: r.respondedAt
    }));
  }
});

export const updateAvailabilitySettings = mutation({
  args: {
    userId: v.string(),
    shareMode: v.string(),
    shareTitles: v.boolean(),
    shareNotes: v.boolean(),
    minShareHour: v.number(),
    maxShareHour: v.number(),
    shareWeekends: v.boolean(),
    allowlistUserIds: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("socialAvailabilitySettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const row = {
      userId: args.userId,
      shareMode: args.shareMode,
      shareTitles: args.shareTitles,
      shareNotes: args.shareNotes,
      minShareHour: args.minShareHour,
      maxShareHour: args.maxShareHour,
      shareWeekends: args.shareWeekends,
      allowlistUserIds: args.allowlistUserIds,
      updatedAt: Date.now()
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("socialAvailabilitySettings", row);
    }
  }
});

export const createSocialEdge = mutation({
  args: {
    userId: v.string(),
    otherUserId: v.string(),
    kind: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("socialEdges")
      .withIndex("by_user_pair", (q) => q.eq("userId", args.userId).eq("otherUserId", args.otherUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { isActive: true, kind: args.kind });
    } else {
      await ctx.db.insert("socialEdges", {
        userId: args.userId,
        otherUserId: args.otherUserId,
        kind: args.kind,
        createdAt: Date.now(),
        isActive: true
      });
    }
  }
});
