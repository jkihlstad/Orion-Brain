/**
 * Neural Intelligence Platform - Cypher Query Generation Helpers
 *
 * Provides utilities for generating safe, parameterized Cypher queries
 * for Neo4j graph operations. All queries use parameters to prevent
 * injection attacks and ensure proper escaping.
 *
 * Features:
 * - Node MERGE query generation
 * - Relationship MERGE query generation
 * - Label and property name escaping
 * - Parameterized query building
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Parameters for a Cypher query.
 */
export type CypherParams = Record<string, unknown>;

/**
 * Result of generating a Cypher query.
 */
export interface CypherQuery {
  /** The Cypher query string */
  cypher: string;

  /** Parameters for the query */
  params: CypherParams;
}

/**
 * Options for node merge generation.
 */
export interface NodeMergeOptions {
  /** Variable name for the node in the query */
  variable?: string;

  /** Return the node after merge */
  returnNode?: boolean;

  /** Include ON CREATE and ON MATCH SET clauses */
  includeSetClauses?: boolean;
}

/**
 * Options for relationship merge generation.
 */
export interface RelationshipMergeOptions {
  /** Variable name for the relationship in the query */
  variable?: string;

  /** Variable name for the from node */
  fromVariable?: string;

  /** Variable name for the to node */
  toVariable?: string;

  /** Return the relationship after merge */
  returnRel?: boolean;
}

// =============================================================================
// ESCAPING HELPERS
// =============================================================================

/**
 * Escapes a label or relationship type for safe use in Cypher.
 * Neo4j labels should only contain alphanumeric characters and underscores.
 * Backticks are used for labels with special characters.
 */
export function escapeLabel(label: string): string {
  // If label contains only safe characters, return as-is
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(label)) {
    return label;
  }

  // Escape backticks within the label and wrap in backticks
  const escaped = label.replace(/`/g, '``');
  return `\`${escaped}\``;
}

/**
 * Escapes a property name for safe use in Cypher.
 */
export function escapePropertyName(name: string): string {
  // If name contains only safe characters, return as-is
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return name;
  }

  // Escape backticks within the name and wrap in backticks
  const escaped = name.replace(/`/g, '``');
  return `\`${escaped}\``;
}

/**
 * Validates that a label is safe for use.
 */
export function isValidLabel(label: string): boolean {
  return typeof label === 'string' && label.length > 0 && label.length <= 65536;
}

/**
 * Validates that a property name is safe for use.
 */
export function isValidPropertyName(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 65536;
}

// =============================================================================
// PARAMETER HELPERS
// =============================================================================

/**
 * Generates a unique parameter name from a property name.
 * Prefixes help distinguish different types of parameters.
 */
function paramName(prefix: string, name: string, index?: number): string {
  const safeName = name.replace(/[^A-Za-z0-9_]/g, '_');
  return index !== undefined ? `${prefix}_${safeName}_${index}` : `${prefix}_${safeName}`;
}

/**
 * Builds a parameter map from key-value pairs with a prefix.
 * Exported for use in advanced query building scenarios.
 */
export function buildParams(
  prefix: string,
  values: Record<string, unknown>
): CypherParams {
  const params: CypherParams = {};
  for (const [key, value] of Object.entries(values)) {
    params[paramName(prefix, key)] = value;
  }
  return params;
}

// =============================================================================
// NODE MERGE GENERATION
// =============================================================================

/**
 * Generates a MERGE query for creating or updating a node.
 *
 * @param label - Node label
 * @param mergeKey - Properties to use as the merge key
 * @param properties - Additional properties to set on the node
 * @param options - Optional configuration
 * @returns CypherQuery with the query string and parameters
 *
 * @example
 * ```typescript
 * const { cypher, params } = generateNodeMerge(
 *   'Transaction',
 *   { transactionId: 'tx-123' },
 *   { amount: 100, currency: 'USD' }
 * );
 * // cypher: "MERGE (n:Transaction {transactionId: $key_transactionId})
 * //          ON CREATE SET n.amount = $prop_amount, n.currency = $prop_currency
 * //          ON MATCH SET n.amount = $prop_amount, n.currency = $prop_currency"
 * // params: { key_transactionId: 'tx-123', prop_amount: 100, prop_currency: 'USD' }
 * ```
 */
