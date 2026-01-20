import type { Env } from "./env";
import { requireDevKey } from "./auth/devKey";
import { fetchRawEventsByTraceId } from "./sources/convex";
import { processOneRawEvent } from "./pipeline/run";
import {
  handleMarketplaceSearch,
  handleSearchResultClick,
  handleGetBusiness,
  handleGetBusinessProofs,
  handleGetRankingExplanation,
} from "./marketplace";
import { routeExchangeRequest } from "./exchange";
import { routeDemoRequest } from "./api/demo";

/**
 * Response structure for the consumeOnce endpoint.
 */
interface ConsumeOnceResponse {
  ok: boolean;
  processed: boolean;
  traceId: string;
  eventId?: string;
  eventType?: string;
  cleaned?: unknown;
  neo4j?: {
    statementCount: number;
    statements: unknown[];
    response: unknown;
  };
  error?: string;
}

/**
 * Handle health check requests.
 */
function handleHealth(): Response {
  return new Response(
    JSON.stringify({
      status: "healthy",
      service: "brain-platform",
      timestamp: Date.now(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Handle the consumeOnce dev endpoint.
 * Fetches events by traceId and processes the first one.
 */
async function handleConsumeOnce(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Verify dev key
    requireDevKey(request, env);

    // Parse request body
    const body = (await request.json()) as {
      traceId?: string;
      dryRun?: boolean;
    };

    if (!body.traceId) {
      return new Response(
        JSON.stringify({
          ok: false,
          processed: false,
          traceId: "",
          error: "Missing traceId in request body",
        } satisfies ConsumeOnceResponse),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { traceId, dryRun = false } = body;

    // Fetch raw events from Convex
    const rawEvents = await fetchRawEventsByTraceId(env, traceId, 1);

    if (rawEvents.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          processed: false,
          traceId,
          error: "No events found for traceId",
        } satisfies ConsumeOnceResponse),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Process the first event
    const rawEvent = rawEvents[0]!;
    const result = await processOneRawEvent(env, rawEvent, dryRun);

    const response: ConsumeOnceResponse = {
      ok: true,
      processed: true,
      traceId,
      eventId: rawEvent.eventId,
      eventType: rawEvent.eventType,
      cleaned: result.cleaned,
      neo4j: {
        statementCount: result.statements.length,
        statements: result.statements,
        response: result.neo4jResponse,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Determine appropriate status code
    let status = 500;
    if (
      message.includes("dev key") ||
      message.includes("x-dev-key") ||
      message.includes("Development mode")
    ) {
      status = 403;
    }

    return new Response(
      JSON.stringify({
        ok: false,
        processed: false,
        traceId: "",
        error: message,
      } satisfies ConsumeOnceResponse),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Main request handler.
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Route: GET /health
    if (method === "GET" && path === "/health") {
      return handleHealth();
    }

    // Route: POST /internal/dev/consumeOnce
    if (method === "POST" && path === "/internal/dev/consumeOnce") {
      return handleConsumeOnce(request, env);
    }

    // ==========================================================================
    // MARKETPLACE ROUTES
    // ==========================================================================

    // Route: POST /api/marketplace/search
    if (method === "POST" && path === "/api/marketplace/search") {
      // TODO: Extract userId from Clerk JWT
      const userId = undefined;
      return handleMarketplaceSearch(request, env, userId);
    }

    // Route: POST /api/marketplace/search/click
    if (method === "POST" && path === "/api/marketplace/search/click") {
      const userId = undefined;
      return handleSearchResultClick(request, env, userId);
    }

    // Route: GET /api/marketplace/business/:businessId
    if (method === "GET" && path.startsWith("/api/marketplace/business/")) {
      const parts = path.split("/");
      const businessId = parts[4]!;

      // Check if this is a proofs sub-route
      if (parts[5] === "proofs") {
        return handleGetBusinessProofs(request, env, businessId);
      }

      return handleGetBusiness(request, env, businessId);
    }

    // Route: GET /api/marketplace/ranking/explain/:traceId
    if (method === "GET" && path.startsWith("/api/marketplace/ranking/explain/")) {
      const traceId = path.split("/")[5]!;
      return handleGetRankingExplanation(request, env, traceId);
    }

    // ==========================================================================
    // EXCHANGE ROUTES (Enhanced Marketplace)
    // ==========================================================================

    // Try Exchange routes
    if (path.startsWith("/api/exchange/")) {
      const exchangeResponse = await routeExchangeRequest(request, env);
      if (exchangeResponse) {
        return exchangeResponse;
      }
    }

    // ==========================================================================
    // DEMO ROUTES (Public, No Authentication Required)
    // ==========================================================================

    // Try Demo routes - no authentication required
    if (path.startsWith("/api/demo/")) {
      const demoResponse = await routeDemoRequest(request, env);
      if (demoResponse) {
        return demoResponse;
      }
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({
        error: "Not found",
        path,
        method,
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
