/**
 * Neural Intelligence Platform - Graph API
 *
 * API endpoints for Neo4j graph operations. Handles:
 * - Adding graph relationships
 * - Updating node properties
 * - Querying paths between nodes
 * - Graph traversal operations
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Middleware
import { clerkAuth, getUserId } from '../middleware/clerkAuth';

// Adapters
import { Neo4jAdapter } from '../adapters/neo4j';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Relationship types supported in the graph
 */
export type RelationshipType =
  | 'GENERATED'
  | 'HAS_SPEAKER_CLUSTER'
  | 'RESOLVES_TO'
  | 'HAS_SESSION'
  | 'VIEWED'
  | 'IN_SESSION'
  | 'MENTIONS_SPEAKER'
  | 'KNOWS'
  | 'INTERACTED_WITH'
  | 'RELATED_TO';

/**
 * Node types in the graph
 */
export type NodeType =
  | 'User'
  | 'Event'
  | 'SpeakerCluster'
  | 'Contact'
  | 'Session'
  | 'Url'
  | 'Topic';

/**
 * Add relationship request
 */
export interface AddRelationshipRequest {
  fromUserId: string;
  toUserId: string;
  type: RelationshipType;
  properties?: Record<string, unknown>;
}

/**
 * Add relationship response
 */
export interface AddRelationshipResponse {
  success: boolean;
  relationshipId?: string;
  error?: string;
}

/**
 * Update node request
 */
export interface UpdateNodeRequest {
  nodeId: string;
  nodeType: NodeType;
  properties: Record<string, unknown>;
}

/**
 * Update node response
 */
export interface UpdateNodeResponse {
  success: boolean;
  nodeId?: string;
  updatedProperties?: string[];
  error?: string;
}

/**
 * Path query request
 */
export interface PathQueryRequest {
  fromNodeId: string;
  fromNodeType: NodeType;
  toNodeId: string;
  toNodeType: NodeType;
  maxHops?: number;
  relationshipTypes?: RelationshipType[];
}

/**
 * Path node in response
 */
export interface PathNode {
  id: string;
  type: NodeType;
  properties: Record<string, unknown>;
}

/**
 * Path relationship in response
 */
export interface PathRelationship {
  type: RelationshipType;
  properties: Record<string, unknown>;
}

/**
 * Path query response
 */
export interface PathQueryResponse {
  success: boolean;
  paths: Array<{
    nodes: PathNode[];
    relationships: PathRelationship[];
    length: number;
  }>;
  error?: string;
}

/**
 * Graph neighbors query response
 */
export interface NeighborsQueryResponse {
  success: boolean;
  neighbors: Array<{
    node: PathNode;
    relationship: PathRelationship;
    direction: 'incoming' | 'outgoing';
  }>;
  error?: string;
}

/**
 * Create node request
 */
export interface CreateNodeRequest {
  nodeType: NodeType;
  properties: Record<string, unknown>;
}

/**
 * Create node response
 */
export interface CreateNodeResponse {
  success: boolean;
  nodeId?: string;
  error?: string;
}

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

const relationshipTypeSchema = z.enum([
  'GENERATED',
  'HAS_SPEAKER_CLUSTER',
  'RESOLVES_TO',
  'HAS_SESSION',
  'VIEWED',
  'IN_SESSION',
  'MENTIONS_SPEAKER',
  'KNOWS',
  'INTERACTED_WITH',
  'RELATED_TO',
]);

const nodeTypeSchema = z.enum([
  'User',
  'Event',
  'SpeakerCluster',
  'Contact',
  'Session',
  'Url',
  'Topic',
]);

const addRelationshipRequestSchema = z.object({
  fromUserId: z.string().min(1, 'fromUserId is required'),
  toUserId: z.string().min(1, 'toUserId is required'),
  type: relationshipTypeSchema,
  properties: z.record(z.unknown()).optional(),
});