export function generateNodeMerge(
  label: string,
  mergeKey: Record<string, unknown>,
  properties: Record<string, unknown> = {},
  options: NodeMergeOptions = {}
): CypherQuery {
  const {
    variable = 'n',
    returnNode = false,
    includeSetClauses = true,
  } = options;

  if (!isValidLabel(label)) {
    throw new Error(`Invalid label: ${label}`);
  }

  const escapedLabel = escapeLabel(label);
  const params: CypherParams = {};

  // Build merge key clause
  const mergeKeyParts: string[] = [];
  for (const [key, value] of Object.entries(mergeKey)) {
    if (!isValidPropertyName(key)) {
      throw new Error(`Invalid property name: ${key}`);
    }
    const pName = paramName('key', key);
    params[pName] = value;
    mergeKeyParts.push(`${escapePropertyName(key)}: $${pName}`);
  }

  const mergeKeyClause = mergeKeyParts.join(', ');

  // Build property SET clauses
  const setParts: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (!isValidPropertyName(key)) {
      throw new Error(`Invalid property name: ${key}`);
    }
    const pName = paramName('prop', key);
    params[pName] = value;
    setParts.push(`${variable}.${escapePropertyName(key)} = $${pName}`);
  }

  // Build the query
  let cypher = `MERGE (${variable}:${escapedLabel} {${mergeKeyClause}})`;

  if (includeSetClauses && setParts.length > 0) {
    const setClause = setParts.join(', ');
    cypher += `\nON CREATE SET ${setClause}`;
    cypher += `\nON MATCH SET ${setClause}`;
  }

  if (returnNode) {
    cypher += `\nRETURN ${variable}`;
  }

  return { cypher, params };
}

/**
 * Generates a simple MERGE query without ON CREATE/ON MATCH clauses.
 * Uses SET for all properties after the MERGE.
 */
export function generateSimpleNodeMerge(
  label: string,
  mergeKey: Record<string, unknown>,
  properties: Record<string, unknown> = {},
  options: NodeMergeOptions = {}
): CypherQuery {
  const { variable = 'n', returnNode = false } = options;

  if (!isValidLabel(label)) {
    throw new Error(`Invalid label: ${label}`);
  }

  const escapedLabel = escapeLabel(label);
  const params: CypherParams = {};

  // Build merge key clause
  const mergeKeyParts: string[] = [];
  for (const [key, value] of Object.entries(mergeKey)) {
    const pName = paramName('key', key);
    params[pName] = value;
    mergeKeyParts.push(`${escapePropertyName(key)}: $${pName}`);
  }

  // Build all property parts (merge key + additional)
  const allParts: string[] = [];
  for (const [key, value] of Object.entries({ ...mergeKey, ...properties })) {
    const pName = paramName('all', key);
    params[pName] = value;
    allParts.push(`${variable}.${escapePropertyName(key)} = $${pName}`);
  }

  let cypher = `MERGE (${variable}:${escapedLabel} {${mergeKeyParts.join(', ')}})`;

  if (allParts.length > 0) {
    cypher += `\nSET ${allParts.join(', ')}`;
  }

  if (returnNode) {
    cypher += `\nRETURN ${variable}`;
  }

  return { cypher, params };
}

// =============================================================================
// RELATIONSHIP MERGE GENERATION
// =============================================================================

/**
 * Generates a MERGE query for creating or updating a relationship.
 *
 * @param relType - Relationship type
 * @param fromLabel - Label of the source node
 * @param fromKey - Merge key for the source node
 * @param toLabel - Label of the target node
 * @param toKey - Merge key for the target node
 * @param properties - Properties to set on the relationship
 * @param options - Optional configuration
 * @returns CypherQuery with the query string and parameters
 *
 * @example
 * ```typescript
 * const { cypher, params } = generateRelationshipMerge(
 *   'BELONGS_TO',
 *   'Transaction', { transactionId: 'tx-123' },
 *   'User', { userId: 'user-456' },
 *   { createdAt: 1704067200000 }
 * );
 * ```
 */
