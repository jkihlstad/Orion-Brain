/**
 * Raw event structure as received from Convex.
 * This represents the unprocessed event data before cleaning/normalization.
 */
export interface RawEvent {
  /** Unique identifier for this event */
  eventId: string;

  /** Trace ID for correlating related events across systems */
  traceId: string;

  /** Clerk user ID of the event owner */
  clerkUserId: string;

  /** Type of event (e.g., "finance.transaction_created") */
  eventType: string;

  /** Source application that generated the event */
  sourceApp: string;

  /** Domain/category of the event */
  domain: string;

  /** Unix timestamp in milliseconds when the event occurred */
  timestampMs: number;

  /** Unix timestamp in milliseconds when the event was received */
  receivedAtMs: number;

  /** Privacy scope for the event data */
  privacyScope: string;

  /** Version of consent under which this data was collected */
  consentVersion: string;

  /** Event-specific payload data */
  payload: Record<string, unknown>;

  /** References to associated blob storage objects */
  blobRefs: string[];
}
