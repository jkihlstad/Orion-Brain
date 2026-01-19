/**
 * Neural Intelligence Platform - Graph Module
 *
 * Exports all types and functions for graph operations,
 * including the mapping engine, Cypher generation, and Neo4j client.
 *
 * @version 1.0.0
 */

// =============================================================================
// MAPPING ENGINE
// =============================================================================

export {
  // Types
  type GraphOpKind,
  type GraphOperation,
  type MappingResult,
  type MappableEvent,

  // Main Functions
  mapEventToGraphOps,
  mapEventsToGraphOps,

  // Utilities
  resolveKeyPath,
  buildMergeKey,
  generateMergeKeyString,
  collectOperations,
  deduplicateNodeOperations,
  extractValue,
  extractProperties,
  evaluateCondition,
} from './mappingEngine';

// =============================================================================
// CYPHER GENERATION
// =============================================================================

export {
  // Types
  type CypherParams,
  type CypherQuery,
  type NodeMergeOptions,
  type RelationshipMergeOptions,

  // Escaping
  escapeLabel,
  escapePropertyName,
  isValidLabel,
  isValidPropertyName,

  // Node Queries
  generateNodeMerge,
  generateSimpleNodeMerge,
  generateNodeDelete,
  generateNodeMatch,

  // Relationship Queries
  generateRelationshipMerge,
  generateRelationshipMergeWithNodes,

  // Query Combination
  combineQueries,

  // Parameter Helpers
  buildParams,
} from './cypher';

// =============================================================================
// NEO4J CLIENT
// =============================================================================

export {
  // Types
  type Neo4jConfig,
  type QueryResult,
  type QuerySummary,
  type HealthCheckResult,
  type TransactionContext,
  type BatchExecutionResult,

  // Class
  Neo4jClient,

  // Factory
  createNeo4jClient,

  // Singleton
  getDefaultClient,
  setDefaultClient,
  initializeDefaultClient,
} from './neo4j';

// =============================================================================
// PROFILE GRAPH OPERATIONS
// =============================================================================

export {
  // Main Functions
  writeProfileGraphToNeo4j,
  writeProfileGraph,
  readProfileGraph,
  deleteProfileGraph,

  // Query Generation
  generateAllProfileQueries,

  // Helper Functions
  extractPreferences,
  extractNotificationRules,
  extractAppPreferences,

  // Constants
  NODE_LABELS,
  RELATIONSHIP_TYPES,

  // Types
  type Neo4jProfileResult,
  type ProfileGraphData,
  type ProfileGraphConfig,
} from './profile';