const updateNodeRequestSchema = z.object({
  nodeId: z.string().min(1, 'nodeId is required'),
  nodeType: nodeTypeSchema,
  properties: z.record(z.unknown()).refine(obj => Object.keys(obj).length > 0, 'At least one property is required'),
});

const pathQueryRequestSchema = z.object({
  fromNodeId: z.string().min(1, 'fromNodeId is required'),
  fromNodeType: nodeTypeSchema,
  toNodeId: z.string().min(1, 'toNodeId is required'),
  toNodeType: nodeTypeSchema,
  maxHops: z.number().min(1).max(10).optional().default(5),
  relationshipTypes: z.array(relationshipTypeSchema).optional(),
});

const createNodeRequestSchema = z.object({
  nodeType: nodeTypeSchema,
  properties: z.record(z.unknown()).refine(obj => Object.keys(obj).length > 0, 'At least one property is required'),
});

// =============================================================================
// ADAPTER INSTANCE (Singleton pattern)
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
 * POST /v1/brain/graph/relationship
 * Add a graph relationship
 */
async function handleAddRelationship(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = addRelationshipRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      } as AddRelationshipResponse);
      return;
    }

    const { fromUserId, toUserId, type, properties } = validationResult.data;
    const authenticatedUserId = getUserId(req);

    // Verify the user has permission (must be one of the users in the relationship)
    if (fromUserId !== authenticatedUserId && toUserId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        error: 'Not authorized to create relationships between other users',
      } as AddRelationshipResponse);
      return;
    }

    // Get Neo4j adapter
    const adapter = await getNeo4jAdapter();

    try {
      const relationshipId = uuidv4();
      const timestamp = Date.now();

      // Create relationship based on type
      switch (type) {
        case 'KNOWS':
        case 'INTERACTED_WITH':
        case 'RELATED_TO':
          // Generic user-to-user relationship
          // These require custom Cypher queries
          await adapter.withTransaction(async (tx) => {
            await tx.run(
              `
              MATCH (from:User {id: $fromUserId})
              MATCH (to:User {id: $toUserId})
              MERGE (from)-[r:${type}]->(to)
              SET r += $properties
              SET r.createdAt = $timestamp
              SET r.relationshipId = $relationshipId
              `,
              {
                fromUserId,
                toUserId,
                properties: properties || {},
                timestamp,
                relationshipId,
              }
            );
          });
          break;

        case 'GENERATED':
          // User generated event
          await adapter.createUserGeneratedEvent(
            fromUserId,
            toUserId, // toUserId is the eventId in this case
            timestamp
          );
          break;

        case 'HAS_SPEAKER_CLUSTER':
          // User has speaker cluster
          await adapter.createUserHasSpeakerCluster(
            fromUserId,
            toUserId, // toUserId is the clusterId in this case
            timestamp,
            (properties?.creationMethod as 'auto_clustering' | 'manual_split' | 'manual_merge') || 'auto_clustering'
          );
          break;

        case 'RESOLVES_TO':
          // Cluster resolves to contact
          await adapter.createClusterResolvesToContact(
            fromUserId, // fromUserId is the clusterId
            toUserId, // toUserId is the contactId
            {
              resolvedAt: timestamp,
              confidence: (properties?.confidence as number) || 1.0,
              resolutionMethod: (properties?.resolutionMethod as 'user_manual' | 'auto_suggested' | 'import') || 'user_manual',
            }
          );
          break;

        case 'HAS_SESSION':
          // User has session
          await adapter.createUserHasSession(
            fromUserId,
            toUserId, // toUserId is the sessionId
            timestamp
          );
          break;

        default:
          res.status(400).json({
            success: false,
            error: `Unsupported relationship type: ${type}`,
          } as AddRelationshipResponse);
          return;
      }

      const response: AddRelationshipResponse = {
        success: true,
        relationshipId,
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('[Graph Relationship] Database error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create relationship',
      } as AddRelationshipResponse);
    }
  } catch (error) {
    console.error('[Graph Relationship] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as AddRelationshipResponse);
  }
}

