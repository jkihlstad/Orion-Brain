/**
 * Neural Intelligence Platform - Graph Mapping Definitions
 *
 * Defines the format and loading logic for graph mappings that specify
 * how events are transformed into Neo4j graph operations.
 *
 * Mappings are declarative specifications that allow any eventType to
 * be processed without custom code - all logic comes from the mapping specs.
 *
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPE DEFINITIONS FOR MAPPING FORMAT
// =============================================================================

/**
 * Specifies how to extract a value from an event.
 * Supports nested property paths like "payload.transactionId".
 */
export interface ValueExtractor {
  /** Path to the value in the event object (e.g., "payload.transactionId") */
  path: string;

  /** Optional default value if path resolves to undefined */
  default?: unknown;

  /** Optional transform to apply ("toLowerCase", "toUpperCase", "toString", "toNumber", "toBoolean", "toTimestamp") */
  transform?: 'toLowerCase' | 'toUpperCase' | 'toString' | 'toNumber' | 'toBoolean' | 'toTimestamp';
}

/**
 * Property mapping for a node or relationship.
 * Maps a graph property name to a value extraction specification.
 */
export interface PropertyMapping {
  /** Name of the property in the graph */
  property: string;

  /** How to extract the value */
  source: ValueExtractor | string;

  /** Whether this property is required */
  required?: boolean;
}

/**
 * Specifies a node merge key - the properties used to identify a unique node.
 */
export interface MergeKeySpec {
  /** Property name in the graph */
  property: string;

  /** Path to the value in the event */
  path: string;
}

/**
 * Specification for writing a node to the graph.
 */
export interface NodeWriteSpec {
  /** Node label (e.g., "Transaction", "User", "Event") */
  label: string;

  /** Merge key(s) to uniquely identify the node */
  mergeKey: MergeKeySpec | MergeKeySpec[];

  /** Properties to set on the node */
  properties: PropertyMapping[];

  /** Optional condition - only write if this path resolves to truthy value */
  condition?: string;

  /** Optional alias for referencing this node in relationships */
  alias?: string;
}

/**
 * Reference to a node endpoint for a relationship.
 */
export interface NodeRef {
  /** Node label */
  label: string;

  /** Merge key property name */
  keyProperty: string;

  /** Path to the key value in the event */
  keyPath: string;
}

/**
 * Specification for writing a relationship to the graph.
 */
export interface RelationshipWriteSpec {
  /** Relationship type (e.g., "BELONGS_TO", "GENERATED") */
  type: string;

  /** From node reference */
  from: NodeRef;

  /** To node reference */
  to: NodeRef;

  /** Properties to set on the relationship */
  properties?: PropertyMapping[];

  /** Optional condition - only write if this path resolves to truthy value */
  condition?: string;
}

/**
 * Complete mapping specification for an event type.
 */
export interface EventMapping {
  /** Event type this mapping applies to */
  eventType: string;

  /** Version of this mapping (for backwards compatibility) */
  version: string;

  /** Description of what this mapping does */
  description?: string;

  /** Node write specifications */
  nodeWrites: NodeWriteSpec[];

  /** Relationship write specifications */
  relationshipWrites: RelationshipWriteSpec[];

  /** Optional: global condition - skip entire mapping if false */
  condition?: string;
}

/**
 * Validation result for a mapping.
 */
export interface MappingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// MAPPING VALIDATION
// =============================================================================

/**
 * Validates that a value extractor is well-formed.
 */
function validateValueExtractor(
  extractor: ValueExtractor | string,
  context: string
): string[] {
  const errors: string[] = [];

  if (typeof extractor === 'string') {
    if (!extractor.trim()) {
      errors.push(`${context}: path cannot be empty`);
    }
    return errors;
  }

  if (!extractor.path || typeof extractor.path !== 'string') {
    errors.push(`${context}: path is required and must be a string`);
  }

  if (extractor.transform) {
    const validTransforms = ['toLowerCase', 'toUpperCase', 'toString', 'toNumber', 'toBoolean', 'toTimestamp'];
    if (!validTransforms.includes(extractor.transform)) {
      errors.push(`${context}: invalid transform "${extractor.transform}", must be one of ${validTransforms.join(', ')}`);
    }
  }

  return errors;
}

/**
 * Validates a property mapping.
 */
