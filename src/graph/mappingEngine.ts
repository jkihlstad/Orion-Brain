/**
 * Neural Intelligence Platform - Generic Graph Mapping Engine
 *
 * The core engine that transforms events into graph operations based on
 * declarative mapping specifications. This engine is completely generic -
 * all transformation logic comes from the mapping specs, not from code.
 *
 * Features:
 * - Resolves nested property paths from events
 * - Builds deterministic merge keys for graph nodes
 * - Transforms events into graph operations (node/relationship creates)
 * - Supports conditional writes and value transformations
 *
 * @version 1.0.0
 */

import {
  EventMapping,
  NodeWriteSpec,
  RelationshipWriteSpec,
  PropertyMapping,
  ValueExtractor,
  MergeKeySpec,
} from '../contracts/mappings';
import {
  generateNodeMerge,
  generateRelationshipMerge,
  type CypherParams,
} from './cypher';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Kind of graph operation.
 */
export type GraphOpKind = 'node' | 'rel';

/**
 * A graph operation to be executed.
 */
export interface GraphOperation {
  /** Type of operation */
  kind: GraphOpKind;

  /** Generated Cypher query */
  cypher: string;

  /** Parameters for the query */
  params: CypherParams;

  /** Optional label/type for debugging */
  label?: string;

  /** Optional alias for referencing in subsequent operations */
  alias?: string;
}

/**
 * Result of mapping an event.
 */
export interface MappingResult {
  /** Whether mapping was successful */
  success: boolean;

  /** Generated graph operations */
  operations: GraphOperation[];

  /** Errors encountered during mapping */
  errors: string[];

  /** Warnings encountered during mapping */
  warnings: string[];

  /** Event type that was mapped */
  eventType: string;

  /** Mapping version used */
  mappingVersion: string;
}

/**
 * Event object that can be mapped.
 */
export type MappableEvent = Record<string, unknown>;

// =============================================================================
// VALUE RESOLUTION
// =============================================================================

/**
 * Resolves a key path from an event object.
 * Supports nested paths like "payload.transactionId" or "metadata.user.id".
 *
 * @param event - The event object to extract from
 * @param path - Dot-separated path to the value
 * @returns The resolved value or undefined if not found
 */
export function resolveKeyPath(event: MappableEvent, path: string): unknown {
  if (!path) {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = event;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    // Handle array indexing like "items[0]"
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayKey, indexStr] = arrayMatch;
      if (arrayKey === undefined || indexStr === undefined) {
        return undefined;
      }
      const arr = (current as Record<string, unknown>)[arrayKey];
      if (!Array.isArray(arr)) {
        return undefined;
      }
      current = arr[parseInt(indexStr, 10)];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Applies a transform to a value.
 */
function applyTransform(
  value: unknown,
  transform: ValueExtractor['transform']
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  switch (transform) {
    case 'toLowerCase':
      return String(value).toLowerCase();

    case 'toUpperCase':
      return String(value).toUpperCase();

    case 'toString':
      return String(value);

    case 'toNumber':
      const num = Number(value);
      return isNaN(num) ? null : num;

    case 'toBoolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
      }
      return Boolean(value);

    case 'toTimestamp':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.getTime();
      }
      if (value instanceof Date) {
        return value.getTime();
      }
      return null;

    default:
      return value;
  }
}

/**
 * Extracts a value from an event using a ValueExtractor specification.
 */
function extractValue(
  event: MappableEvent,
  extractor: ValueExtractor | string
): unknown {
  if (typeof extractor === 'string') {
    return resolveKeyPath(event, extractor);
  }

  let value = resolveKeyPath(event, extractor.path);

  if (value === undefined && extractor.default !== undefined) {
    value = extractor.default;
  }

  if (value !== undefined && extractor.transform) {
    value = applyTransform(value, extractor.transform);
  }

  return value;
}

/**
 * Evaluates a condition path to determine if an operation should be executed.
 */
function evaluateCondition(event: MappableEvent, conditionPath: string): boolean {
  const value = resolveKeyPath(event, conditionPath);
  return Boolean(value);
}

// =============================================================================
// MERGE KEY BUILDING
// =============================================================================

/**
 * Builds a deterministic merge key from an event based on key specifications.
 * Used to uniquely identify nodes in the graph.
 *
 * @param event - The event object
 * @param keySpecs - The merge key specifications
 * @returns Object mapping property names to values
 */
