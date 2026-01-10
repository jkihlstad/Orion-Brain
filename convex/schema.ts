import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  scheduleSettings: defineTable({
    userId: v.string(),
    settings: v.object({
      version: v.number(),
      windows: v.array(v.object({
        weekday: v.number(),
        startMinutes: v.number(),
        endMinutes: v.number()
      })),
      meetingBufferMinutes: v.number(),
      minFocusBlockMinutes: v.number(),
      maxDailyMeetingMinutes: v.optional(v.union(v.number(), v.null())),
      allowTaskSplitting: v.boolean(),
      allowRescheduleMeetings: v.boolean(),
      calendarsIncluded: v.array(v.string()),
      reoptimizeOnNewMeeting: v.boolean(),
      reoptimizeOnTaskChange: v.boolean()
    }),
    updatedAt: v.number()
  }).index("by_userId", ["userId"]),

  scheduleLocks: defineTable({
    userId: v.string(),
    lockId: v.string(),
    kind: v.string(),
    targetId: v.string(),
    isActive: v.boolean(),
    createdAt: v.number()
  })
    .index("by_userId", ["userId"])
    .index("by_userId_active", ["userId", "isActive"]),

  calendarProposals: defineTable({
    userId: v.string(),
    proposalId: v.string(),
    status: v.string(),
    generatedAt: v.number(),
    action: v.string(),
    title: v.string(),
    startAt: v.number(),
    endAt: v.number(),
    notes: v.optional(v.string()),
    reason: v.string(),
    confidence: v.number(),
    blockId: v.optional(v.string()),
    ekEventId: v.optional(v.string()),
    sourceEventIds: v.array(v.string()),
    brainRunId: v.string()
  })
    .index("by_userId", ["userId"])
    .index("by_userId_proposalId", ["userId", "proposalId"])
    .index("by_userId_status", ["userId", "status"]),

  socialAvailabilitySettings: defineTable({
    userId: v.string(),
    shareMode: v.string(), // "none" | "freeBusy" | "workingHours" | "limited"
    shareTitles: v.boolean(),
    shareNotes: v.boolean(),
    minShareHour: v.number(), // 0..23
    maxShareHour: v.number(), // 0..23
    shareWeekends: v.boolean(),
    allowlistUserIds: v.array(v.string()),
    updatedAt: v.number(),
    sourceEventId: v.optional(v.string())
  }).index("by_userId", ["userId"]),

  socialEdges: defineTable({
    userId: v.string(),
    otherUserId: v.string(),
    kind: v.string(), // "friend" | "team" | "partner"
    createdAt: v.number(),
    isActive: v.boolean()
  })
    .index("by_userId", ["userId"])
    .index("by_user_pair", ["userId", "otherUserId"]),

  meetingProposals: defineTable({
    proposerUserId: v.string(),
    inviteeUserId: v.string(),
    proposalId: v.string(),
    status: v.string(), // "open" | "accepted" | "declined" | "expired" | "cancelled"
    title: v.string(),
    durationMinutes: v.number(),
    candidateSlots: v.array(v.object({
      startAt: v.number(),
      endAt: v.number(),
      score: v.number(),
      reason: v.string()
    })),
    selectedSlot: v.optional(v.object({
      startAt: v.number(),
      endAt: v.number()
    })),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
    brainRunId: v.optional(v.string())
  })
    .index("by_invitee_status", ["inviteeUserId", "status"])
    .index("by_proposer_status", ["proposerUserId", "status"])
    .index("by_proposalId", ["proposalId"])
});