/**
 * POST /v1/brain/graph/node
 * Update node properties
 */
async function handleUpdateNode(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = updateNodeRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      } as UpdateNodeResponse);
      return;
    }

    const { nodeId, nodeType, properties } = validationResult.data;
    const authenticatedUserId = getUserId(req);

    // Get Neo4j adapter
    const adapter = await getNeo4jAdapter();

    try {
      // Verify user owns the node or has permission
      // For security, only allow updating nodes owned by the user
      const propsObj = properties as Record<string, unknown>;
      const updatedProperties = Object.keys(propsObj);

      await adapter.withTransaction(async (tx) => {
        // First verify ownership
        const ownershipCheck = await tx.run(
          `
          MATCH (n:${nodeType} {id: $nodeId})
          OPTIONAL MATCH (u:User {id: $userId})-[*1..2]->(n)
          RETURN n, u
          `,
          { nodeId, userId: authenticatedUserId }
        );

        if (ownershipCheck.length === 0) {
          throw new Error('Node not found');
        }

        // Update the node
        await tx.run(
          `
          MATCH (n:${nodeType} {id: $nodeId})
          SET n += $properties
          SET n.updatedAt = $timestamp
          `,
          {
            nodeId,
            properties: propsObj,
            timestamp: Date.now(),
          }
        );
      });

      const response: UpdateNodeResponse = {
        success: true,
        nodeId,
        updatedProperties,
      };

      res.json(response);
    } catch (error) {
      console.error('[Graph Node Update] Database error:', error);

      if (error instanceof Error && error.message === 'Node not found') {
        res.status(404).json({
          success: false,
          error: `Node ${nodeId} not found`,
        } as UpdateNodeResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update node',
      } as UpdateNodeResponse);
    }
  } catch (error) {
    console.error('[Graph Node Update] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as UpdateNodeResponse);
  }
}

/**
 * GET /v1/brain/graph/path
 * Query path between nodes
 */
