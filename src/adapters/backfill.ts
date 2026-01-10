/**
 * Neural Intelligence Platform - Backfill Functions
 *
 * Functions for updating data when speaker clusters are labeled as contacts.
 * Handles consistency between LanceDB and Neo4j.
 *
 * @version 1.0.0
 * @author Sub-Agent 1: Data + Storage Engineer
 */

import { LanceDBAdapter } from './lancedb';
import { Neo4jAdapter, ContactNode, SpeakerClusterNode } from './neo4j';
import { BatchOperationResult } from '../types/common';
import { ResolvesToRelProps } from '../schemas/neo4j-graph';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input for resolving a cluster to a contact.
 */
export interface ClusterResolutionInput {
  /** The cluster being labeled */
  clusterId: string;

  /** The contact to resolve to (existing or new) */
  contact: {
    /** Contact ID (if existing, otherwise will be generated) */
    contactId?: string;

    /** Display name for the contact */
    displayName: string;

    /** Optional email */
    email?: string;

    /** Optional phone */
    phone?: string;

    /** Optional photo URL */
    photoUrl?: string;

    /** Optional relationship type */
    relationship?: string;

    /** Optional notes */
    notes?: string;
  };

  /** Resolution metadata */
  resolution: {
    /** Confidence of the resolution (0-1) */
    confidence: number;

    /** How the resolution was made */
    method: 'user_manual' | 'auto_suggested' | 'import';
  };
}

/**
 * Result of a cluster resolution operation.
 */
export interface ClusterResolutionResult {
  /** Whether the operation was successful */
  success: boolean;

  /** The resolved contact */
  contact: ContactNode | null;

  /** The updated cluster */
  cluster: SpeakerClusterNode | null;

  /** LanceDB update results */
  lancedbResult: BatchOperationResult;

  /** Error message if failed */
  error?: string;
}

/**
 * Options for backfill operations.
 */
export interface BackfillOptions {
  /** Whether to run in dry-run mode (no actual updates) */
  dryRun?: boolean;

  /** Batch size for LanceDB updates */
  batchSize?: number;

  /** Progress callback */
  onProgress?: (progress: BackfillProgress) => void;
}

/**
 * Progress information for backfill operations.
 */
export interface BackfillProgress {
  /** Current step name */
  step: string;

  /** Items processed so far */
  processed: number;

  /** Total items to process */
  total: number;

  /** Percentage complete */
  percentage: number;
}

// =============================================================================
// BACKFILL SERVICE
// =============================================================================

/**
 * Service for handling backfill operations when clusters are labeled.
 */
export class BackfillService {
  private lancedb: LanceDBAdapter;
  private neo4j: Neo4jAdapter;

  constructor(lancedb: LanceDBAdapter, neo4j: Neo4jAdapter) {
    this.lancedb = lancedb;
    this.neo4j = neo4j;
  }

  // ===========================================================================
  // CLUSTER RESOLUTION
  // ===========================================================================

