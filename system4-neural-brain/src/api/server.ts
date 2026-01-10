/**
 * Neural Intelligence Platform - API Server
 *
 * REST API endpoints for Dashboard integration:
 * - /v1/brain/jobs/events - Internal event trigger
 * - /v1/brain/search - Semantic search
 * - /v1/brain/search/multimodal - Multimodal search
 * - /v1/brain/insights - AI-powered insights
 * - /v1/brain/speakers/cluster:label - Speaker labeling
 * - /v1/brain/health - Health check
 */

import { loadConfig } from '../../config/default';
import { BrainConfig, SearchFilters, SearchResult } from '../types';
import { logger } from '../utils/logger';
import { generateId } from '../utils/id';

// =============================================================================
// EXPRESS TYPES (to avoid full express dependency for now)
// TODO: Replace with actual express types when package is installed
// =============================================================================

interface Request {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  userId?: string;
  isInternal?: boolean;
}

interface Response {
  status(code: number): Response;
  json(data: unknown): void;
  send(data: string): void;
}

type NextFunction = (error?: Error) => void;
type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * Verify Clerk JWT for Dashboard requests.
 */
async function verifyClerkJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.slice(7);

    // TODO: Implement actual Clerk JWT verification
    // import { verifyToken } from '@clerk/clerk-sdk-node';
    // const payload = await verifyToken(token, {
    //   secretKey: config.clerk.secretKey,
    // });

    // Placeholder: Extract userId from token (in production, verify signature)
    const userId = extractUserIdFromToken(token);

    if (!userId) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid token',
      });
      return;
    }

    req.userId = userId;
    req.isInternal = false;
    next();

  } catch (error) {
    logger.error('JWT verification failed', { error });
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token verification failed',
    });
  }
}

/**
 * Verify server-to-server API key for internal requests.
 */
async function verifyServerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid API key',
      });
      return;
    }

    req.isInternal = true;
    next();

  } catch (error) {
    logger.error('Server auth verification failed', { error });
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication failed',
    });
  }
}

/**
 * Placeholder: Extract userId from JWT.
 * TODO: Replace with actual Clerk SDK verification.
 */
function extractUserIdFromToken(token: string): string | null {
  try {
    // In production, use Clerk SDK to verify and decode
    // For now, assume token is base64-encoded JSON with sub claim
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.sub || null;
  } catch {
    return null;
  }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * POST /v1/brain/jobs/events
 * Internal trigger for processing events (from Convex webhook or poller).
 */
async function handleJobsEvents(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { eventIds: string[] };

    if (!Array.isArray(body.eventIds) || body.eventIds.length === 0) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'eventIds array is required',
      });
      return;
    }

    const jobId = generateId('job');

    // TODO: Queue events for processing via worker
    // For now, just acknowledge receipt
    logger.info('Received events for processing', {
      jobId,
      eventCount: body.eventIds.length,
    });

    res.status(202).json({
      jobId,
      status: 'queued',
      eventIds: body.eventIds,
      createdAt: Date.now(),
    });

  } catch (error) {
    logger.error('handleJobsEvents failed', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to queue events',
    });
  }
}

/**
 * POST /v1/brain/search
 * Dashboard semantic search.
 */
async function handleSearch(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const body = req.body as {
      query: string;
      filters?: SearchFilters;
      limit?: number;
    };

    if (!body.query || typeof body.query !== 'string') {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'query string is required',
      });
      return;
    }

    const limit = Math.min(body.limit || 10, 100);

    // TODO: Implement actual search
    // 1. Generate query embedding via OpenRouter
    // 2. Search LanceDB with filters (ALWAYS include userId!)
    // 3. Hydrate results from Convex/Neo4j
    // 4. Return friendly results

    logger.info('Search request', {
      userId,
      queryLength: body.query.length,
      limit,
    });

    // Placeholder response
    const results: SearchResult[] = [];

    res.status(200).json({
      results,
      query: body.query,
      filters: body.filters,
      limit,
      total: results.length,
    });

  } catch (error) {
    logger.error('handleSearch failed', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Search failed',
    });
  }
}

/**
 * POST /v1/brain/search/multimodal
 * Text query -> find matching audio/video/image.
 */
async function handleMultimodalSearch(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const body = req.body as {
      query: string;
      modalities?: ('audio' | 'video' | 'image' | 'text')[];
      filters?: SearchFilters;
      limit?: number;
    };

    if (!body.query || typeof body.query !== 'string') {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'query string is required',
      });
      return;
    }

    const modalities = body.modalities || ['audio', 'video', 'image', 'text'];
    const limit = Math.min(body.limit || 10, 100);

    // TODO: Implement multimodal search
    // 1. Generate query embedding
    // 2. Search each requested modality in LanceDB
    // 3. Merge and rank results
    // 4. Return with media URLs

    logger.info('Multimodal search request', {
      userId,
      modalities,
      queryLength: body.query.length,
    });

    res.status(200).json({
      results: [],
      query: body.query,
      modalities,
      limit,
      total: 0,
    });

  } catch (error) {
    logger.error('handleMultimodalSearch failed', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Multimodal search failed',
    });
  }
}

/**
 * GET /v1/brain/insights
 * Dashboard insights/recommendations powered by LangGraph.
 */