function validatePropertyMapping(
  mapping: PropertyMapping,
  index: number,
  context: string
): string[] {
  const errors: string[] = [];

  if (!mapping.property || typeof mapping.property !== 'string') {
    errors.push(`${context}[${index}]: property name is required`);
  }

  if (!mapping.source) {
    errors.push(`${context}[${index}]: source is required`);
  } else {
    errors.push(...validateValueExtractor(mapping.source, `${context}[${index}].source`));
  }

  return errors;
}

/**
 * Validates a merge key specification.
 */
function validateMergeKeySpec(
  spec: MergeKeySpec,
  index: number,
  context: string
): string[] {
  const errors: string[] = [];

  if (!spec.property || typeof spec.property !== 'string') {
    errors.push(`${context}[${index}]: property is required`);
  }

  if (!spec.path || typeof spec.path !== 'string') {
    errors.push(`${context}[${index}]: path is required`);
  }

  return errors;
}

/**
 * Validates a node write specification.
 */
function validateNodeWriteSpec(
  spec: NodeWriteSpec,
  index: number
): string[] {
  const errors: string[] = [];
  const context = `nodeWrites[${index}]`;

  if (!spec.label || typeof spec.label !== 'string') {
    errors.push(`${context}: label is required`);
  }

  if (!spec.mergeKey) {
    errors.push(`${context}: mergeKey is required`);
  } else {
    const mergeKeys = Array.isArray(spec.mergeKey) ? spec.mergeKey : [spec.mergeKey];
    if (mergeKeys.length === 0) {
      errors.push(`${context}: at least one merge key is required`);
    }
    mergeKeys.forEach((key, keyIndex) => {
      errors.push(...validateMergeKeySpec(key, keyIndex, `${context}.mergeKey`));
    });
  }

  if (!Array.isArray(spec.properties)) {
    errors.push(`${context}: properties must be an array`);
  } else {
    spec.properties.forEach((prop, propIndex) => {
      errors.push(...validatePropertyMapping(prop, propIndex, `${context}.properties`));
    });
  }

  return errors;
}

/**
 * Validates a node reference.
 */
function validateNodeRef(
  ref: NodeRef,
  fieldName: string,
  context: string
): string[] {
  const errors: string[] = [];

  if (!ref) {
    errors.push(`${context}: ${fieldName} is required`);
    return errors;
  }

  if (!ref.label || typeof ref.label !== 'string') {
    errors.push(`${context}.${fieldName}: label is required`);
  }

  if (!ref.keyProperty || typeof ref.keyProperty !== 'string') {
    errors.push(`${context}.${fieldName}: keyProperty is required`);
  }

  if (!ref.keyPath || typeof ref.keyPath !== 'string') {
    errors.push(`${context}.${fieldName}: keyPath is required`);
  }

  return errors;
}

/**
 * Validates a relationship write specification.
 */
function validateRelationshipWriteSpec(
  spec: RelationshipWriteSpec,
  index: number
): string[] {
  const errors: string[] = [];
  const context = `relationshipWrites[${index}]`;

  if (!spec.type || typeof spec.type !== 'string') {
    errors.push(`${context}: type is required`);
  }

  errors.push(...validateNodeRef(spec.from, 'from', context));
  errors.push(...validateNodeRef(spec.to, 'to', context));

  if (spec.properties && Array.isArray(spec.properties)) {
    spec.properties.forEach((prop, propIndex) => {
      errors.push(...validatePropertyMapping(prop, propIndex, `${context}.properties`));
    });
  }

  return errors;
}

/**
 * Validates a complete event mapping.
 */