export function generateRelationshipMerge(
  relType: string,
  fromLabel: string,
  fromKey: Record<string, unknown>,
  toLabel: string,
  toKey: Record<string, unknown>,
  properties: Record<string, unknown> = {},
  options: RelationshipMergeOptions = {}
): CypherQuery {
  const {
    variable = 'r',
    fromVariable = 'a',
    toVariable = 'b',
    returnRel = false,
  } = options;

  if (!isValidLabel(relType)) {
    throw new Error(`Invalid relationship type: ${relType}`);
  }
  if (!isValidLabel(fromLabel)) {
    throw new Error(`Invalid from label: ${fromLabel}`);
  }
  if (!isValidLabel(toLabel)) {
    throw new Error(`Invalid to label: ${toLabel}`);
  }

  const escapedRelType = escapeLabel(relType);
  const escapedFromLabel = escapeLabel(fromLabel);
  const escapedToLabel = escapeLabel(toLabel);
  const params: CypherParams = {};

  // Build from node match
  const fromKeyParts: string[] = [];
  for (const [key, value] of Object.entries(fromKey)) {
    const pName = paramName('from', key);
    params[pName] = value;
    fromKeyParts.push(`${escapePropertyName(key)}: $${pName}`);
  }

  // Build to node match
  const toKeyParts: string[] = [];
  for (const [key, value] of Object.entries(toKey)) {
    const pName = paramName('to', key);
    params[pName] = value;
    toKeyParts.push(`${escapePropertyName(key)}: $${pName}`);
  }

  // Build relationship properties
  const relPropParts: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    const pName = paramName('rel', key);
    params[pName] = value;
    relPropParts.push(`${variable}.${escapePropertyName(key)} = $${pName}`);
  }

  // Build the query
  let cypher = `MATCH (${fromVariable}:${escapedFromLabel} {${fromKeyParts.join(', ')}})`;
  cypher += `\nMATCH (${toVariable}:${escapedToLabel} {${toKeyParts.join(', ')}})`;
  cypher += `\nMERGE (${fromVariable})-[${variable}:${escapedRelType}]->(${toVariable})`;

  if (relPropParts.length > 0) {
    const setClause = relPropParts.join(', ');
    cypher += `\nON CREATE SET ${setClause}`;
    cypher += `\nON MATCH SET ${setClause}`;
  }

  if (returnRel) {
    cypher += `\nRETURN ${variable}`;
  }

  return { cypher, params };
}

/**
 * Generates a relationship MERGE that also creates nodes if they don't exist.
 * This is useful when you want to ensure both endpoints exist.
 */