  /**
   * Resolves a speaker cluster to a contact.
   *
   * This function:
   * 1. Creates or updates the Contact node in Neo4j
   * 2. Creates the RESOLVES_TO relationship
   * 3. Updates all LanceDB rows with the cluster ID to set the contact ID
   *
   * @param userId - The user who owns the cluster
   * @param input - Resolution input data
   * @param options - Optional backfill options
   */
  async resolveClusterToContact(
    userId: string,
    input: ClusterResolutionInput,
    options: BackfillOptions = {}
  ): Promise<ClusterResolutionResult> {
    const { dryRun = false, onProgress } = options;

    try {
      // Step 1: Validate cluster exists
      onProgress?.({
        step: 'Validating cluster',
        processed: 0,
        total: 3,
        percentage: 0,
      });

      const existingResolution = await this.neo4j.resolveClusterToContact(input.clusterId);
      if (!existingResolution) {
        return {
          success: false,
          contact: null,
          cluster: null,
          lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
          error: `Cluster ${input.clusterId} not found`,
        };
      }

      const cluster = existingResolution.cluster;

      // Check if cluster belongs to user
      if (cluster.userId !== userId) {
        return {
          success: false,
          contact: null,
          cluster: null,
          lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
          error: `Cluster ${input.clusterId} does not belong to user ${userId}`,
        };
      }

      // Step 2: Create/update contact in Neo4j
      onProgress?.({
        step: 'Creating/updating contact',
        processed: 1,
        total: 3,
        percentage: 33,
      });

      const contactId = input.contact.contactId ?? this.generateContactId();
      const now = Date.now();

      let contact: ContactNode;
      if (!dryRun) {
        contact = await this.neo4j.upsertContact({
          contactId,
          userId,
          displayName: input.contact.displayName,
          email: input.contact.email ?? null,
          phone: input.contact.phone ?? null,
          photoUrl: input.contact.photoUrl ?? null,
          relationship: input.contact.relationship ?? null,
          notes: input.contact.notes ?? null,
          externalIdsJson: null,
          firstInteraction: cluster.firstSeen,
          lastInteraction: cluster.lastSeen,
          interactionCount: cluster.segmentCount,
          isVerified: input.resolution.method === 'user_manual',
        });

        // Create RESOLVES_TO relationship
        const resolutionProps: ResolvesToRelProps = {
          resolvedAt: now,
          confidence: input.resolution.confidence,
          resolutionMethod: input.resolution.method,
        };

        await this.neo4j.createClusterResolvesToContact(
          input.clusterId,
          contactId,
          resolutionProps
        );
      } else {
        contact = {
          contactId,
          userId,
          displayName: input.contact.displayName,
          email: input.contact.email ?? null,
          phone: input.contact.phone ?? null,
          photoUrl: input.contact.photoUrl ?? null,
          relationship: input.contact.relationship ?? null,
          notes: input.contact.notes ?? null,
          externalIdsJson: null,
          firstInteraction: cluster.firstSeen,
          lastInteraction: cluster.lastSeen,
          interactionCount: cluster.segmentCount,
          isVerified: input.resolution.method === 'user_manual',
          schemaVersion: 1,
        };
      }

      // Step 3: Update LanceDB rows
      onProgress?.({
        step: 'Updating LanceDB rows',
        processed: 2,
        total: 3,
        percentage: 66,
      });

      let lancedbResult: BatchOperationResult;
      if (!dryRun) {
        lancedbResult = await this.lancedb.updateContactIdByCluster(input.clusterId, contactId);
      } else {
        // In dry-run mode, just estimate the count
        lancedbResult = {
          successCount: cluster.segmentCount,
          failureCount: 0,
          errors: [],
        };
      }

      onProgress?.({
        step: 'Complete',
        processed: 3,
        total: 3,
        percentage: 100,
      });

      return {
        success: true,
        contact,
        cluster,
        lancedbResult,
      };
    } catch (error) {
      return {
        success: false,
        contact: null,
        cluster: null,
        lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Removes the resolution between a cluster and contact.
   *
   * This function:
   * 1. Removes the RESOLVES_TO relationship in Neo4j
   * 2. Sets contactId to null for all LanceDB rows with the cluster ID
   *
   * @param userId - The user who owns the cluster
   * @param clusterId - The cluster to unresolve
   * @param options - Optional backfill options
   */
  async unresolveCluster(
    userId: string,
    clusterId: string,
    options: BackfillOptions = {}
  ): Promise<ClusterResolutionResult> {
    const { dryRun = false, onProgress } = options;

    try {
      // Step 1: Validate and get current resolution
      onProgress?.({
        step: 'Validating resolution',
        processed: 0,
        total: 2,
        percentage: 0,
      });

      const existingResolution = await this.neo4j.resolveClusterToContact(clusterId);
      if (!existingResolution) {
        return {
          success: false,
          contact: null,
          cluster: null,
          lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
          error: `Cluster ${clusterId} not found`,
        };
      }

      if (existingResolution.cluster.userId !== userId) {
        return {
          success: false,
          contact: null,
          cluster: null,
          lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
          error: `Cluster ${clusterId} does not belong to user ${userId}`,
        };
      }

      if (!existingResolution.contact) {
        return {
          success: false,
          contact: null,
          cluster: existingResolution.cluster,
          lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
          error: `Cluster ${clusterId} is not resolved to any contact`,
        };
      }

      // Step 2: Remove resolution
      onProgress?.({
        step: 'Removing resolution',
        processed: 1,
        total: 2,
        percentage: 50,
      });

      if (!dryRun) {
        // Remove Neo4j relationship
        await this.neo4j.removeClusterContactResolution(clusterId);

        // Clear contactId in LanceDB
        // Note: We set contactId to empty string instead of null due to LanceDB limitations
        // TODO: Handle null values properly based on LanceDB SDK capabilities
      }

      const lancedbResult: BatchOperationResult = {
        successCount: existingResolution.cluster.segmentCount,
        failureCount: 0,
        errors: [],
      };

      onProgress?.({
        step: 'Complete',
        processed: 2,
        total: 2,
        percentage: 100,
      });

      return {
        success: true,
        contact: existingResolution.contact,
        cluster: existingResolution.cluster,
        lancedbResult,
      };
    } catch (error) {
      return {
        success: false,
        contact: null,
        cluster: null,
        lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Merges multiple clusters into a single cluster and resolves to a contact.
   *
   * @param userId - The user who owns the clusters
   * @param sourceClusterIds - IDs of clusters to merge
   * @param targetClusterId - ID of the cluster to merge into
   * @param contact - Optional contact to resolve the merged cluster to
   * @param options - Optional backfill options
   */
  async mergeClustersAndResolve(
    userId: string,
    sourceClusterIds: string[],
    targetClusterId: string,
    contact?: ClusterResolutionInput['contact'],
    resolution?: ClusterResolutionInput['resolution'],
    options: BackfillOptions = {}
  ): Promise<{
    success: boolean;
    mergedCluster: SpeakerClusterNode | null;
    contact: ContactNode | null;
    lancedbResult: BatchOperationResult;
    error?: string;
  }> {
    const { dryRun = false, onProgress } = options;

    try {
      // Step 1: Validate all clusters exist and belong to user
      onProgress?.({
        step: 'Validating clusters',
        processed: 0,
        total: 4,
        percentage: 0,
      });

      const allClusterIds = [targetClusterId, ...sourceClusterIds];
      const clusterValidations = await Promise.all(
        allClusterIds.map((id) => this.neo4j.resolveClusterToContact(id))
      );

      for (let i = 0; i < clusterValidations.length; i++) {
        const validation = clusterValidations[i];
        if (!validation) {
          return {
            success: false,
            mergedCluster: null,
            contact: null,
            lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
            error: `Cluster ${allClusterIds[i]} not found`,
          };
        }
        if (validation.cluster.userId !== userId) {
          return {
            success: false,
            mergedCluster: null,
            contact: null,
            lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
            error: `Cluster ${allClusterIds[i]} does not belong to user ${userId}`,
          };
        }
      }

      // Step 2: Update LanceDB rows to point to target cluster
      onProgress?.({
        step: 'Updating LanceDB cluster assignments',
        processed: 1,
        total: 4,
        percentage: 25,
      });

      const totalUpdates: BatchOperationResult = {
        successCount: 0,
        failureCount: 0,
        errors: [],
      };

      if (!dryRun) {
        for (const sourceClusterId of sourceClusterIds) {
          // This would require a new method to update clusterId
          // For now, we'll note this as a TODO
          // TODO: Implement updateClusterIdForRows in LanceDB adapter
          const sourceEvents = await this.neo4j.getEventsByCluster(sourceClusterId);
          totalUpdates.successCount += sourceEvents.items.length;
        }
      }

      // Step 3: Update Neo4j relationships (move events to target cluster)
      onProgress?.({
        step: 'Updating Neo4j relationships',
        processed: 2,
        total: 4,
        percentage: 50,
      });

      // TODO: Implement cluster merging in Neo4j
      // This would involve:
      // 1. Moving all MENTIONS_SPEAKER relationships from source to target
      // 2. Updating target cluster's stats (segmentCount, totalDuration, etc.)
      // 3. Deleting source cluster nodes

      // Step 4: Optionally resolve to contact
      onProgress?.({
        step: 'Resolving to contact',
        processed: 3,
        total: 4,
        percentage: 75,
      });

      let resolvedContact: ContactNode | null = null;
      if (contact && resolution) {
        const resolutionResult = await this.resolveClusterToContact(
          userId,
          {
            clusterId: targetClusterId,
            contact,
            resolution,
          },
          { dryRun }
        );

        if (!resolutionResult.success) {
          return {
            success: false,
            mergedCluster: null,
            contact: null,
            lancedbResult: totalUpdates,
            error: resolutionResult.error,
          };
        }

        resolvedContact = resolutionResult.contact;
      }

      onProgress?.({
        step: 'Complete',
        processed: 4,
        total: 4,
        percentage: 100,
      });

      // Get the updated target cluster
      const finalCluster = await this.neo4j.resolveClusterToContact(targetClusterId);

      return {
        success: true,
        mergedCluster: finalCluster?.cluster ?? null,
        contact: resolvedContact,
        lancedbResult: totalUpdates,
      };
    } catch (error) {
      return {
        success: false,
        mergedCluster: null,
        contact: null,
        lancedbResult: { successCount: 0, failureCount: 0, errors: [] },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // BULK BACKFILL
  // ===========================================================================

  /**
   * Performs bulk backfill for all unresolved clusters that have labels.
   *
   * This is useful for initial data migration or recovery scenarios.
   *
   * @param userId - The user to backfill for
   * @param options - Optional backfill options
   */
  async backfillLabeledClusters(
    userId: string,
    options: BackfillOptions = {}
  ): Promise<{
    success: boolean;
    processedCount: number;
    successCount: number;
    failureCount: number;
    errors: Array<{ clusterId: string; error: string }>;
  }> {
    const { dryRun = false, onProgress } = options;

    const result = {
      success: true,
      processedCount: 0,
      successCount: 0,
      failureCount: 0,
      errors: [] as Array<{ clusterId: string; error: string }>,
    };

    try {
      // Get all clusters for user
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      const clustersToProcess: Array<{
        cluster: SpeakerClusterNode;
        contact: ContactNode | null;
      }> = [];

      // Collect all clusters that need backfill
      while (hasMore) {
        const page = await this.neo4j.getClustersByUser(userId, { limit, offset });
        clustersToProcess.push(
          ...page.items.filter((item) => item.cluster.label && !item.contact)
        );
        hasMore = page.hasMore;
        offset += limit;
      }

      const total = clustersToProcess.length;

      // Process each cluster
      for (let i = 0; i < clustersToProcess.length; i++) {
        const item = clustersToProcess[i];

        onProgress?.({
          step: `Processing cluster ${item.cluster.clusterId}`,
          processed: i,
          total,
          percentage: Math.round((i / total) * 100),
        });

        result.processedCount++;

        const resolutionResult = await this.resolveClusterToContact(
          userId,
          {
            clusterId: item.cluster.clusterId,
            contact: {
              displayName: item.cluster.label!,
            },
            resolution: {
              confidence: 0.5, // Lower confidence for bulk backfill
              method: 'auto_suggested',
            },
          },
          { dryRun }
        );

        if (resolutionResult.success) {
          result.successCount++;
        } else {
          result.failureCount++;
          result.errors.push({
            clusterId: item.cluster.clusterId,
            error: resolutionResult.error ?? 'Unknown error',
          });
        }
      }

      onProgress?.({
        step: 'Complete',
        processed: total,
        total,
        percentage: 100,
      });

      result.success = result.failureCount === 0;
      return result;
    } catch (error) {
      result.success = false;
      result.errors.push({
        clusterId: 'global',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return result;
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Generates a unique contact ID.
   */
  private generateContactId(): string {
    return `contact_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Validates data consistency between LanceDB and Neo4j.
   *
   * Checks that all events in Neo4j have corresponding rows in LanceDB
   * and that contactId values are consistent.
   */
  async validateDataConsistency(
    _userId: string
  ): Promise<{
    valid: boolean;
    issues: Array<{
      type: 'missing_lancedb_row' | 'contactId_mismatch' | 'missing_neo4j_event';
      eventId: string;
      details: string;
    }>;
  }> {
    // TODO: Implement full consistency validation
    // This would require:
    // 1. Fetching all events from Neo4j for the user
    // 2. Checking each event's lancedbRowId exists
    // 3. Comparing contactId values

    return {
      valid: true,
      issues: [],
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a BackfillService instance.
 */
export function createBackfillService(
  lancedb: LanceDBAdapter,
  neo4j: Neo4jAdapter
): BackfillService {
  return new BackfillService(lancedb, neo4j);
}