async function handleInsights(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const timeRange = {
      start: parseInt(req.query.startTime || '0') || Date.now() - 7 * 24 * 60 * 60 * 1000,
      end: parseInt(req.query.endTime || '0') || Date.now(),
    };

    // TODO: Implement insights via LangGraph
    // 1. Fetch recent events/embeddings for user
    // 2. Run LangGraph summarization/pattern detection
    // 3. Generate recommendations

    logger.info('Insights request', {
      userId,
      timeRange,
    });

    res.status(200).json({
      summary: {
        text: 'Insights generation is not yet implemented.',
        highlights: [],
        period: `${new Date(timeRange.start).toISOString()} - ${new Date(timeRange.end).toISOString()}`,
      },
      patterns: [],
      recommendations: [],
      metrics: {
        totalEvents: 0,
        totalMeetingMinutes: 0,
        uniqueContacts: 0,
        topTopics: [],
        sentimentDistribution: {},
        productivityScore: 0,
        actionItemCompletionRate: 0,
      },
      generatedAt: Date.now(),
    });

  } catch (error) {
    logger.error('handleInsights failed', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Insights generation failed',
    });
  }
}

/**
 * POST /v1/brain/speakers/cluster:label
 * Confirm cluster label after Dashboard writes to Convex.
 * Triggers backfill of LanceDB metadata.
 */
async function handleClusterLabel(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const body = req.body as {
      clusterId: string;
      contactId: string;
    };

    if (!body.clusterId || !body.contactId) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'clusterId and contactId are required',
      });
      return;
    }

    // TODO: Implement label handling
    // 1. Verify cluster belongs to user
    // 2. Update Neo4j: (SpeakerCluster)-[:RESOLVES_TO]->(Contact)
    // 3. Queue backfill job for LanceDB (update all rows with clusterId)

    logger.info('Cluster label request', {
      userId,
      clusterId: body.clusterId,
      contactId: body.contactId,
    });

    const backfillJobId = generateId('backfill');

    res.status(200).json({
      success: true,
      clusterId: body.clusterId,
      contactId: body.contactId,
      backfillJobId,
      affectedEventCount: 0, // TODO: Calculate actual count
    });

  } catch (error) {
    logger.error('handleClusterLabel failed', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Cluster labeling failed',
    });
  }
}

/**
 * GET /v1/brain/health
 * Health check endpoint.
 */
async function handleHealth(req: Request, res: Response): Promise<void> {
  const startTime = process.hrtime.bigint();

  // TODO: Check actual service health
  // - LanceDB connection
  // - Neo4j connection
  // - OpenRouter availability

  const services = [
    { name: 'lancedb', status: 'healthy' as const, latencyMs: 1 },
    { name: 'neo4j', status: 'healthy' as const, latencyMs: 2 },
    { name: 'openrouter', status: 'healthy' as const, latencyMs: 50 },
    { name: 'convex', status: 'healthy' as const, latencyMs: 10 },
  ];

  const allHealthy = services.every((s) => s.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services: services.map((s) => ({
      ...s,
      lastCheck: Date.now(),
    })),
    timestamp: Date.now(),
  });
}

// =============================================================================
// ROUTER SETUP
// =============================================================================

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  middleware: Handler[];
  handler: Handler;
}

const routes: Route[] = [
  // Internal routes (server-to-server auth)
  {
    method: 'POST',
    path: '/v1/brain/jobs/events',
    middleware: [verifyServerAuth],
    handler: handleJobsEvents,
  },

  // Dashboard routes (Clerk JWT auth)
  {
    method: 'POST',
    path: '/v1/brain/search',
    middleware: [verifyClerkJWT],
    handler: handleSearch,
  },
  {
    method: 'POST',
    path: '/v1/brain/search/multimodal',
    middleware: [verifyClerkJWT],
    handler: handleMultimodalSearch,
  },
  {
    method: 'GET',
    path: '/v1/brain/insights',
    middleware: [verifyClerkJWT],
    handler: handleInsights,
  },
  {
    method: 'POST',
    path: '/v1/brain/speakers/cluster:label',
    middleware: [verifyClerkJWT],
    handler: handleClusterLabel,
  },

  // Public routes
  {
    method: 'GET',
    path: '/v1/brain/health',
    middleware: [],
    handler: handleHealth,
  },
];

// =============================================================================
// SERVER CREATION
// TODO: Replace with actual Express setup when package is installed
// =============================================================================

export function createServer(config: BrainConfig) {
  // Placeholder: In production, use Express
  // import express from 'express';
  // const app = express();
  // app.use(express.json());
  //
  // for (const route of routes) {
  //   const handlers = [...route.middleware, route.handler];
  //   app[route.method.toLowerCase()](route.path, ...handlers);
  // }
  //
  // return app;

  logger.info('API server routes configured', {
    routeCount: routes.length,
  });

  return {
    routes,
    config,
    listen: (port: number) => {
      logger.info(`API server would listen on port ${port}`);
      logger.info('TODO: Install express and implement actual server');
    },
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  logger.info('Starting Neural Intelligence Brain API Server');

  try {
    const config = loadConfig();
    const server = createServer(config);

    const port = parseInt(process.env.PORT || '3000');
    server.listen(port);

  } catch (error) {
    logger.error('Fatal error starting API server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { routes, verifyClerkJWT, verifyServerAuth };