export function buildMergeKey(
  event: MappableEvent,
  keySpecs: MergeKeySpec | MergeKeySpec[]
): Record<string, unknown> {
  const specs = Array.isArray(keySpecs) ? keySpecs : [keySpecs];
  const result: Record<string, unknown> = {};

  for (const spec of specs) {
    const value = resolveKeyPath(event, spec.path);
    if (value !== undefined && value !== null) {
      result[spec.property] = value;
    }
  }

  return result;
}

/**
 * Generates a deterministic key string from merge key values.
 * Useful for caching or deduplication.
 */
export function generateMergeKeyString(
  label: string,
  mergeKeyValues: Record<string, unknown>
): string {
  const sortedKeys = Object.keys(mergeKeyValues).sort();
  const keyParts = sortedKeys.map(
    (key) => `${key}:${JSON.stringify(mergeKeyValues[key])}`
  );
  return `${label}:{${keyParts.join(',')}}`;
}

// =============================================================================
// PROPERTY EXTRACTION
// =============================================================================

/**
 * Extracts all properties from an event based on property mappings.
 */
function extractProperties(
  event: MappableEvent,
  mappings: PropertyMapping[]
): { properties: Record<string, unknown>; errors: string[] } {
  const properties: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const mapping of mappings) {
    const value = extractValue(event, mapping.source);

    if (value === undefined || value === null) {
      if (mapping.required) {
        errors.push(`Required property "${mapping.property}" is missing (source: ${
          typeof mapping.source === 'string' ? mapping.source : mapping.source.path
        })`);
      }
      continue;
    }

    properties[mapping.property] = value;
  }

  return { properties, errors };
}

// =============================================================================
// NODE OPERATION GENERATION
// =============================================================================

/**
 * Generates a graph operation for a node write specification.
 */
function generateNodeOperation(
  event: MappableEvent,
  spec: NodeWriteSpec
): { operation: GraphOperation | null; errors: string[] } {
  const errors: string[] = [];

  // Check condition if specified
  if (spec.condition && !evaluateCondition(event, spec.condition)) {
    return { operation: null, errors: [] };
  }

  // Build merge key
  const mergeKeyValues = buildMergeKey(event, spec.mergeKey);
  const mergeKeyCount = Object.keys(mergeKeyValues).length;
  const expectedKeyCount = Array.isArray(spec.mergeKey)
    ? spec.mergeKey.length
    : 1;

  if (mergeKeyCount !== expectedKeyCount) {
    errors.push(
      `Node ${spec.label}: missing merge key values (got ${mergeKeyCount}, expected ${expectedKeyCount})`
    );
    return { operation: null, errors };
  }

  // Extract properties
  const { properties, errors: propErrors } = extractProperties(
    event,
    spec.properties
  );
  errors.push(...propErrors.map((e) => `Node ${spec.label}: ${e}`));

  if (errors.length > 0 && errors.some((e) => e.includes('Required property'))) {
    return { operation: null, errors };
  }

  // Generate Cypher
  const { cypher, params } = generateNodeMerge(
    spec.label,
    mergeKeyValues,
    properties
  );

  const operation: GraphOperation = {
    kind: 'node',
    cypher,
    params,
    label: spec.label,
  };
  if (spec.alias !== undefined) {
    operation.alias = spec.alias;
  }
  return {
    operation,
    errors,
  };
}

// =============================================================================
// RELATIONSHIP OPERATION GENERATION
// =============================================================================

/**
 * Generates a graph operation for a relationship write specification.
 */
function generateRelationshipOperation(
  event: MappableEvent,
  spec: RelationshipWriteSpec
): { operation: GraphOperation | null; errors: string[] } {
  const errors: string[] = [];

  // Check condition if specified
  if (spec.condition && !evaluateCondition(event, spec.condition)) {
    return { operation: null, errors: [] };
  }

  // Extract from node key
  const fromKeyValue = resolveKeyPath(event, spec.from.keyPath);
  if (fromKeyValue === undefined || fromKeyValue === null) {
    errors.push(
      `Relationship ${spec.type}: missing from node key (${spec.from.keyPath})`
    );
    return { operation: null, errors };
  }

  // Extract to node key
  const toKeyValue = resolveKeyPath(event, spec.to.keyPath);
  if (toKeyValue === undefined || toKeyValue === null) {
    errors.push(
      `Relationship ${spec.type}: missing to node key (${spec.to.keyPath})`
    );
    return { operation: null, errors };
  }

  // Extract relationship properties
  let properties: Record<string, unknown> = {};
  if (spec.properties) {
    const { properties: props, errors: propErrors } = extractProperties(
      event,
      spec.properties
    );
    properties = props;
    errors.push(...propErrors.map((e) => `Relationship ${spec.type}: ${e}`));
  }

  // Generate Cypher
  const { cypher, params } = generateRelationshipMerge(
    spec.type,
    spec.from.label,
    { [spec.from.keyProperty]: fromKeyValue },
    spec.to.label,
    { [spec.to.keyProperty]: toKeyValue },
    properties
  );

  return {
    operation: {
      kind: 'rel',
      cypher,
      params,
      label: spec.type,
    },
    errors,
  };
}

