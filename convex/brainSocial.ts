import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getContext = query({
  args: {
    proposerUserId: v.string(),
    inviteeUserId: v.string(),
    durationMinutes: v.number(),
    horizonDays: v.number(),
    title: v.string()
  },
  handler: async (ctx, args) => {
    // 1) Verify explicit social edge exists
    const edge = await ctx.db
      .query("socialEdges")
      .withIndex("by_user_pair", q => q.eq("userId", args.proposerUserId).eq("otherUserId", args.inviteeUserId))
      .unique();

    if (!edge || !edge.isActive) {
      throw new Error("No active social edge");
    }

    // 2) Load share settings for invitee + proposer
    const proposerSettings = await ctx.db
      .query("socialAvailabilitySettings")
      .withIndex("by_userId", q => q.eq("userId", args.proposerUserId))
      .unique();

    const inviteeSettings = await ctx.db
      .query("socialAvailabilitySettings")
      .withIndex("by_userId", q => q.eq("userId", args.inviteeUserId))
      .unique();

    // Policy: if invitee shareMode is "none", no slots
    if (inviteeSettings?.shareMode === "none") {
      return {
        proposerUserId: args.proposerUserId,
        inviteeUserId: args.inviteeUserId,
        durationMinutes: args.durationMinutes,
        title: args.title,
        proposerWindows: [],
        inviteeWindows: [],
        constraints: { proposerTimezone: "UTC", inviteeTimezone: "UTC" }
      };
    }

    // 3) Fetch each user's availability windows from schedule settings
    // TODO: Replace with real calendar/schedule projection
    const proposerWindows: any[] = [];
    const inviteeWindows: any[] = [];

    return {
      proposerUserId: args.proposerUserId,
      inviteeUserId: args.inviteeUserId,
      durationMinutes: args.durationMinutes,
      title: args.title,
      proposerWindows,
      inviteeWindows,
      constraints: {
        proposerTimezone: "America/Los_Angeles",
        inviteeTimezone: "America/Los_Angeles"
      }
    };
  }
});

export const writeMeetingProposal = mutation({
  args: {
    proposerUserId: v.string(),
    inviteeUserId: v.string(),
    proposalId: v.string(),
    title: v.string(),
    durationMinutes: v.number(),
    candidates: v.any(),
    runId: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("meetingProposals", {
      proposerUserId: args.proposerUserId,
      inviteeUserId: args.inviteeUserId,
      proposalId: args.proposalId,
      status: "open",
      title: args.title,
      durationMinutes: args.durationMinutes,
      candidateSlots: Array.isArray(args.candidates) ? args.candidates : [],
      createdAt: Date.now(),
      brainRunId: args.runId
    });
  }
});
