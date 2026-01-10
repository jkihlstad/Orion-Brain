/**
 * Neural Intelligence Platform - API Server
 *
 * Express-based API server providing endpoints for:
 * - Internal job triggers (Convex webhooks)
 * - Dashboard search and insights
 * - Speaker cluster labeling
 * - Health checks
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';

// Middleware
import { clerkAuth, getUserId, AuthContext } from '../middleware/clerkAuth';
import { serverAuth, apiKeyAuth, ServerAuthContext } from '../middleware/serverAuth';

// API handlers
import {
  semanticSearch,
  multimodalSearch,
  SearchResult,
  MultimodalSearchResult,
} from './search';
import {
  generateInsights,
  InsightsRequest,
  InsightsResponse,
} from './insights';

// iOS Edge App API routes
import { createiOSIngestRouter } from './ios-ingest';
import { createEmbeddingsRouter } from './embeddings';
import { createGraphRouter } from './graph';

// LangGraph workflow
import { processEvent, processEvents, deadLetterQueue } from '../langgraph/graph';

import type { EventType, SearchFilters } from '../types/common';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extended request with both auth types
 */
interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  serverAuth?: ServerAuthContext;
  requestId: string;
}

/**
 * API Error response
 */
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

/**
 * Job creation response
 */
interface JobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  eventIds: string[];
  createdAt: number;
}

/**
 * Health check response
 */
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latencyMs?: number;
    error?: string;
  }>;
  timestamp: number;
}

/**
 * Cluster label request
 */
interface ClusterLabelRequest {
  clusterId: string;
  contactId: string;
}

/**
 * Cluster label response
 */
interface ClusterLabelResponse {
  success: boolean;
  clusterId: string;
  contactId: string;
  backfillJobId?: string;
  affectedEventCount: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ServerConfig {
  port: number;
  version: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  version: process.env.APP_VERSION || '1.0.0',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  rateLimitWindowMs: 60 * 1000, // 1 minute
  rateLimitMaxRequests: 100,
};

// Track server start time for uptime
const serverStartTime = Date.now();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Request ID middleware - adds unique ID to each request
 */
function requestIdMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
}

/**
 * Request logging middleware
 */
function loggingMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.auth?.userId || req.serverAuth?.service || 'anonymous';

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
        userId,
      })
    );
  });

  next();
}

/**
 * Error handling middleware
 */
function errorHandler(
  err: Error,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  console.error(`[Error] ${req.requestId}:`, err);

  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : err.message,
      requestId: req.requestId,
    },
  };

  res.status(500).json(response);
}

/**
 * Not found handler
 */
function notFoundHandler(req: AuthenticatedRequest, res: Response): void {
  const response: ApiErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      requestId: req.requestId,
    },
  };

  res.status(404).json(response);
}

/**
 * Simple in-memory rate limiter
 * In production, use Redis-backed rate limiting
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimiter(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const key = req.auth?.userId || req.ip || 'anonymous';
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + config.rateLimitWindowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  res.setHeader('X-RateLimit-Limit', config.rateLimitMaxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimitMaxRequests - entry.count));
  res.setHeader('X-RateLimit-Reset', entry.resetAt);

  if (entry.count > config.rateLimitMaxRequests) {
    const response: ApiErrorResponse = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        requestId: req.requestId,
      },
    };
    res.status(429).json(response);
    return;
  }

  next();
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * POST /v1/brain/jobs/events
 * Internal trigger for event processing (from Convex webhook or poller)
 */
