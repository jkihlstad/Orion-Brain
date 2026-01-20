import type { Env } from "../env";
import type { RawEvent } from "../types/rawEvent";

/**
 * Response structure from the Convex rawByTraceId endpoint.
 */
interface ConvexRawEventResponse {
  success: boolean;
  traceId: string;
  event: RawEvent | null;
  requestId?: string;
}

/**
 * Fetch raw events from Convex by trace ID.
 *
 * @param env - Environment bindings with Convex credentials
 * @param traceId - The trace ID to query events for
 * @param limit - Maximum number of events to return (default: 100)
 * @returns Array of raw events matching the trace ID
 */
export async function fetchRawEventsByTraceId(
  env: Env,
  traceId: string,
  limit: number = 100
): Promise<RawEvent[]> {
  const url = `${env.CONVEX_INGEST_BASE_URL}/brain/rawByTraceId`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.CONVEX_GATEWAY_SHARED_SECRET}`,
    },
    body: JSON.stringify({
      traceId,
      limit,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Convex API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as ConvexRawEventResponse;

  // Return event as array for compatibility (rawByTraceId returns single event)
  if (data.event) {
    return [data.event];
  }
  return [];
}
