/**
 * Ops Endpoint for Brain Platform
 * Window 112 Implementation
 *
 * Provides ops endpoints for service health and brain event status checks.
 * Protected by X-Ops-Key header authentication.
 *
 * @version 112.0.0
 */

import { Router, Request, Response, NextFunction } from "express";

const router = Router();

// =============================================================================
// TYPES
// =============================================================================

interface BrainEventStatus {
  status: "pending" | "leased" | "done" | "failed" | "unknown";
  attempts: number;
  lastError: string | null;
  completedAt: number | null;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Middleware to check ops key authentication.
 * Requires X-Ops-Key header to match BRAIN_OPS_KEY environment variable.
 */
function requireOpsKey(req: Request, res: Response, next: NextFunction): void {
  const opsKey = req.headers["x-ops-key"];
  const expectedKey = process.env.BRAIN_OPS_KEY;

  if (!expectedKey || opsKey !== expectedKey) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

// =============================================================================
// OPS STATUS ENDPOINT
// =============================================================================

/**
 * GET /ops/status?eventId=...
 *
 * Returns the brain processing status for a given event ID.
 * Queries the brain event status store to retrieve:
 * - Processing status (pending, leased, done, failed)
 * - Number of processing attempts
 * - Last error message if any
 * - Completion timestamp if done
 */
router.get("/status", requireOpsKey, async (req: Request, res: Response): Promise<void> => {
  const { eventId } = req.query;

  if (!eventId || typeof eventId !== "string") {
    res.status(400).json({ ok: false, error: "missing eventId" });
    return;
  }

  try {
    // Query brain event status from storage
    const status = await getBrainEventStatus(eventId);

    res.json({
      ok: true,
      eventId,
      status: status?.status ?? "unknown",
      attempts: status?.attempts ?? 0,
      lastError: status?.lastError ?? null,
      completedAt: status?.completedAt ?? null,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Ops] Error fetching brain event status:", error);
    res.status(500).json({ ok: false, error: errorMessage });
  }
});

// =============================================================================
// STORAGE FUNCTIONS
// =============================================================================

/**
 * Gets the brain event status for a given event ID.
 *
 * TODO: Implement based on actual brain event storage (Convex, local DB, etc.)
 * This placeholder should be replaced with actual storage queries once
 * the brain event tracking system is implemented.
 *
 * @param eventId - The event ID to look up
 * @returns Brain event status or null if not found
 */
async function getBrainEventStatus(_eventId: string): Promise<BrainEventStatus | null> {
  void _eventId; // Will be used when storage implementation is complete
  // TODO: Query your actual brain event status storage
  // Example implementations:
  //
  // 1. Query Convex:
  // const convexClient = getConvexClient();
  // const event = await convexClient.query(api.events.getByEventId, { eventId });
  // return event ? {
  //   status: event.brainStatus as BrainEventStatus['status'],
  //   attempts: event.brainAttempts,
  //   lastError: event.brainError ?? null,
  //   completedAt: event.brainCompletedAt ?? null,
  // } : null;
  //
  // 2. Query local database:
  // const result = await db.query('SELECT * FROM brain_events WHERE event_id = $1', [eventId]);
  // return result.rows[0] ?? null;
  //
  // For now, return null to indicate event not found
  return null;
}

export default router;
