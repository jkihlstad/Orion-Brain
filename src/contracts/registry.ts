/**
 * Neural Intelligence Platform - Event Registry
 *
 * Defines and loads the registry that controls which event types
 * are enabled for brain processing and their configuration.
 *
 * The registry is the single source of truth for:
 * - Which event types are enabled for processing
 * - Whether an event type requires graph processing
 * - Path to the mapping file for each event type
 * - Processing configuration (priority, batch size, etc.)
 *
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Brain processing configuration for an event type.
 */
export interface BrainConfig {
  /** Whether brain processing is enabled for this event type */
  enabled: boolean;

  /** Whether this event type requires graph (Neo4j) processing */
  graphRequired: boolean;

  /** Whether this event type requires vector (LanceDB) processing */
  vectorRequired?: boolean;

  /** Whether this event type requires LLM enrichment */
  llmEnrichmentRequired?: boolean;

  /** Processing priority (higher = processed first) */
  priority?: number;

  /** Maximum batch size for processing */
  batchSize?: number;

  /** Maximum retry attempts for failed processing */
  maxRetries?: number;

  /** Timeout for processing in milliseconds */
  timeoutMs?: number;
}

/**
 * Mapping configuration for an event type.
 */
export interface MappingConfig {
  /** Path to the mapping file (relative to mappings directory) */
  path: string;

  /** Version of the mapping to use */
  version?: string;
}

/**
 * Complete registry entry for an event type.
 */
export interface RegistryEntry {
  /** Event type identifier */
  eventType: string;

  /** Human-readable description */
  description?: string;

  /** Brain processing configuration */
  brain: BrainConfig;

  /** Mapping configuration (if graphRequired) */
  mapping?: MappingConfig;

  /** Source applications that can generate this event type */
  sourceApps?: string[];

  /** Whether this event type is deprecated */
  deprecated?: boolean;

  /** Deprecation message if applicable */
  deprecationMessage?: string;
}

/**
 * Complete registry structure.
 */
export interface Registry {
  /** Registry version */
  version: string;

  /** Last updated timestamp */
  lastUpdated: string;

  /** Default brain configuration */
  defaults: Partial<BrainConfig>;

  /** Event type entries */
  entries: Record<string, RegistryEntry>;
}

/**
 * Result of checking if an event type requires processing.
 */
export interface ProcessingRequirement {
  /** Whether brain processing is enabled */
  brainEnabled: boolean;

  /** Whether graph processing is required */
  graphRequired: boolean;

  /** Whether vector processing is required */
  vectorRequired: boolean;

  /** Whether LLM enrichment is required */
  llmEnrichmentRequired: boolean;

  /** Path to mapping file (if graph required) */
  mappingPath: string | null;

  /** Priority level */
  priority: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default brain configuration applied when not specified in registry entry.
 */
const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  enabled: false,
  graphRequired: false,
  vectorRequired: false,
  llmEnrichmentRequired: false,
  priority: 0,
  batchSize: 10,
  maxRetries: 3,
  timeoutMs: 30000,
};

// =============================================================================
// REGISTRY STATE
// =============================================================================

let loadedRegistry: Registry | null = null;
let registryPath: string | null = null;

// =============================================================================
// REGISTRY LOADING
// =============================================================================

/**
 * Loads the registry from a JSON file.
 */
export function loadRegistry(filePath: string): Registry {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const registry = JSON.parse(content) as Registry;

  // Validate basic structure
  if (!registry.version || typeof registry.version !== 'string') {
    throw new Error('Registry must have a version string');
  }

  if (!registry.entries || typeof registry.entries !== 'object') {
    throw new Error('Registry must have an entries object');
  }

  // Apply defaults to each entry
  for (const eventType of Object.keys(registry.entries)) {
    const entry = registry.entries[eventType]!;
    entry.eventType = eventType;

    if (entry.brain) {
      entry.brain = {
        ...DEFAULT_BRAIN_CONFIG,
        ...(registry.defaults || {}),
        ...entry.brain,
      };
    } else {
      entry.brain = {
        ...DEFAULT_BRAIN_CONFIG,
        ...(registry.defaults || {}),
      };
    }
  }

  loadedRegistry = registry;
  registryPath = filePath;

  console.log(
    `[Registry] Loaded ${Object.keys(registry.entries).length} event types from ${filePath}`
  );

  return registry;
}