async function handleJobsEvents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { eventIds } = req.body as { eventIds: string[] };

    if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'eventIds must be a non-empty array',
          requestId: req.requestId,
        },
      });
      return;
    }

    // Validate event IDs (basic validation)
    if (eventIds.some((id) => typeof id !== 'string' || id.length === 0)) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'All eventIds must be non-empty strings',
          requestId: req.requestId,
        },
      });
      return;
    }

    // Create job ID
    const jobId = uuidv4();

    // Queue events for processing (async)
    // In production, this would be a proper job queue
    setImmediate(async () => {
      try {
        await processEvents(eventIds);
        console.log(`[Jobs] Job ${jobId} completed for ${eventIds.length} events`);
      } catch (error) {
        console.error(`[Jobs] Job ${jobId} failed:`, error);
      }
    });

    const response: JobResponse = {
      jobId,
      status: 'queued',
      eventIds,
      createdAt: Date.now(),
    };

    res.status(202).json(response);
  } catch (error) {
    console.error('[Jobs] Error handling events:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to queue events for processing',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * POST /v1/brain/search
 * Dashboard semantic search
 */
async function handleSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const { query, filters, limit } = req.body as {
      query: string;
      filters?: SearchFilters;
      limit?: number;
    };

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'query is required and must be a string',
          requestId: req.requestId,
        },
      });
      return;
    }

    const startTime = Date.now();
    const results = await semanticSearch(userId, query, filters || {}, limit || 20);
    const latencyMs = Date.now() - startTime;

    res.setHeader('X-Search-Latency-Ms', latencyMs);

    res.json({
      results,
      meta: {
        total: results.length,
        query,
        latencyMs,
      },
    });
  } catch (error) {
    console.error('[Search] Error:', error);
    res.status(500).json({
      error: {
        code: 'SEARCH_ERROR',
        message: 'Search failed',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * POST /v1/brain/search/multimodal
 * Dashboard multimodal search
 */
async function handleMultimodalSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const { query, modalities, filters, limit } = req.body as {
      query: string;
      modalities?: EventType[];
      filters?: SearchFilters;
      limit?: number;
    };

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'query is required and must be a string',
          requestId: req.requestId,
        },
      });
      return;
    }

    const startTime = Date.now();
    const results = await multimodalSearch(
      userId,
      query,
      modalities,
      filters || {},
      limit || 20
    );
    const latencyMs = Date.now() - startTime;

    res.setHeader('X-Search-Latency-Ms', latencyMs);

    res.json({
      results,
      meta: {
        total: results.length,
        query,
        modalities: modalities || ['audio_segment', 'video_segment', 'image_frame'],
        latencyMs,
      },
    });
  } catch (error) {
    console.error('[MultimodalSearch] Error:', error);
    res.status(500).json({
      error: {
        code: 'SEARCH_ERROR',
        message: 'Multimodal search failed',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * GET /v1/brain/insights
 * Dashboard insights and recommendations
 */
async function handleInsights(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const { timeRange, focusAreas } = req.query as {
      timeRange?: string;
      focusAreas?: string;
    };

    // Parse time range (default to last 7 days)
    let start = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let end = Date.now();

    if (timeRange) {
      try {
        const parsed = JSON.parse(timeRange);
        start = parsed.start || start;
        end = parsed.end || end;
      } catch {
        // Use defaults if parsing fails
      }
    }

    // Parse focus areas
    let areas: InsightsRequest['focusAreas'] = undefined;
    if (focusAreas) {
      areas = focusAreas.split(',') as InsightsRequest['focusAreas'];
    }

    const startTime = Date.now();
    const insights = await generateInsights({
      userId,
      timeRange: { start, end },
      focusAreas: areas,
    });
    const latencyMs = Date.now() - startTime;

    res.setHeader('X-Insights-Latency-Ms', latencyMs);

    res.json(insights);
  } catch (error) {
    console.error('[Insights] Error:', error);
    res.status(500).json({
      error: {
        code: 'INSIGHTS_ERROR',
        message: 'Failed to generate insights',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * POST /v1/brain/speakers/cluster:label
 * Confirm speaker cluster label
 */
async function handleClusterLabel(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const { clusterId, contactId } = req.body as ClusterLabelRequest;

    if (!clusterId || !contactId) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'clusterId and contactId are required',
          requestId: req.requestId,
        },
      });
      return;
    }

    // TODO: Implement cluster labeling
    // 1. Verify cluster belongs to user
    // 2. Update cluster with contactId in LanceDB
    // 3. Update Neo4j relationships
    // 4. Trigger backfill job to update related embeddings

    // Placeholder implementation
    const backfillJobId = uuidv4();

    // Queue backfill job
    setImmediate(async () => {
      try {
        // TODO: Implement backfill
        // await backfillClusterLabels(userId, clusterId, contactId);
        console.log(`[Cluster] Backfill job ${backfillJobId} for cluster ${clusterId}`);
      } catch (error) {
        console.error(`[Cluster] Backfill job ${backfillJobId} failed:`, error);
      }
    });

    const response: ClusterLabelResponse = {
      success: true,
      clusterId,
      contactId,
      backfillJobId,
      affectedEventCount: 0, // TODO: Calculate from actual data
    };

    res.json(response);
  } catch (error) {
    console.error('[ClusterLabel] Error:', error);
    res.status(500).json({
      error: {
        code: 'CLUSTER_LABEL_ERROR',
        message: 'Failed to label cluster',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * GET /v1/brain/health
 * Health check endpoint
 */
async function handleHealth(req: AuthenticatedRequest, res: Response): Promise<void> {
  const services: HealthResponse['services'] = [];

  // Check LanceDB
  try {
    const start = Date.now();
    // TODO: Add actual health check
    // await lanceDbClient.ping();
    services.push({
      name: 'lancedb',
      status: 'healthy',
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    services.push({
      name: 'lancedb',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check Neo4j
  try {
    const start = Date.now();
    // TODO: Add actual health check
    // await neo4jClient.ping();
    services.push({
      name: 'neo4j',
      status: 'healthy',
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    services.push({
      name: 'neo4j',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check OpenRouter (embedding service)
  try {
    const start = Date.now();
    // TODO: Add actual health check
    services.push({
      name: 'openrouter',
      status: 'healthy',
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    services.push({
      name: 'openrouter',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check Dead Letter Queue
  const dlqSize = deadLetterQueue.size();
  services.push({
    name: 'dead_letter_queue',
    status: dlqSize > 100 ? 'degraded' : 'healthy',
    error: dlqSize > 0 ? `${dlqSize} items in DLQ` : undefined,
  });

  // Determine overall status
  const hasUnhealthy = services.some((s) => s.status === 'unhealthy');
  const hasDegraded = services.some((s) => s.status === 'degraded');

  const overallStatus: HealthResponse['status'] = hasUnhealthy
    ? 'unhealthy'
    : hasDegraded
      ? 'degraded'
      : 'healthy';

  const response: HealthResponse = {
    status: overallStatus,
    version: config.version,
    uptime: Date.now() - serverStartTime,
    services,
    timestamp: Date.now(),
  };

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json(response);
}

/**
 * GET /v1/brain/dlq
 * Get dead letter queue contents (internal only)
 */
async function handleDLQ(req: AuthenticatedRequest, res: Response): Promise<void> {
  const items = deadLetterQueue.getAll();

  res.json({
    count: items.length,
    items: items.slice(0, 100), // Limit response size
  });
}

/**
 * POST /v1/brain/dlq/:eventId/retry
 * Retry a specific event from DLQ (internal only)
 */
async function handleDLQRetry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { eventId } = req.params;

  const success = await deadLetterQueue.retry(eventId);

  if (!success) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Event ${eventId} not found in DLQ`,
        requestId: req.requestId,
      },
    });
    return;
  }

  // Queue for reprocessing
  setImmediate(async () => {
    try {
      await processEvent(eventId);
      console.log(`[DLQ] Retry successful for event ${eventId}`);
    } catch (error) {
      console.error(`[DLQ] Retry failed for event ${eventId}:`, error);
    }
  });

  res.json({
    success: true,
    eventId,
    message: 'Event queued for retry',
  });
}

// =============================================================================
// ROUTER SETUP
// =============================================================================

function createRouter(): Router {
  const router = Router();

  // ==========================================================================
  // Internal routes (server-to-server auth)
  // ==========================================================================
  const internalRouter = Router();
  internalRouter.use(serverAuth({
    config: {
      allowedServices: ['convex-webhook', 'cron-service', 'admin-service'],
    },
  }));

  // Job triggers
  internalRouter.post('/jobs/events', handleJobsEvents as express.RequestHandler);

  // DLQ management
  internalRouter.get('/dlq', handleDLQ as express.RequestHandler);
  internalRouter.post('/dlq/:eventId/retry', handleDLQRetry as express.RequestHandler);

  router.use('/v1/brain', internalRouter);

  // ==========================================================================
  // Dashboard routes (Clerk JWT auth)
  // ==========================================================================
  const dashboardRouter = Router();
  dashboardRouter.use(clerkAuth({
    skipPaths: [], // All paths require auth
  }));
  dashboardRouter.use(rateLimiter as express.RequestHandler);

  // Search
  dashboardRouter.post('/search', handleSearch as express.RequestHandler);
  dashboardRouter.post('/search/multimodal', handleMultimodalSearch as express.RequestHandler);

  // Insights
  dashboardRouter.get('/insights', handleInsights as express.RequestHandler);

  // Speaker clustering
  dashboardRouter.post('/speakers/cluster:label', handleClusterLabel as express.RequestHandler);

  router.use('/v1/brain', dashboardRouter);

  // ==========================================================================
  // iOS Edge App routes (Clerk JWT auth)
  // ==========================================================================

  // iOS Ingestion routes
  // POST /v1/brain/ios/ingest - Accept media ingestion from iOS app
  // POST /v1/brain/ios/batch - Batch ingestion for multiple tasks
  // GET /v1/brain/ios/status/:taskId - Check task processing status
  router.use('/v1/brain/ios', createiOSIngestRouter());

  // Embeddings routes
  // POST /v1/brain/embeddings/store - Store embedding from iOS
  // POST /v1/brain/embeddings/search - Similarity search
  // POST /v1/brain/embeddings/batch - Batch store embeddings
  // GET /v1/brain/embeddings/:embeddingId - Retrieve embedding
  // DELETE /v1/brain/embeddings/:embeddingId - Delete embedding
  router.use('/v1/brain/embeddings', createEmbeddingsRouter());

  // Graph routes
  // POST /v1/brain/graph/relationship - Add graph relationship
  // DELETE /v1/brain/graph/relationship - Delete relationship
  // POST /v1/brain/graph/node - Update node properties
  // POST /v1/brain/graph/node/create - Create new node
  // GET /v1/brain/graph/path - Query path between nodes
  // GET /v1/brain/graph/neighbors/:nodeId - Get node neighbors
  router.use('/v1/brain/graph', createGraphRouter());

  // ==========================================================================
  // Public routes (no auth)
  // ==========================================================================
  router.get('/v1/brain/health', handleHealth as express.RequestHandler);

  return router;
}

// =============================================================================
// SERVER CREATION
// =============================================================================

export function createServer(): express.Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for API server
  }));

  // CORS
  app.use(cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Server-Signature', 'X-Server-Timestamp', 'X-Server-Service', 'X-Server-Nonce', 'X-API-Key'],
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Compression
  app.use(compression());

  // Request ID and logging
  app.use(requestIdMiddleware as express.RequestHandler);
  app.use(loggingMiddleware as express.RequestHandler);

  // Routes
  app.use(createRouter());

  // 404 handler
  app.use(notFoundHandler as express.RequestHandler);

  // Error handler
  app.use(errorHandler as express.ErrorRequestHandler);

  return app;
}

// =============================================================================
// SERVER START
// =============================================================================

export function startServer(): void {
  const app = createServer();

  app.listen(config.port, () => {
    console.log(`[Server] Neural Intelligence Brain API started`);
    console.log(`[Server] Version: ${config.version}`);
    console.log(`[Server] Port: ${config.port}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Auto-start if run directly
if (require.main === module) {
  startServer();
}

// Export for testing
export { config };