async function handlePathQuery(req: Request, res: Response): Promise<void> {
  try {
    // Parse query parameters
    const queryParams = {
      fromNodeId: req.query.fromNodeId as string,
      fromNodeType: req.query.fromNodeType as string,
      toNodeId: req.query.toNodeId as string,
      toNodeType: req.query.toNodeType as string,
      maxHops: req.query.maxHops ? parseInt(req.query.maxHops as string, 10) : undefined,
      relationshipTypes: req.query.relationshipTypes
        ? (req.query.relationshipTypes as string).split(',')
        : undefined,
    };

    // Validate query parameters
    const validationResult = pathQueryRequestSchema.safeParse(queryParams);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        paths: [],
        error: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      } as PathQueryResponse);
      return;
    }

    const { fromNodeId, fromNodeType, toNodeId, toNodeType, maxHops, relationshipTypes } = validationResult.data;
    const authenticatedUserId = getUserId(req);

    // Get Neo4j adapter
    const adapter = await getNeo4jAdapter();

    try {
      // Build relationship type filter
      const relFilter = relationshipTypes && relationshipTypes.length > 0
        ? `:${relationshipTypes.join('|')}`
        : '';

      const results = await adapter.withTransaction(async (tx) => {
        // Verify user has access to the nodes
        const accessCheck = await tx.run(
          `
          MATCH (u:User {id: $userId})
          MATCH (from:${fromNodeType} {id: $fromNodeId})
          MATCH (to:${toNodeType} {id: $toNodeId})
          WHERE (u)-[*0..3]->(from) OR from.userId = $userId OR from:User
          AND (u)-[*0..3]->(to) OR to.userId = $userId OR to:User
          RETURN from, to
          `,
          { userId: authenticatedUserId, fromNodeId, toNodeId }
        );

        if (accessCheck.length === 0) {
          throw new Error('Access denied or nodes not found');
        }

        // Query paths
        const pathResults = await tx.run(
          `
          MATCH path = shortestPath(
            (from:${fromNodeType} {id: $fromNodeId})-[${relFilter}*1..${maxHops}]-(to:${toNodeType} {id: $toNodeId})
          )
          RETURN path
          LIMIT 10
          `,
          { fromNodeId, toNodeId }
        );

        return pathResults;
      });

      // Transform results
      const paths = results.map((record: Record<string, unknown>) => {
        const path = record.path as {
          nodes: Array<{ id: string; labels: string[]; properties: Record<string, unknown> }>;
          relationships: Array<{ type: string; properties: Record<string, unknown> }>;
        };

        return {
          nodes: path.nodes.map(node => ({
            id: node.id,
            type: node.labels[0] as NodeType,
            properties: node.properties,
          })),
          relationships: path.relationships.map(rel => ({
            type: rel.type as RelationshipType,
            properties: rel.properties,
          })),
          length: path.relationships.length,
        };
      });

      const response: PathQueryResponse = {
        success: true,
        paths,
      };

      res.json(response);
    } catch (error) {
      console.error('[Graph Path Query] Database error:', error);

      if (error instanceof Error && error.message === 'Access denied or nodes not found') {
        res.status(404).json({
          success: false,
          paths: [],
          error: 'Nodes not found or access denied',
        } as PathQueryResponse);
        return;
      }

      res.status(500).json({
        success: false,
        paths: [],
        error: error instanceof Error ? error.message : 'Path query failed',
      } as PathQueryResponse);
    }
  } catch (error) {
    console.error('[Graph Path Query] Error:', error);
    res.status(500).json({
      success: false,
      paths: [],
      error: 'Internal server error',
    } as PathQueryResponse);
  }
}

/**
 * GET /v1/brain/graph/neighbors/:nodeId
 * Get neighbors of a node
 */
async function handleNeighborsQuery(req: Request, res: Response): Promise<void> {
  try {
    const { nodeId } = req.params;
    const nodeType = req.query.nodeType as string;
    const authenticatedUserId = getUserId(req);

    if (!nodeId) {
      res.status(400).json({
        success: false,
        neighbors: [],
        error: 'nodeId is required',
      } as NeighborsQueryResponse);
      return;
    }

    if (!nodeType || !['User', 'Event', 'SpeakerCluster', 'Contact', 'Session', 'Url', 'Topic'].includes(nodeType)) {
      res.status(400).json({
        success: false,
        neighbors: [],
        error: 'Valid nodeType is required',
      } as NeighborsQueryResponse);
      return;
    }

    // Get Neo4j adapter
    const adapter = await getNeo4jAdapter();

    try {
      const results = await adapter.withTransaction(async (tx) => {
        return tx.run(
          `
          MATCH (n:${nodeType} {id: $nodeId})
          WHERE n.userId = $userId OR exists((n)<-[*1..2]-(:User {id: $userId}))
          MATCH (n)-[r]-(neighbor)
          RETURN neighbor, r,
                 CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END as direction
          LIMIT 100
          `,
          { nodeId, userId: authenticatedUserId }
        );
      });

      const neighbors = results.map((record: Record<string, unknown>) => {
        const neighbor = record.neighbor as { id: string; labels: string[]; properties: Record<string, unknown> };
        const rel = record.r as { type: string; properties: Record<string, unknown> };
        const direction = record.direction as 'incoming' | 'outgoing';

        return {
          node: {
            id: neighbor.id,
            type: neighbor.labels[0] as NodeType,
            properties: neighbor.properties,
          },
          relationship: {
            type: rel.type as RelationshipType,
            properties: rel.properties,
          },
          direction,
        };
      });

      const response: NeighborsQueryResponse = {
        success: true,
        neighbors,
      };

      res.json(response);
    } catch (error) {
      console.error('[Graph Neighbors Query] Database error:', error);
      res.status(500).json({
        success: false,
        neighbors: [],
        error: error instanceof Error ? error.message : 'Neighbors query failed',
      } as NeighborsQueryResponse);
    }
  } catch (error) {
    console.error('[Graph Neighbors Query] Error:', error);
    res.status(500).json({
      success: false,
      neighbors: [],
      error: 'Internal server error',
    } as NeighborsQueryResponse);
  }
}