/**
 * Gets the currently loaded registry.
 */
export function getRegistry(): Registry | null {
  return loadedRegistry;
}

/**
 * Reloads the registry from the same path.
 */
export function reloadRegistry(): Registry | null {
  if (!registryPath) {
    console.warn('[Registry] No registry path set, cannot reload');
    return null;
  }

  return loadRegistry(registryPath);
}

// =============================================================================
// REGISTRY QUERIES
// =============================================================================

/**
 * Gets the registry entry for a specific event type.
 */
export function getRegistryEntry(eventType: string): RegistryEntry | null {
  if (!loadedRegistry) {
    console.warn('[Registry] No registry loaded');
    return null;
  }

  return loadedRegistry.entries[eventType] || null;
}

/**
 * Checks if an event type is registered.
 */
export function isEventTypeRegistered(eventType: string): boolean {
  return loadedRegistry !== null && eventType in loadedRegistry.entries;
}

/**
 * Checks if brain processing is enabled for an event type.
 */
export function isBrainEnabled(eventType: string): boolean {
  const entry = getRegistryEntry(eventType);
  return entry?.brain.enabled ?? false;
}

/**
 * Checks if an event type requires graph processing.
 */
export function requiresGraphProcessing(eventType: string): boolean {
  const entry = getRegistryEntry(eventType);
  return entry?.brain.enabled === true && entry?.brain.graphRequired === true;
}

/**
 * Checks if an event type requires vector processing.
 */
export function requiresVectorProcessing(eventType: string): boolean {
  const entry = getRegistryEntry(eventType);
  return entry?.brain.enabled === true && entry?.brain.vectorRequired === true;
}

/**
 * Checks if an event type requires LLM enrichment.
 */
export function requiresLlmEnrichment(eventType: string): boolean {
  const entry = getRegistryEntry(eventType);
  return entry?.brain.enabled === true && entry?.brain.llmEnrichmentRequired === true;
}

/**
 * Gets the mapping path for an event type.
 */
export function getMappingPath(eventType: string): string | null {
  const entry = getRegistryEntry(eventType);
  if (!entry?.brain.graphRequired || !entry?.mapping?.path) {
    return null;
  }
  return entry.mapping.path;
}

/**
 * Gets complete processing requirements for an event type.
 */
export function getProcessingRequirements(eventType: string): ProcessingRequirement {
  const entry = getRegistryEntry(eventType);

  if (!entry || !entry.brain.enabled) {
    return {
      brainEnabled: false,
      graphRequired: false,
      vectorRequired: false,
      llmEnrichmentRequired: false,
      mappingPath: null,
      priority: 0,
    };
  }

  return {
    brainEnabled: entry.brain.enabled,
    graphRequired: entry.brain.graphRequired,
    vectorRequired: entry.brain.vectorRequired ?? false,
    llmEnrichmentRequired: entry.brain.llmEnrichmentRequired ?? false,
    mappingPath: entry.mapping?.path ?? null,
    priority: entry.brain.priority ?? 0,
  };
}

/**
 * Gets the brain configuration for an event type.
 */
export function getBrainConfig(eventType: string): BrainConfig | null {
  const entry = getRegistryEntry(eventType);
  return entry?.brain ?? null;
}

/**
 * Gets all registered event types.
 */
export function getAllEventTypes(): string[] {
  if (!loadedRegistry) {
    return [];
  }
  return Object.keys(loadedRegistry.entries);
}

/**
 * Gets all event types that require graph processing.
 */
