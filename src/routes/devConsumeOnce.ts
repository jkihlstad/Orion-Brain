/**
 * Dev Consume Once Endpoint
 *
 * POST /internal/dev/consumeOnce
 *
 * Development endpoint for processing a single event through the pipeline.
 * Useful for testing and debugging the event transformation flow.
 */

import { requireDevKey } from "../auth/devKey";
import { fetchRawEventsByTraceId } from "../sources/convex";
import { cleanRawEvent } from "../pipeline/clean";
import { generateCypher } from "../pipeline/mapNeo4j";
import { executeCypher } from "../neo4j/client";
import { CleanedEvent } from "../types/cleanedEvent";
import { RawEvent } from "../types/rawEvent";
import type { Env } from "../env";

/**
 * Request body for consumeOnce endpoint
 */
export interface ConsumeOnceRequest {
  /** Trace ID to look up event(s) */
  traceId?: string;
  /** Event type to filter by */
  eventType?: string;
  /** If true, only transform without writing to Neo4j */
  dryRun?: boolean;
}

/**
 * Response from consumeOnce endpoint
 */
export interface ConsumeOnceResponse {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Number of events processed */
  processed: number;
  /** Trace ID of the processed event */
  traceId?: string;
  /** Event ID of the processed event */
  eventId?: string;
  /** Event type of the processed event */
  eventType?: string;
  /** The cleaned event data */
  cleaned?: CleanedEvent;
  /** Neo4j operation details */
  neo4j?: {
    /** Number of Cypher statements executed */
    statementCount: number;
    /** The generated Cypher statements (only in dryRun mode) */
    statements?: string[];
    /** Whether Neo4j write was successful */
    success: boolean;
  };
  /** Error message if operation failed */
  error?: string;
}

/**
 * Generic request/response types for framework compatibility
 */
export interface HttpRequest {
  headers: Record<string, string | undefined> | Headers;
  body: unknown;
}

export interface HttpResponse {
  status: number;
  body: ConsumeOnceResponse;
}

/**
 * Handle the consumeOnce request
 */
export async function handleConsumeOnce(
  request: Request,
  env: Env
): Promise<HttpResponse> {
  // 1. Authenticate via X-Dev-Key
  try {
    requireDevKey(request, env);
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    return {
      status: err.statusCode || 401,
      body: {
        ok: false,
        processed: 0,
        error: err.message,
      },
    };
  }

  // 2. Parse and validate request body
  const body = (await request.json()) as ConsumeOnceRequest;

  if (!body.traceId && !body.eventType) {
    return {
      status: 400,
      body: {
        ok: false,
        processed: 0,
        error: "Either traceId or eventType is required",
      },
    };
  }

  try {
    // 3. Fetch event(s) from Convex
    let events: RawEvent[] = [];

    if (body.traceId) {
      events = await fetchRawEventsByTraceId(env, body.traceId, 1);
    } else if (body.eventType) {
      // eventType-only fetching not implemented - require traceId
      return {
        status: 400,
        body: {
          ok: false,
          processed: 0,
          error: "Fetching by eventType is not yet supported. Please provide a traceId.",
        },
      };
    }

    if (events.length === 0) {
      return {
        status: 404,
        body: {
          ok: false,
          processed: 0,
          error: body.traceId
            ? `No events found for traceId: ${body.traceId}`
            : `No events found for eventType: ${body.eventType}`,
        },
      };
    }

    // 4. Process the first event
    const rawEvent = events[0]!;
    const cleanedEvent = cleanRawEvent(rawEvent);

    // 5. Generate Cypher statements
    const cypherStatements = generateCypher(cleanedEvent);

    // 6. If dryRun, return without writing to Neo4j
    if (body.dryRun) {
      return {
        status: 200,
        body: {
          ok: true,
          processed: 1,
          traceId: cleanedEvent.traceId,
          eventId: cleanedEvent.sourceEventId,
          eventType: cleanedEvent.eventType,
          cleaned: cleanedEvent,
          neo4j: {
            statementCount: cypherStatements.length,
            statements: cypherStatements,
            success: false, // Not executed
          },
        },
      };
    }

    // 7. Execute Cypher statements in Neo4j
    await executeCypher(cypherStatements);

    return {
      status: 200,
      body: {
        ok: true,
        processed: 1,
        traceId: cleanedEvent.traceId,
        eventId: cleanedEvent.sourceEventId,
        eventType: cleanedEvent.eventType,
        cleaned: cleanedEvent,
        neo4j: {
          statementCount: cypherStatements.length,
          success: true,
        },
      },
    };
  } catch (error) {
    const err = error as Error;
    console.error("ConsumeOnce error:", err);

    return {
      status: 500,
      body: {
        ok: false,
        processed: 0,
        error: err.message,
      },
    };
  }
}

/**
 * Fetch-style handler for edge runtimes
 */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const response = await handleConsumeOnce(request, env);

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