export function generateRelationshipMergeWithNodes(
  relType: string,
  fromLabel: string,
  fromKey: Record<string, unknown>,
  fromProps: Record<string, unknown>,
  toLabel: string,
  toKey: Record<string, unknown>,
  toProps: Record<string, unknown>,
  relProperties: Record<string, unknown> = {},
  options: RelationshipMergeOptions = {}
): CypherQuery {
  const {
    variable = 'r',
    fromVariable = 'a',
    toVariable = 'b',
    returnRel = false,
  } = options;

  const params: CypherParams = {};

  // Build from node
  const fromKeyParts: string[] = [];
  for (const [key, value] of Object.entries(fromKey)) {
    const pName = paramName('fromKey', key);
    params[pName] = value;
    fromKeyParts.push(`${escapePropertyName(key)}: $${pName}`);
  }

  const fromPropParts: string[] = [];
  for (const [key, value] of Object.entries(fromProps)) {
    const pName = paramName('fromProp', key);
    params[pName] = value;
    fromPropParts.push(`${fromVariable}.${escapePropertyName(key)} = $${pName}`);
  }

  // Build to node
  const toKeyParts: string[] = [];
  for (const [key, value] of Object.entries(toKey)) {
    const pName = paramName('toKey', key);
    params[pName] = value;
    toKeyParts.push(`${escapePropertyName(key)}: $${pName}`);
  }

  const toPropParts: string[] = [];
  for (const [key, value] of Object.entries(toProps)) {
    const pName = paramName('toProp', key);
    params[pName] = value;
    toPropParts.push(`${toVariable}.${escapePropertyName(key)} = $${pName}`);
  }

  // Build relationship properties
  const relPropParts: string[] = [];
  for (const [key, value] of Object.entries(relProperties)) {
    const pName = paramName('rel', key);
    params[pName] = value;
    relPropParts.push(`${variable}.${escapePropertyName(key)} = $${pName}`);
  }

  // Build the query
  let cypher = `MERGE (${fromVariable}:${escapeLabel(fromLabel)} {${fromKeyParts.join(', ')}})`;
  if (fromPropParts.length > 0) {
    cypher += `\nON CREATE SET ${fromPropParts.join(', ')}`;
  }

  cypher += `\nMERGE (${toVariable}:${escapeLabel(toLabel)} {${toKeyParts.join(', ')}})`;
  if (toPropParts.length > 0) {
    cypher += `\nON CREATE SET ${toPropParts.join(', ')}`;
  }

  cypher += `\nMERGE (${fromVariable})-[${variable}:${escapeLabel(relType)}]->(${toVariable})`;

  if (relPropParts.length > 0) {
    cypher += `\nON CREATE SET ${relPropParts.join(', ')}`;
    cypher += `\nON MATCH SET ${relPropParts.join(', ')}`;
  }

  if (returnRel) {
    cypher += `\nRETURN ${fromVariable}, ${variable}, ${toVariable}`;
  }

  return { cypher, params };
}

// =============================================================================
// QUERY COMBINATION
// =============================================================================

/**
 * Combines multiple Cypher queries into a single query with shared parameters.
 * Queries are executed sequentially with WITH clauses.
 */
export function combineQueries(queries: CypherQuery[]): CypherQuery {
  if (queries.length === 0) {
    return { cypher: '', params: {} };
  }

  if (queries.length === 1) {
    return queries[0]!;
  }

  const combinedParams: CypherParams = {};
  const cypherParts: string[] = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]!;

    // Add parameters with index prefix to avoid collisions
    for (const [key, value] of Object.entries(query.params)) {
      combinedParams[`q${i}_${key}`] = value;
    }

    // Replace parameter references in cypher
    let cypher = query.cypher;
    for (const key of Object.keys(query.params)) {
      cypher = cypher.replace(new RegExp(`\\$${key}\\b`, 'g'), `$q${i}_${key}`);
    }

    cypherParts.push(cypher);
  }

  // Join with semicolons (for batch execution) or newlines
  const cypher = cypherParts.join('\nWITH 1 as _\n');

  return { cypher, params: combinedParams };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generates a Cypher query for deleting a node and its relationships.
 */
export function generateNodeDelete(
  label: string,
  key: Record<string, unknown>,
  options: { variable?: string; detach?: boolean } = {}
): CypherQuery {
  const { variable = 'n', detach = true } = options;
  const params: CypherParams = {};

  const keyParts: string[] = [];
  for (const [k, v] of Object.entries(key)) {
    const pName = paramName('key', k);
    params[pName] = v;
    keyParts.push(`${escapePropertyName(k)}: $${pName}`);
  }

  const deleteClause = detach ? 'DETACH DELETE' : 'DELETE';
  const cypher = `MATCH (${variable}:${escapeLabel(label)} {${keyParts.join(', ')}})\n${deleteClause} ${variable}`;

  return { cypher, params };
}

/**
 * Generates a Cypher query for matching a node.
 */
export function generateNodeMatch(
  label: string,
  key: Record<string, unknown>,
  options: { variable?: string } = {}
): CypherQuery {
  const { variable = 'n' } = options;
  const params: CypherParams = {};

  const keyParts: string[] = [];
  for (const [k, v] of Object.entries(key)) {
    const pName = paramName('key', k);
    params[pName] = v;
    keyParts.push(`${escapePropertyName(k)}: $${pName}`);
  }

  const cypher = `MATCH (${variable}:${escapeLabel(label)} {${keyParts.join(', ')}})\nRETURN ${variable}`;

  return { cypher, params };
}