export function getGraphEnabledEventTypes(): string[] {
  if (!loadedRegistry) {
    return [];
  }

  return Object.keys(loadedRegistry.entries).filter((eventType) => {
    const entry = loadedRegistry!.entries[eventType]!;
    return entry.brain.enabled && entry.brain.graphRequired;
  });
}

/**
 * Gets all event types with brain processing enabled.
 */
export function getBrainEnabledEventTypes(): string[] {
  if (!loadedRegistry) {
    return [];
  }

  return Object.keys(loadedRegistry.entries).filter((eventType) => {
    const entry = loadedRegistry!.entries[eventType]!;
    return entry.brain.enabled;
  });
}

/**
 * Gets event types sorted by priority.
 */
export function getEventTypesByPriority(): string[] {
  if (!loadedRegistry) {
    return [];
  }

  return Object.keys(loadedRegistry.entries)
    .filter((eventType) => loadedRegistry!.entries[eventType]!.brain.enabled)
    .sort((a, b) => {
      const priorityA = loadedRegistry!.entries[a]!.brain.priority ?? 0;
      const priorityB = loadedRegistry!.entries[b]!.brain.priority ?? 0;
      return priorityB - priorityA; // Higher priority first
    });
}

// =============================================================================
// REGISTRY VALIDATION
// =============================================================================

/**
 * Validates a registry entry.
 */
export function validateRegistryEntry(entry: unknown): string[] {
  const errors: string[] = [];

  if (!entry || typeof entry !== 'object') {
    return ['Entry must be an object'];
  }

  const e = entry as Record<string, unknown>;

  if (!e.eventType || typeof e.eventType !== 'string') {
    errors.push('eventType is required and must be a string');
  }

  if (!e.brain || typeof e.brain !== 'object') {
    errors.push('brain configuration is required');
  } else {
    const brain = e.brain as Record<string, unknown>;

    if (typeof brain.enabled !== 'boolean') {
      errors.push('brain.enabled must be a boolean');
    }

    if (typeof brain.graphRequired !== 'boolean') {
      errors.push('brain.graphRequired must be a boolean');
    }

    if (brain.graphRequired && (!e.mapping || typeof e.mapping !== 'object')) {
      errors.push('mapping is required when graphRequired is true');
    }

    if (e.mapping && typeof e.mapping === 'object') {
      const mapping = e.mapping as Record<string, unknown>;
      if (!mapping.path || typeof mapping.path !== 'string') {
        errors.push('mapping.path is required when mapping is specified');
      }
    }
  }

  return errors;
}

/**
 * Validates the complete registry.
 */
export function validateRegistry(registry: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!registry || typeof registry !== 'object') {
    return { valid: false, errors: ['Registry must be an object'] };
  }

  const r = registry as Record<string, unknown>;

  if (!r.version || typeof r.version !== 'string') {
    errors.push('version is required');
  }

  if (!r.entries || typeof r.entries !== 'object') {
    errors.push('entries is required and must be an object');
  } else {
    const entries = r.entries as Record<string, unknown>;
    for (const [eventType, entry] of Object.entries(entries)) {
      const entryErrors = validateRegistryEntry({
        ...entry as object,
        eventType,
      });
      errors.push(...entryErrors.map((e) => `${eventType}: ${e}`));
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a default registry entry for an event type.
 */
export function createDefaultEntry(
  eventType: string,
  options: Partial<RegistryEntry> = {}
): RegistryEntry {
  return {
    eventType,
    brain: {
      ...DEFAULT_BRAIN_CONFIG,
      ...(options.brain || {}),
    },
    ...options,
  };
}

/**
 * Resolves a mapping path to an absolute path.
 */
export function resolveMappingPath(
  mappingPath: string,
  mappingsBaseDir: string
): string {
  if (path.isAbsolute(mappingPath)) {
    return mappingPath;
  }
  return path.join(mappingsBaseDir, mappingPath);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  DEFAULT_BRAIN_CONFIG,
};
