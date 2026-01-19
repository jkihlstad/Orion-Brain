/**
 * Neural Intelligence Platform - Admin API Routes
 *
 * Provides provability endpoints for golden feature proof testing:
 * - GET /admin/brain/status - Query brain processing status by traceId
 * - GET /admin/graph/assert - Verify Neo4j graph assertions by traceId
 *
 * @version 1.0.0
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Middleware
import { serverAuth, apiKeyAuth } from '../../middleware/serverAuth';

// Neo4j Adapter
import { Neo4jAdapter } from '../../adapters/neo4j';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extended request with requestId
 */
type AdminRequest = Request & {
  requestId?: string;
};

/**
 * Brain status response
 */
export interface BrainStatusResponse {
  found: boolean;
  traceId: string;
  events: Array<{
    eventId: string;
    eventType: string;
    userId: string;
    brainStatus: string;
    brainAttempts: number;
    brainError?: string | null;
    timestamp: number;
    ingestedAt?: number;
  }>;
  processingStatus: {
    pending: number;
    leased: number;
    done: number;
    failed: number;
    total: number;
  };
  graphUpserted: boolean;
}

/**
 * Graph assertion response
 */
export interface GraphAssertResponse {
  found: boolean;
  traceId: string;
  nodes: Array<{
    id: string;
    labels: string[];
    properties: Record<string, unknown>;
  }>;
  relationships: Array<{
    id: string;
    type: string;
    startNodeId: string;
    endNodeId: string;
    properties: Record<string, unknown>;
  }>;
  assertions: {
    nodesCreated: number;
    relationshipsCreated: number;
    eventNodesFound: number;
    userNodesFound: number;
    speakerClustersFound: number;
    contactsFound: number;
    sessionsFound: number;
  };
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const traceIdSchema = z.string().min(1, 'traceId is required');

// =============================================================================
// CONVEX CLIENT MOCK/ADAPTER
// =============================================================================

/**
 * Convex client interface for querying events
 * In production, this would use the actual Convex HTTP client
 */
interface ConvexClient {
  query<T>(functionName: string, args: Record<string, unknown>): Promise<T>;
}

/**
 * Mock Convex client for development
 * Replace with actual Convex HTTP client in production
 */
function createConvexClient(): ConvexClient {
  const convexUrl = process.env.CONVEX_URL;
  const convexDeployKey = process.env.CONVEX_DEPLOY_KEY;

  return {
    async query<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
      if (!convexUrl) {
        console.warn('[Admin] CONVEX_URL not configured, using mock response');
        return [] as unknown as T;
      }

      try {
        const response = await fetch(`${convexUrl}/api/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(convexDeployKey && { Authorization: `Convex ${convexDeployKey}` }),
          },
          body: JSON.stringify({
            path: functionName,
            args,
          }),
        });

        if (!response.ok) {
          throw new Error(`Convex query failed: ${response.status}`);
        }

        const result = await response.json() as { value: T };
        return result.value;
      } catch (error) {
        console.error('[Admin] Convex query error:', error);
        throw error;
      }
    },
  };
}

// =============================================================================
// NEO4J ADAPTER SINGLETON
// =============================================================================

let neo4jAdapter: Neo4jAdapter | null = null;

/**
 * Get or create Neo4j adapter instance
 */
async function getNeo4jAdapter(): Promise<Neo4jAdapter> {
  if (!neo4jAdapter) {
    neo4jAdapter = new Neo4jAdapter({
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    });
    await neo4jAdapter.connect();
  }
  return neo4jAdapter;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /admin/brain/status
 * Query brain processing status for events with a specific traceId
 */
export async function handleBrainStatus(req: AdminRequest, res: Response): Promise<void> {
  try {
    const traceIdParam = req.query.traceId;
    const traceIdResult = traceIdSchema.safeParse(traceIdParam);

    if (!traceIdResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'traceId query parameter is required',
          requestId: req.requestId,
        },
      });
      return;
    }

    const traceId = traceIdResult.data;
    const convexClient = createConvexClient();

    // Query Convex for events with this traceId in metadata
    // The events table stores traceId in the metadata field
    let events: Array<{
      _id: string;
      eventType: string;
      userId: string;
      brainStatus?: string;
      brainAttempts?: number;
      brainError?: string | null;
      timestamp: number;
      ingestedAt?: number;
      metadata?: { traceId?: string };
    }> = [];

    try {
      // Query using the admin:getEventsByTraceId function
      // This function should be defined in Convex to query events by metadata.traceId
      events = await convexClient.query<typeof events>('admin:getEventsByTraceId', { traceId });
    } catch (error) {
      // If the Convex function doesn't exist yet, try alternative approach
      // In development, we might scan all events and filter
      console.warn('[Admin] getEventsByTraceId not available, using fallback');

      // Fallback: Use brainOps:listAll or similar if available
      try {
        const allEvents = await convexClient.query<typeof events>('brainOps:listByMetadataTraceId', { traceId });
        events = allEvents;
      } catch {
        // If neither function exists, return empty results
        events = [];
      }
    }

    // Calculate processing status
    const processingStatus = {
      pending: 0,
      leased: 0,
      done: 0,
      failed: 0,
      total: events.length,
    };

    for (const event of events) {
      const status = event.brainStatus || 'unknown';
      if (status === 'pending') processingStatus.pending++;
      else if (status === 'leased') processingStatus.leased++;
      else if (status === 'done') processingStatus.done++;
      else if (status === 'failed') processingStatus.failed++;
    }

    // Check if graph was upserted (all events are done)
    const graphUpserted = events.length > 0 && processingStatus.done === events.length;

    const mappedEvents: BrainStatusResponse['events'] = events.map((e) => {
      const event: BrainStatusResponse['events'][number] = {
        eventId: e._id,
        eventType: e.eventType,
        userId: e.userId,
        brainStatus: e.brainStatus || 'unknown',
        brainAttempts: e.brainAttempts || 0,
        timestamp: e.timestamp,
      };
      if (e.brainError !== undefined) {
        event.brainError = e.brainError;
      }
      if (e.ingestedAt !== undefined) {
        event.ingestedAt = e.ingestedAt;
      }
      return event;
    });

    const response: BrainStatusResponse = {
      found: events.length > 0,
      traceId,
      events: mappedEvents,
      processingStatus,
      graphUpserted,
    };

    res.json(response);
  } catch (error) {
    console.error('[Admin Brain Status] Error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to query brain status',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * GET /admin/graph/assert
 * Query Neo4j to verify nodes/relationships were created for a traceId
 */
export async function handleGraphAssert(req: AdminRequest, res: Response): Promise<void> {
  try {
    const traceIdParam = req.query.traceId;
    const traceIdResult = traceIdSchema.safeParse(traceIdParam);

    if (!traceIdResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'traceId query parameter is required',
          requestId: req.requestId,
        },
      });
      return;
    }

    const traceId = traceIdResult.data;

    // Get Neo4j adapter
    const adapter = await getNeo4jAdapter();

    // Query for nodes and relationships with this traceId
    // The traceId should be stored in node properties during graph upsert
    const queryResult = await adapter.withTransaction(async (tx) => {
      // Query all nodes with this traceId in their properties
      const nodesQuery = await tx.run(
        `
        MATCH (n)
        WHERE n.traceId = $traceId OR n.metadata.traceId = $traceId
        RETURN n, labels(n) as labels, id(n) as nodeId
        LIMIT 1000
        `,
        { traceId }
      );

      // Query all relationships connected to nodes with this traceId
      const relsQuery = await tx.run(
        `
        MATCH (a)-[r]->(b)
        WHERE a.traceId = $traceId OR b.traceId = $traceId
           OR a.metadata.traceId = $traceId OR b.metadata.traceId = $traceId
           OR r.traceId = $traceId
        RETURN r, type(r) as relType, id(a) as startId, id(b) as endId, id(r) as relId
        LIMIT 1000
        `,
        { traceId }
      );

      // Count nodes by type
      const countsQuery = await tx.run(
        `
        MATCH (n)
        WHERE n.traceId = $traceId OR n.metadata.traceId = $traceId
        WITH labels(n) as nodeLabels
        RETURN
          sum(CASE WHEN 'Event' IN nodeLabels THEN 1 ELSE 0 END) as eventNodes,
          sum(CASE WHEN 'User' IN nodeLabels THEN 1 ELSE 0 END) as userNodes,
          sum(CASE WHEN 'SpeakerCluster' IN nodeLabels THEN 1 ELSE 0 END) as speakerClusters,
          sum(CASE WHEN 'Contact' IN nodeLabels THEN 1 ELSE 0 END) as contacts,
          sum(CASE WHEN 'Session' IN nodeLabels THEN 1 ELSE 0 END) as sessions
        `,
        { traceId }
      );

      return { nodesQuery, relsQuery, countsQuery };
    });

    // Transform nodes
    const nodes = queryResult.nodesQuery.map((record: Record<string, unknown>) => {
      const node = record.n as { properties?: Record<string, unknown> };
      const labels = record.labels as string[];
      const nodeId = record.nodeId as string;

      return {
        id: nodeId.toString(),
        labels,
        properties: node.properties || {},
      };
    });

    // Transform relationships
    const relationships = queryResult.relsQuery.map((record: Record<string, unknown>) => {
      const rel = record.r as { properties?: Record<string, unknown> };
      const relType = record.relType as string;
      const startId = record.startId as string;
      const endId = record.endId as string;
      const relId = record.relId as string;

      return {
        id: relId.toString(),
        type: relType,
        startNodeId: startId.toString(),
        endNodeId: endId.toString(),
        properties: rel.properties || {},
      };
    });

    // Get counts
    const counts = queryResult.countsQuery[0] || {};

    const response: GraphAssertResponse = {
      found: nodes.length > 0 || relationships.length > 0,
      traceId,
      nodes,
      relationships,
      assertions: {
        nodesCreated: nodes.length,
        relationshipsCreated: relationships.length,
        eventNodesFound: (counts.eventNodes as number) || 0,
        userNodesFound: (counts.userNodes as number) || 0,
        speakerClustersFound: (counts.speakerClusters as number) || 0,
        contactsFound: (counts.contacts as number) || 0,
        sessionsFound: (counts.sessions as number) || 0,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[Admin Graph Assert] Error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to query graph assertions',
        requestId: req.requestId,
      },
    });
  }
}

// =============================================================================
// ROUTER FACTORY
// =============================================================================

/**
 * Create admin router with appropriate authentication
 */
function createAdminRouterInternal(): Router {
  const router = Router();

  // Apply authentication - allow API key or server auth for admin endpoints
  // This allows both internal services and admin dashboards to access these endpoints
  router.use((req: Request, res: Response, next: express.NextFunction) => {
    // Check for API key first
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string') {
      return apiKeyAuth()(req, res, next);
    }

    // Otherwise require server auth
    return serverAuth({
      config: {
        allowedServices: ['admin-service', 'test-service', 'golden-feature-test'],
      },
    })(req, res, next);
  });

  // Add request ID if not present
  router.use((req: AdminRequest, res: Response, next: express.NextFunction) => {
    const existingId = req.headers['x-request-id'];
    req.requestId = (typeof existingId === 'string' ? existingId : undefined) || uuidv4();
    res.setHeader('x-request-id', req.requestId);
    next();
  });

  // ==========================================================================
  // Brain Status Endpoints
  // ==========================================================================

  // GET /admin/brain/status - Query brain processing status by traceId
  router.get('/brain/status', handleBrainStatus as express.RequestHandler);

  // ==========================================================================
  // Graph Assertion Endpoints
  // ==========================================================================

  // GET /admin/graph/assert - Verify graph assertions by traceId
  router.get('/graph/assert', handleGraphAssert as express.RequestHandler);

  return router;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createAdminRouter = createAdminRouterInternal;