/**
 * POST /v1/brain/graph/node/create
 * Create a new node
 */
async function handleCreateNode(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = createNodeRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      } as CreateNodeResponse);
      return;
    }

    const { nodeType, properties } = validationResult.data;
    const authenticatedUserId = getUserId(req);

    // Get Neo4j adapter
    const adapter = await getNeo4jAdapter();

    try {
      const propsObj = properties as Record<string, unknown>;
      const nodeId = (propsObj.id as string) || uuidv4();
      const timestamp = Date.now();

      // Create node based on type
      switch (nodeType) {
        case 'User':
          await adapter.upsertUser({
            userId: nodeId,
            createdAt: timestamp,
            email: (propsObj.email as string) || '',
            displayName: (propsObj.displayName as string) || null,
            lastActiveAt: timestamp,
            preferencesJson: null,
            status: 'active',
          });
          break;

        case 'Event':
          await adapter.upsertEvent({
            eventId: nodeId,
            userId: authenticatedUserId,
            eventType: ((propsObj.eventType as string) || 'text_event') as 'audio_segment' | 'text_event' | 'browser_session' | 'image_frame' | 'video_segment',
            timestamp,
            privacyScope: (propsObj.privacyScope as 'private' | 'social' | 'public') || 'private',
            sourceApp: ((propsObj.sourceApp as string) || 'ios_native') as 'ios_browser' | 'ios_native' | 'web_extension' | 'api_import',
            lancedbTable: (propsObj.lancedbTable as string) || 'text_events',
            lancedbRowId: (propsObj.lancedbRowId as string) || nodeId,
            summary: (propsObj.summary as string) || null,
          });
          break;

        case 'SpeakerCluster':
          await adapter.upsertSpeakerCluster({
            clusterId: nodeId,
            userId: authenticatedUserId,
            centroidVectorJson: (propsObj.centroidVectorJson as string) || '[]',
            segmentCount: (propsObj.segmentCount as number) || 0,
            totalDuration: (propsObj.totalDuration as number) || 0,
            firstSeen: timestamp,
            lastSeen: timestamp,
            label: (propsObj.label as string) || null,
            qualityScore: (propsObj.qualityScore as number) || 0,
            isUserVoice: (propsObj.isUserVoice as boolean) || false,
          });
          break;

        case 'Contact':
          await adapter.upsertContact({
            contactId: nodeId,
            userId: authenticatedUserId,
            displayName: (propsObj.name as string) || (propsObj.displayName as string) || 'Unknown',
            email: (propsObj.email as string) || null,
            phone: (propsObj.phone as string) || null,
            photoUrl: (propsObj.photoUrl as string) || null,
            relationship: (propsObj.relationship as string) || null,
            notes: (propsObj.notes as string) || null,
            externalIdsJson: (propsObj.externalIdsJson as string) || null,
            firstInteraction: timestamp,
            lastInteraction: timestamp,
            interactionCount: (propsObj.interactionCount as number) || 0,
            isVerified: (propsObj.isVerified as boolean) || false,
          });
          break;

        case 'Session':
          await adapter.upsertSession({
            sessionId: nodeId,
            userId: authenticatedUserId,
            startTime: timestamp,
            endTime: timestamp,
            duration: 0,
            deviceType: (propsObj.deviceType as 'mobile' | 'tablet' | 'desktop') || 'mobile',
            eventCount: 0,
            urlCount: 0,
            primaryTopic: (propsObj.primaryTopic as string) || null,
            summary: (propsObj.summary as string) || null,
            lancedbRowId: (propsObj.lancedbRowId as string) || null,
          });
          break;

        case 'Url':
          await adapter.upsertUrl({
            normalizedUrl: (propsObj.normalizedUrl as string) || nodeId,
            originalUrl: (propsObj.originalUrl as string) || nodeId,
            domain: (propsObj.domain as string) || 'unknown',
            path: (propsObj.path as string) || '/',
            title: (propsObj.title as string) || null,
            description: (propsObj.description as string) || null,
            faviconUrl: (propsObj.faviconUrl as string) || null,
            category: (propsObj.category as string) || null,
            firstVisit: timestamp,
            lastVisit: timestamp,
          });
          break;

        default:
          res.status(400).json({
            success: false,
            error: `Unsupported node type: ${nodeType}`,
          } as CreateNodeResponse);
          return;
      }

      const response: CreateNodeResponse = {
        success: true,
        nodeId,
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('[Graph Create Node] Database error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create node',
      } as CreateNodeResponse);
    }
  } catch (error) {
    console.error('[Graph Create Node] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as CreateNodeResponse);
  }
}

