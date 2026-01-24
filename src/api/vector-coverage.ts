/**
 * Vector Coverage API
 *
 * Provides endpoints for monitoring and querying vector coverage metrics.
 * Used by dashboard diagnostics and health monitoring.
 *
 * @version 1.0.0
 */

import type { Env } from '../env';
import {
  createVectorizationPipeline,
  type VectorCoverageMetrics,
} from '../vectorize';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Response for coverage metrics endpoint.
 */
export interface CoverageMetricsResponse {
  success: boolean;
  metrics?: VectorCoverageMetrics;
  error?: string;
}

/**
 * Response for vector health check.
 */
export interface VectorHealthResponse {
  success: boolean;
  healthy: boolean;
  checks: {
    storageConnected: boolean;
    embeddingApiAvailable: boolean;
    policyLoaded: boolean;
  };
  error?: string;
}

/**
 * Response for event vectorization status.
 */
export interface EventVectorStatusResponse {
  success: boolean;
  eventId: string;
  isVectorized: boolean;
  embeddingViews?: string[];
  error?: string;
}

/**
 * Response for vector search.
 */
export interface VectorSearchResponse {
  success: boolean;
  results?: Array<{
    eventId: string;
    eventType: string;
    similarity: number;
    textSummary: string;
    keywords: string[];
  }>;
  error?: string;
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Get vector coverage metrics.
 */
export async function handleGetCoverageMetrics(
  env: Env
): Promise<CoverageMetricsResponse> {
  try {
    const pipeline = createVectorizationPipeline(env);
    await pipeline.initialize();

    const metrics = await pipeline.getCoverageMetrics();

    return {
      success: true,
      metrics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VectorCoverageAPI] Failed to get metrics:', error);

    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Check vector system health.
 */
export async function handleVectorHealth(
  env: Env
): Promise<VectorHealthResponse> {
  const checks = {
    storageConnected: false,
    embeddingApiAvailable: false,
    policyLoaded: false,
  };

  try {
    const pipeline = createVectorizationPipeline(env);

    // Check if policy can be loaded
    try {
      await pipeline.initialize();
      checks.policyLoaded = true;
    } catch {
      checks.policyLoaded = false;
    }

    // Check storage connection (in-memory storage always works)
    checks.storageConnected = true;

    // Check embedding API availability
    if (env.OPENROUTER_API_KEY) {
      try {
        const baseUrl = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
        const response = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          },
        });
        checks.embeddingApiAvailable = response.ok;
      } catch {
        checks.embeddingApiAvailable = false;
      }
    }

    const healthy = checks.storageConnected && checks.policyLoaded;

    return {
      success: true,
      healthy,
      checks,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VectorCoverageAPI] Health check failed:', error);

    return {
      success: false,
      healthy: false,
      checks,
      error: message,
    };
  }
}

/**
 * Check if a specific event is vectorized.
 */
export async function handleGetEventVectorStatus(
  env: Env,
  eventId: string
): Promise<EventVectorStatusResponse> {
  try {
    const pipeline = createVectorizationPipeline(env);
    await pipeline.initialize();

    // Access storage directly through pipeline
    const storage = (pipeline as unknown as { storage: { getByEventId: (id: string) => Promise<Array<{ embeddingView: string }>> } }).storage;
    const rows = await storage.getByEventId(eventId);

    return {
      success: true,
      eventId,
      isVectorized: rows.length > 0,
      embeddingViews: rows.map((r) => r.embeddingView),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VectorCoverageAPI] Failed to get event status:', error);

    return {
      success: false,
      eventId,
      isVectorized: false,
      error: message,
    };
  }
}

/**
 * Search for similar events.
 */
export async function handleVectorSearch(
  env: Env,
  query: string,
  filters?: {
    userId?: string;
    eventTypes?: string[];
    domains?: string[];
    privacyScope?: 'private' | 'social' | 'public';
  },
  limit: number = 20
): Promise<VectorSearchResponse> {
  try {
    const pipeline = createVectorizationPipeline(env);
    await pipeline.initialize();

    const results = await pipeline.searchSimilar(query, filters, limit);

    return {
      success: true,
      results,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VectorCoverageAPI] Search failed:', error);

    return {
      success: false,
      error: message,
    };
  }
}

// =============================================================================
// ROUTER
// =============================================================================

/**
 * Route vector coverage API requests.
 */
export async function routeVectorCoverageRequest(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // GET /api/vectors/coverage - Get coverage metrics
    if (path === '/coverage' && request.method === 'GET') {
      const result = await handleGetCoverageMetrics(env);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: corsHeaders,
      });
    }

    // GET /api/vectors/health - Health check
    if (path === '/health' && request.method === 'GET') {
      const result = await handleVectorHealth(env);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: corsHeaders,
      });
    }

    // GET /api/vectors/status/:eventId - Check event vectorization status
    if (path.startsWith('/status/') && request.method === 'GET') {
      const eventId = path.replace('/status/', '');
      const result = await handleGetEventVectorStatus(env, eventId);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: corsHeaders,
      });
    }

    // POST /api/vectors/search - Semantic search
    if (path === '/search' && request.method === 'POST') {
      const body = (await request.json()) as {
        query: string;
        filters?: {
          userId?: string;
          eventTypes?: string[];
          domains?: string[];
          privacyScope?: 'private' | 'social' | 'public';
        };
        limit?: number;
      };

      if (!body.query) {
        return new Response(
          JSON.stringify({ success: false, error: 'query is required' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const result = await handleVectorSearch(
        env,
        body.query,
        body.filters,
        body.limit
      );
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: corsHeaders,
      });
    }

    // Not found
    return new Response(
      JSON.stringify({ success: false, error: 'Endpoint not found' }),
      { status: 404, headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
