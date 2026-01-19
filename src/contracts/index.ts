/**
 * Neural Intelligence Platform - Contracts Module
 *
 * Exports all types and functions for working with event mappings
 * and the processing registry.
 *
 * @version 1.0.0
 */

// =============================================================================
// MAPPINGS
// =============================================================================

export {
  // Types
  type ValueExtractor,
  type PropertyMapping,
  type MergeKeySpec,
  type NodeWriteSpec,
  type NodeRef,
  type RelationshipWriteSpec,
  type EventMapping,
  type MappingValidationResult,

  // Functions
  loadMappingFile,
  loadMappingsFromDirectory,
  getMappingForEventType,
  clearMappingCache,
  registerMapping,
  getAllMappings,
  validateMapping,

  // Helpers
  pathExtractor,
  pathWithDefault,
  pathWithTransform,
} from './mappings';

// =============================================================================
// REGISTRY
// =============================================================================

export {
  // Types
  type BrainConfig,
  type MappingConfig,
  type RegistryEntry,
  type Registry,
  type ProcessingRequirement,

  // Functions
  loadRegistry,
  getRegistry,
  reloadRegistry,
  getRegistryEntry,
  isEventTypeRegistered,
  isBrainEnabled,
  requiresGraphProcessing,
  requiresVectorProcessing,
  requiresLlmEnrichment,
  getMappingPath,
  getProcessingRequirements,
  getBrainConfig,
  getAllEventTypes,
  getGraphEnabledEventTypes,
  getBrainEnabledEventTypes,
  getEventTypesByPriority,
  validateRegistryEntry,
  validateRegistry,
  createDefaultEntry,
  resolveMappingPath,

  // Constants
  DEFAULT_BRAIN_CONFIG,
} from './registry';