/**
 * DELETE /v1/brain/graph/relationship
 * Delete a relationship
 */
async function handleDeleteRelationship(req: Request, res: Response): Promise<void> {
  try {
    const { fromNodeId, toNodeId, type } = req.body;
    const authenticatedUserId = getUserId(req);

    if (!fromNodeId || !toNodeId || !type) {
      res.status(400).json({
        success: false,
        error: 'fromNodeId, toNodeId, and type are required',
      });
      return;
    }

    // Get Neo4j adapter
    const adapter = await getNeo4jAdapter();

    try {
      await adapter.withTransaction(async (tx) => {
        // Verify ownership and delete
        await tx.run(
          `
          MATCH (from {id: $fromNodeId})-[r:${type}]->(to {id: $toNodeId})
          WHERE from.userId = $userId OR exists((from)<-[:GENERATED]-(:User {id: $userId}))
          DELETE r
          `,
          { fromNodeId, toNodeId, userId: authenticatedUserId }
        );
      });

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[Graph Delete Relationship] Database error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete relationship',
      });
    }
  } catch (error) {
    console.error('[Graph Delete Relationship] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

// =============================================================================
// ROUTER FACTORY
// =============================================================================

/**
 * Create graph router with Clerk authentication
 */
export function createGraphRouter(): Router {
  const router = Router();

  // Apply Clerk authentication to all routes
  router.use(clerkAuth({
    skipPaths: [], // All paths require auth
  }));

  // POST /v1/brain/graph/relationship - Add relationship
  router.post('/relationship', handleAddRelationship as express.RequestHandler);

  // DELETE /v1/brain/graph/relationship - Delete relationship
  router.delete('/relationship', handleDeleteRelationship as express.RequestHandler);

  // POST /v1/brain/graph/node - Update node properties
  router.post('/node', handleUpdateNode as express.RequestHandler);

  // POST /v1/brain/graph/node/create - Create new node
  router.post('/node/create', handleCreateNode as express.RequestHandler);

  // GET /v1/brain/graph/path - Query path between nodes
  router.get('/path', handlePathQuery as express.RequestHandler);

  // GET /v1/brain/graph/neighbors/:nodeId - Get node neighbors
  router.get('/neighbors/:nodeId', handleNeighborsQuery as express.RequestHandler);

  return router;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  handleAddRelationship,
  handleUpdateNode,
  handlePathQuery,
  handleNeighborsQuery,
  handleCreateNode,
  handleDeleteRelationship,
  addRelationshipRequestSchema,
  updateNodeRequestSchema,
  pathQueryRequestSchema,
  createNodeRequestSchema,
};
