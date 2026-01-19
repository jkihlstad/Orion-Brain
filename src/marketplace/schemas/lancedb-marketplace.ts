/**
 * Marketplace LanceDB Table Schemas
 *
 * Type definitions for marketplace vector tables.
 * Stores business and offering embeddings for semantic search.
 *
 * @version 1.0.0
 */

import { EMBEDDING_DIMENSIONS, SCHEMA_VERSION } from '../../types/common';

// =============================================================================
// TABLE NAMES
// =============================================================================

export const MARKETPLACE_LANCEDB_TABLES = {
  BUSINESS_OFFERINGS: 'marketplace_business_offerings',
} as const;

export type MarketplaceLanceDBTableName =
  (typeof MARKETPLACE_LANCEDB_TABLES)[keyof typeof MARKETPLACE_LANCEDB_TABLES];

// =============================================================================
// BUSINESS OFFERING ROW
// =============================================================================

/**
 * Business offering with semantic embedding for search.
 *
 * Combines business profile data with offering details for unified search.
 * Each row represents a searchable offering from a business.
 */
export interface BusinessOfferingRow {
  /** Unique row identifier */
  id: string;

  /** Business ID (owner of the offering) */
  businessId: string;

  /** Business owner user ID */
  ownerId: string;

  /** Offering ID (null for business-level entry) */
  offeringId: string | null;

  /** Text embedding of combined business + offering description (1536D) */
  textVector: number[];

  /** Business name */
  businessName: string;

  /** Business description */
  businessDescription: string | null;

  /** Primary category */
  primaryCategory: string;

  /** Tags (JSON stringified array) */
  tagsJson: string;

  /** Offering title (null for business-level entry) */
  offeringTitle: string | null;

  /** Offering description */
  offeringDescription: string | null;

  /** Offering type */
  offeringType: 'service' | 'product' | 'consultation' | null;

  /** Service area type */
  serviceAreaType: 'radius' | 'regions' | 'remote' | null;

  /** Service area center lat */
  serviceAreaLat: number | null;

  /** Service area center lng */
  serviceAreaLng: number | null;

  /** Service area radius in miles */
  serviceAreaRadiusMiles: number | null;

  /** Service area regions (JSON stringified array) */
  serviceAreaRegionsJson: string | null;

  /** Business status */
  businessStatus: 'draft' | 'active' | 'suspended';

  /** Is business verified */
  isVerified: boolean;

  /** Has business opted into proof sharing for ranking */
  proofSharingEnabled: boolean;

  /** Verified proof count (for ranking) */
  verifiedProofCount: number;

  /** Total proof completions (for ranking) */
  totalCompletions: number;

  /** Exact tag match count (computed at search time, stored for caching) */
  exactTagMatches: number;

  /** Last verified proof timestamp */
  lastVerifiedAt: number | null;

  /** Row creation timestamp */
  createdAt: number;

  /** Row update timestamp */
  updatedAt: number;

  /** Schema version */
  schemaVersion: string;
}

/**
 * Input for creating a new business offering row.
 */
export interface BusinessOfferingInput
  extends Omit<BusinessOfferingRow, 'id' | 'schemaVersion'> {}

/**
 * Schema definition for LanceDB marketplace_business_offerings table.
 */
export const BUSINESS_OFFERING_SCHEMA = {
  tableName: MARKETPLACE_LANCEDB_TABLES.BUSINESS_OFFERINGS,
  schemaVersion: SCHEMA_VERSION,
  vectorColumns: [
    { name: 'textVector', dimensions: EMBEDDING_DIMENSIONS.TEXT },
  ],
  indexableColumns: [
    'businessId',
    'ownerId',
    'offeringId',
    'primaryCategory',
    'businessStatus',
    'isVerified',
    'proofSharingEnabled',
    'serviceAreaType',
    'createdAt',
    'updatedAt',
  ],
} as const;

// =============================================================================
// SEARCH RESULT TYPES
// =============================================================================

/**
 * Search result with similarity and proof metrics.
 */
export interface MarketplaceSearchResult {
  /** The matched row */
  row: BusinessOfferingRow;

  /** Vector similarity score (0-1) */
  similarity: number;

  /** Distance metric value */
  distance: number;
}