export function validateMapping(mapping: unknown): MappingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!mapping || typeof mapping !== 'object') {
    return { valid: false, errors: ['Mapping must be an object'], warnings: [] };
  }

  const m = mapping as Record<string, unknown>;

  // Required fields
  if (!m.eventType || typeof m.eventType !== 'string') {
    errors.push('eventType is required and must be a string');
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push('version is required and must be a string');
  }

  // Node writes
  if (!Array.isArray(m.nodeWrites)) {
    errors.push('nodeWrites must be an array');
  } else {
    (m.nodeWrites as NodeWriteSpec[]).forEach((spec, index) => {
      errors.push(...validateNodeWriteSpec(spec, index));
    });

    if (m.nodeWrites.length === 0) {
      warnings.push('No node writes defined - this mapping will not create any nodes');
    }
  }

  // Relationship writes
  if (!Array.isArray(m.relationshipWrites)) {
    errors.push('relationshipWrites must be an array');
  } else {
    (m.relationshipWrites as RelationshipWriteSpec[]).forEach((spec, index) => {
      errors.push(...validateRelationshipWriteSpec(spec, index));
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// MAPPING LOADING
// =============================================================================

/**
 * Cache for loaded mappings.
 */
const mappingCache = new Map<string, EventMapping>();

/**
 * Loads and parses a single mapping file.
 */
export function loadMappingFile(filePath: string): EventMapping {
  const content = fs.readFileSync(filePath, 'utf-8');
  const mapping = JSON.parse(content) as EventMapping;

  const validation = validateMapping(mapping);
  if (!validation.valid) {
    throw new Error(
      `Invalid mapping file ${filePath}:\n${validation.errors.join('\n')}`
    );
  }

  if (validation.warnings.length > 0) {
    console.warn(`Mapping warnings for ${filePath}:\n${validation.warnings.join('\n')}`);
  }

  return mapping;
}

/**
 * Loads all mapping files from a directory.
 * Expects files named "{eventType}.json" or "{eventType}.mapping.json".
 */
export function loadMappingsFromDirectory(dirPath: string): Map<string, EventMapping> {
  const mappings = new Map<string, EventMapping>();

  if (!fs.existsSync(dirPath)) {
    console.warn(`Mapping directory does not exist: ${dirPath}`);
    return mappings;
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(dirPath, file);

    try {
      const mapping = loadMappingFile(filePath);
      mappings.set(mapping.eventType, mapping);
      mappingCache.set(mapping.eventType, mapping);
      console.log(`Loaded mapping for event type: ${mapping.eventType}`);
    } catch (error) {
      console.error(`Failed to load mapping file ${file}:`, error);
    }
  }

  return mappings;
}

/**
 * Gets a mapping for a specific event type.
 * First checks the cache, then attempts to load from the default directory.
 */
export function getMappingForEventType(
  eventType: string,
  mappingsDir?: string
): EventMapping | null {
  // Check cache first
  if (mappingCache.has(eventType)) {
    return mappingCache.get(eventType)!;
  }

  // Try to load from directory if provided
  if (mappingsDir) {
    const possibleFiles = [
      path.join(mappingsDir, `${eventType}.json`),
      path.join(mappingsDir, `${eventType}.mapping.json`),
    ];

    for (const filePath of possibleFiles) {
      if (fs.existsSync(filePath)) {
        try {
          const mapping = loadMappingFile(filePath);
          mappingCache.set(eventType, mapping);
          return mapping;
        } catch (error) {
          console.error(`Failed to load mapping for ${eventType}:`, error);
        }
      }
    }
  }

  return null;
}

/**
 * Clears the mapping cache.
 * Useful for testing or hot-reloading mappings.
 */
export function clearMappingCache(): void {
  mappingCache.clear();
}

/**
 * Registers a mapping programmatically (useful for testing).
 */
export function registerMapping(mapping: EventMapping): void {
  const validation = validateMapping(mapping);
  if (!validation.valid) {
    throw new Error(
      `Invalid mapping:\n${validation.errors.join('\n')}`
    );
  }

  mappingCache.set(mapping.eventType, mapping);
}

/**
 * Gets all currently loaded mappings.
 */
export function getAllMappings(): Map<string, EventMapping> {
  return new Map(mappingCache);
}

// =============================================================================
// UTILITY TYPES FOR MAPPING SPEC
// =============================================================================

/**
 * Helper to create a simple path-based value extractor.
 */
export function pathExtractor(path: string): ValueExtractor {
  return { path };
}

/**
 * Helper to create a value extractor with a default.
 */
export function pathWithDefault(path: string, defaultValue: unknown): ValueExtractor {
  return { path, default: defaultValue };
}

/**
 * Helper to create a transformed value extractor.
 */
export function pathWithTransform(
  path: string,
  transform: ValueExtractor['transform']
): ValueExtractor {
  const extractor: ValueExtractor = { path };
  if (transform !== undefined) {
    extractor.transform = transform;
  }
  return extractor;
}
