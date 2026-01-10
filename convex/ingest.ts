// convex/ingest.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Fetch the brain event registry rule for a given event type.
 */
async function getBrainRule(ctx: any, eventType: string) {
  return await ctx.db
    .query("brainEventRegistry")
    .withIndex("by_eventType", (q: any) => q.eq("eventType", eventType))
    .first();
}

/**
 * Validate that required media references are present in the modality object.
 * Throws an error if the rule requires a media ref that is not provided.
 */
function ensureMediaRefIfRequired(rule: any, eventType: string, modality: any) {
  const required = rule?.requiresMediaRef;
  if (!required) return;
  if (!modality || !modality[required]) {
    throw new Error(`${eventType} requires modality.${required}`);
  }
}

/**
 * Compute the brainStatus based on the registry rule configuration.
 * Returns "pending" if the event should be queued for brain processing,
 * or undefined if no brain processing is needed.
 */
function computeBrainStatus(rule: any): "pending" | undefined {
  if (!rule) return undefined;                  // if not configured, do nothing
  if (!rule.isEnabled) return undefined;        // disabled = do nothing
  if (rule.defaultBrainStatus === "pending") return "pending";
  return undefined;
}

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Ingest a single event into the system.
 * Consults the brainEventRegistry to determine processing behavior.
 */
export const ingestEvent = mutation({
  args: {
    eventType: v.string(),
    userId: v.string(),
    timestamp: v.optional(v.number()),
    modality: v.optional(
      v.object({
        audioRef: v.optional(v.string()),
        videoRef: v.optional(v.string()),
        imageRef: v.optional(v.string()),
      })
    ),
    payload: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // 1. Get the rule from brainEventRegistry
    const rule = await getBrainRule(ctx, args.eventType);

    // 2. Validate media ref requirements
    ensureMediaRefIfRequired(rule, args.eventType, args.modality);

    // 3. Compute brainStatus based on rule configuration
    const brainStatus = computeBrainStatus(rule);

    // 4. Build the event document
    const now = Date.now();
    const eventDoc: Record<string, any> = {
      eventType: args.eventType,
      userId: args.userId,
      timestamp: args.timestamp ?? now,
      createdAt: now,
      modality: args.modality,
      payload: args.payload,
      metadata: args.metadata,
    };

    // Only set brainStatus if it should be queued for processing
    if (brainStatus) {
      eventDoc.brainStatus = brainStatus;
      eventDoc.brainAttempts = 0;
    }

    // 5. Insert the event
    const eventId = await ctx.db.insert("events", eventDoc);

    return {
      ok: true,
      eventId,
      brainStatus: brainStatus ?? "none",
    };
  },
});

/**
 * Ingest multiple events in a single batch.
 * Each event is processed according to its brainEventRegistry configuration.
 */
export const ingestBatch = mutation({
  args: {
    events: v.array(
      v.object({
        eventType: v.string(),
        userId: v.string(),
        timestamp: v.optional(v.number()),
        modality: v.optional(
          v.object({
            audioRef: v.optional(v.string()),
            videoRef: v.optional(v.string()),
            imageRef: v.optional(v.string()),
          })
        ),
        payload: v.optional(v.any()),
        metadata: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results: Array<{
      ok: boolean;
      eventId?: string;
      brainStatus?: string;
      error?: string;
    }> = [];

    const now = Date.now();

    for (const event of args.events) {
      try {
        // 1. Get the rule from brainEventRegistry
        const rule = await getBrainRule(ctx, event.eventType);

        // 2. Validate media ref requirements
        ensureMediaRefIfRequired(rule, event.eventType, event.modality);

        // 3. Compute brainStatus based on rule configuration
        const brainStatus = computeBrainStatus(rule);

        // 4. Build the event document
        const eventDoc: Record<string, any> = {
          eventType: event.eventType,
          userId: event.userId,
          timestamp: event.timestamp ?? now,
          createdAt: now,
          modality: event.modality,
          payload: event.payload,
          metadata: event.metadata,
        };

        // Only set brainStatus if it should be queued for processing
        if (brainStatus) {
          eventDoc.brainStatus = brainStatus;
          eventDoc.brainAttempts = 0;
        }

        // 5. Insert the event
        const eventId = await ctx.db.insert("events", eventDoc);

        results.push({
          ok: true,
          eventId,
          brainStatus: brainStatus ?? "none",
        });
      } catch (error) {
        results.push({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return {
      ok: failed === 0,
      results,
      totalSucceeded: succeeded,
      totalFailed: failed,
    };
  },
});
