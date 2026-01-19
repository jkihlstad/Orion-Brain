import type { RawEvent } from "../types/rawEvent";
import type {
  CleanedEvent,
  CleanedEntityRef,
  CleanedEdgeRef,
} from "../types/cleanedEvent";

/**
 * Create a User entity reference.
 */
function userRef(clerkUserId: string): CleanedEntityRef {
  return {
    label: "User",
    id: clerkUserId,
    properties: {
      clerkUserId,
    },
  };
}

/**
 * Ensure a value is a string, with optional default.
 */
function ensureString(value: unknown, defaultValue: string = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value);
}

/**
 * Ensure a value is a number, with optional default.
 */
function ensureNumber(value: unknown, defaultValue: number = 0): number {
  if (typeof value === "number" && !isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

/**
 * Create a simple hash string for generating IDs.
 * Uses a basic string hashing algorithm.
 */
function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Clean a finance.transaction_created event.
 */
function cleanFinanceTransaction(
  raw: RawEvent
): Pick<CleanedEvent, "entities" | "edges"> {
  const payload = raw.payload;

  const transactionId = ensureString(
    payload.transactionId,
    `txn_${hashString(raw.eventId)}`
  );
  const amount = ensureNumber(payload.amount);
  const currency = ensureString(payload.currency, "USD");
  const merchant = ensureString(payload.merchant);
  const category = ensureString(payload.category);
  const description = ensureString(payload.description);

  const entities: CleanedEntityRef[] = [
    userRef(raw.clerkUserId),
    {
      label: "Transaction",
      id: transactionId,
      properties: {
        amount,
        currency,
        merchant,
        category,
        description,
        timestampMs: raw.timestampMs,
      },
    },
  ];

  // Add Merchant entity if present
  if (merchant) {
    const merchantId = `merchant_${hashString(merchant)}`;
    entities.push({
      label: "Merchant",
      id: merchantId,
      properties: {
        name: merchant,
      },
    });
  }

  const edges: CleanedEdgeRef[] = [
    {
      type: "MADE_TRANSACTION",
      fromId: raw.clerkUserId,
      fromLabel: "User",
      toId: transactionId,
      toLabel: "Transaction",
      properties: {
        timestampMs: raw.timestampMs,
      },
    },
  ];

  // Add edge to merchant if present
  if (merchant) {
    const merchantId = `merchant_${hashString(merchant)}`;
    edges.push({
      type: "AT_MERCHANT",
      fromId: transactionId,
      fromLabel: "Transaction",
      toId: merchantId,
      toLabel: "Merchant",
      properties: {},
    });
  }

  return { entities, edges };
}

/**
 * Clean a browser.page_viewed event.
 */
function cleanBrowserPageViewed(
  raw: RawEvent
): Pick<CleanedEvent, "entities" | "edges"> {
  const payload = raw.payload;

  const url = ensureString(payload.url);
  const title = ensureString(payload.title);
  const domain = ensureString(payload.domain);
  const durationMs = ensureNumber(payload.durationMs);

  const pageId = `page_${hashString(url || raw.eventId)}`;

  const entities: CleanedEntityRef[] = [
    userRef(raw.clerkUserId),
    {
      label: "Page",
      id: pageId,
      properties: {
        url,
        title,
        domain,
      },
    },
  ];

  // Add Domain entity if present
  if (domain) {
    const domainId = `domain_${hashString(domain)}`;
    entities.push({
      label: "Domain",
      id: domainId,
      properties: {
        name: domain,
      },
    });
  }

  const edges: CleanedEdgeRef[] = [
    {
      type: "VIEWED",
      fromId: raw.clerkUserId,
      fromLabel: "User",
      toId: pageId,
      toLabel: "Page",
      properties: {
        timestampMs: raw.timestampMs,
        durationMs,
      },
    },
  ];

  // Add edge to domain if present
  if (domain) {
    const domainId = `domain_${hashString(domain)}`;
    edges.push({
      type: "ON_DOMAIN",
      fromId: pageId,
      fromLabel: "Page",
      toId: domainId,
      toLabel: "Domain",
      properties: {},
    });
  }

  return { entities, edges };
}

/**
 * Clean a calendar.event_created event.
 */
function cleanCalendarEventCreated(
  raw: RawEvent
): Pick<CleanedEvent, "entities" | "edges"> {
  const payload = raw.payload;

  const calendarEventId = ensureString(
    payload.eventId,
    `cal_${hashString(raw.eventId)}`
  );
  const title = ensureString(payload.title);
  const startTimeMs = ensureNumber(payload.startTimeMs);
  const endTimeMs = ensureNumber(payload.endTimeMs);
  const location = ensureString(payload.location);
  const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];

  const entities: CleanedEntityRef[] = [
    userRef(raw.clerkUserId),
    {
      label: "CalendarEvent",
      id: calendarEventId,
      properties: {
        title,
        startTimeMs,
        endTimeMs,
        location,
        attendeeCount: attendees.length,
      },
    },
  ];

  const edges: CleanedEdgeRef[] = [
    {
      type: "CREATED",
      fromId: raw.clerkUserId,
      fromLabel: "User",
      toId: calendarEventId,
      toLabel: "CalendarEvent",
      properties: {
        timestampMs: raw.timestampMs,
      },
    },
    {
      type: "ORGANIZES",
      fromId: raw.clerkUserId,
      fromLabel: "User",
      toId: calendarEventId,
      toLabel: "CalendarEvent",
      properties: {},
    },
  ];

  // Add Person entities for attendees
  for (const attendee of attendees) {
    const email = ensureString(
      (attendee as Record<string, unknown>).email || attendee
    );
    if (email) {
      const personId = `person_${hashString(email)}`;
      entities.push({
        label: "Person",
        id: personId,
        properties: {
          email,
          name: ensureString((attendee as Record<string, unknown>).name),
        },
      });
      edges.push({
        type: "INVITED_TO",
        fromId: personId,
        fromLabel: "Person",
        toId: calendarEventId,
        toLabel: "CalendarEvent",
        properties: {
          status: ensureString(
            (attendee as Record<string, unknown>).status,
            "pending"
          ),
        },
      });
    }
  }

  return { entities, edges };
}

/**
 * Fallback handler for unknown event types.
 * Creates a generic Event node.
 */
function cleanGenericEvent(
  raw: RawEvent
): Pick<CleanedEvent, "entities" | "edges"> {
  const eventNodeId = `event_${hashString(raw.eventId)}`;

  const entities: CleanedEntityRef[] = [
    userRef(raw.clerkUserId),
    {
      label: "Event",
      id: eventNodeId,
      properties: {
        eventType: raw.eventType,
        sourceApp: raw.sourceApp,
        domain: raw.domain,
        timestampMs: raw.timestampMs,
        payloadJson: JSON.stringify(raw.payload),
      },
    },
  ];

  const edges: CleanedEdgeRef[] = [
    {
      type: "TRIGGERED",
      fromId: raw.clerkUserId,
      fromLabel: "User",
      toId: eventNodeId,
      toLabel: "Event",
      properties: {
        timestampMs: raw.timestampMs,
      },
    },
  ];

  return { entities, edges };
}

/**
 * Clean/normalize a raw event into structured entities and edges.
 *
 * @param rawEvent - The raw event from Convex
 * @returns A cleaned event with extracted entities and relationships
 */
export function cleanRawEvent(rawEvent: RawEvent): CleanedEvent {
  let entitiesAndEdges: Pick<CleanedEvent, "entities" | "edges">;

  switch (rawEvent.eventType) {
    case "finance.transaction_created":
      entitiesAndEdges = cleanFinanceTransaction(rawEvent);
      break;

    case "browser.page_viewed":
      entitiesAndEdges = cleanBrowserPageViewed(rawEvent);
      break;

    case "calendar.event_created":
      entitiesAndEdges = cleanCalendarEventCreated(rawEvent);
      break;

    default:
      entitiesAndEdges = cleanGenericEvent(rawEvent);
  }

  return {
    sourceEventId: rawEvent.eventId,
    traceId: rawEvent.traceId,
    clerkUserId: rawEvent.clerkUserId,
    eventType: rawEvent.eventType,
    timestampMs: rawEvent.timestampMs,
    ...entitiesAndEdges,
  };
}

// Export helper functions for use in other modules
export { userRef, ensureString, ensureNumber, hashString };