// =============================================================================
// MAIN MAPPING FUNCTION
// =============================================================================

/**
 * Maps an event to graph operations based on a mapping specification.
 * This is the main entry point for the mapping engine.
 *
 * @param event - The event object to map
 * @param mapping - The mapping specification to apply
 * @returns MappingResult with operations and any errors/warnings
 */
export function mapEventToGraphOps(
  event: MappableEvent,
  mapping: EventMapping
): MappingResult {
  const operations: GraphOperation[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check global condition
  if (mapping.condition && !evaluateCondition(event, mapping.condition)) {
    return {
      success: true,
      operations: [],
      errors: [],
      warnings: [`Global condition "${mapping.condition}" not met, skipping mapping`],
      eventType: mapping.eventType,
      mappingVersion: mapping.version,
    };
  }

  // Process node writes
  for (const nodeSpec of mapping.nodeWrites) {
    const { operation, errors: nodeErrors } = generateNodeOperation(
      event,
      nodeSpec
    );

    errors.push(...nodeErrors);

    if (operation) {
      operations.push(operation);
    }
  }

  // Process relationship writes
  for (const relSpec of mapping.relationshipWrites) {
    const { operation, errors: relErrors } = generateRelationshipOperation(
      event,
      relSpec
    );

    errors.push(...relErrors);

    if (operation) {
      operations.push(operation);
    }
  }

  // Check if we have operations
  if (operations.length === 0 && errors.length === 0) {
    warnings.push('No graph operations generated from mapping');
  }

  // Determine success based on critical errors
  const hasCriticalErrors = errors.some(
    (e) => e.includes('Required property') || e.includes('missing merge key')
  );

  return {
    success: !hasCriticalErrors,
    operations,
    errors,
    warnings,
    eventType: mapping.eventType,
    mappingVersion: mapping.version,
  };
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/**
 * Maps multiple events to graph operations.
 * Useful for batch processing scenarios.
 */
export function mapEventsToGraphOps(
  events: MappableEvent[],
  mapping: EventMapping
): MappingResult[] {
  return events.map((event) => mapEventToGraphOps(event, mapping));
}

/**
 * Collects all operations from multiple mapping results.
 * Useful for executing all operations in a single transaction.
 */
export function collectOperations(
  results: MappingResult[]
): {
  operations: GraphOperation[];
  failedCount: number;
  successCount: number;
} {
  const operations: GraphOperation[] = [];
  let failedCount = 0;
  let successCount = 0;

  for (const result of results) {
    if (result.success) {
      operations.push(...result.operations);
      successCount++;
    } else {
      failedCount++;
    }
  }

  return { operations, failedCount, successCount };
}

// =============================================================================
// DEDUPLICATION
// =============================================================================

/**
 * Deduplicates node operations based on their merge keys.
 * Later operations for the same node will override earlier ones.
 */
export function deduplicateNodeOperations(
  operations: GraphOperation[]
): GraphOperation[] {
  const nodeOps = new Map<string, GraphOperation>();
  const relOps: GraphOperation[] = [];

  for (const op of operations) {
    if (op.kind === 'rel') {
      relOps.push(op);
      continue;
    }

    // For node operations, use label + merge key as dedup key
    const label = op.label || 'unknown';
    // Extract merge key from params (the first set of params are usually the merge key)
    const keyParts = Object.entries(op.params)
      .filter(([k]) => k.startsWith('key_') || k.startsWith('mergeKey_'))
      .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
      .join(',');

    const dedupKey = `${label}:${keyParts}`;
    nodeOps.set(dedupKey, op);
  }

  return [...nodeOps.values(), ...relOps];
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export {
  extractValue,
  extractProperties,
  evaluateCondition,
};
