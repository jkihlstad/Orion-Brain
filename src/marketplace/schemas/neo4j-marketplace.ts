/**
 * Marketplace Neo4j Graph Model
 *
 * Type definitions and Cypher queries for marketplace graph data.
 * Defines nodes for businesses, offerings, proof claims, and search sessions.
 *
 * @version 1.0.0
 */

// =============================================================================
// SCHEMA VERSION
// =============================================================================

export const MARKETPLACE_NEO4J_SCHEMA_VERSION = 1;

// =============================================================================
// NODE LABELS
// =============================================================================

export const MARKETPLACE_NODE_LABELS = {
  BUSINESS: 'Business',
  OFFERING: 'Offering',
  PROOF_CLAIM: 'ProofClaim',
  SEARCH_SESSION: 'SearchSession',
} as const;

export type MarketplaceNodeLabel =
  (typeof MARKETPLACE_NODE_LABELS)[keyof typeof MARKETPLACE_NODE_LABELS];

// =============================================================================
// RELATIONSHIP TYPES
// =============================================================================

export const MARKETPLACE_RELATIONSHIP_TYPES = {
  OWNS_BUSINESS: 'OWNS_BUSINESS',
  OFFERS: 'OFFERS',
  HAS_PROOF: 'HAS_PROOF',
  VERIFIED_BY: 'VERIFIED_BY',
  SEARCHED: 'SEARCHED',
  CLICKED_RESULT: 'CLICKED_RESULT',
  TAGGED_WITH: 'TAGGED_WITH',
} as const;

export type MarketplaceRelationshipType =
  (typeof MARKETPLACE_RELATIONSHIP_TYPES)[keyof typeof MARKETPLACE_RELATIONSHIP_TYPES];

// =============================================================================
// NODE TYPE DEFINITIONS
// =============================================================================

/**
 * Business node - represents a marketplace business profile.
 */
export interface BusinessNode {
  /** Unique business identifier */
  businessId: string;

  /** Owner user ID */
  ownerId: string;

  /** Business name */
  name: string;

  /** Business description */
  description: string | null;

  /** Primary category */
  primaryCategory: string;

  /** Tags (JSON stringified array) */
  tagsJson: string;

  /** Service area type */
  serviceAreaType: 'radius' | 'regions' | 'remote' | null;

  /** Service area center lat */
  serviceAreaLat: number | null;

  /** Service area center lng */
  serviceAreaLng: number | null;

  /** Service area radius miles */
  serviceAreaRadiusMiles: number | null;

  /** Service area regions (JSON array) */
  serviceAreaRegionsJson: string | null;

  /** Business status */
  status: 'draft' | 'active' | 'suspended';

  /** Is verified business */
  isVerified: boolean;

  /** Has opted into proof sharing */
  proofSharingEnabled: boolean;

  /** Total verified proof count */
  verifiedProofCount: number;

  /** Total completions count */
  totalCompletions: number;

  /** Last verified proof timestamp */
  lastVerifiedAt: number | null;

  /** Creation timestamp */
  createdAt: number;

  /** Update timestamp */
  updatedAt: number;

  /** LanceDB row ID for vector lookup */
  lancedbRowId: string | null;

  /** Schema version */
  schemaVersion: number;
}

/**
 * Offering node - represents a specific product/service offered.
 */
export interface OfferingNode {
  /** Unique offering identifier */
  offeringId: string;

  /** Business ID that owns this offering */
  businessId: string;

  /** Offering title */
  title: string;

  /** Offering description */
  description: string | null;

  /** Offering type */
  offeringType: 'service' | 'product' | 'consultation';

  /** Tags (JSON stringified array) */
  tagsJson: string;

  /** Price type */
  priceType: 'fixed' | 'hourly' | 'quote' | 'free' | null;

  /** Price amount (cents) */
  priceAmountCents: number | null;

  /** Price currency */
  priceCurrency: string | null;

  /** Offering status */
  status: 'active' | 'inactive';

  /** Creation timestamp */
  createdAt: number;

  /** Update timestamp */
  updatedAt: number;

  /** LanceDB row ID for vector lookup */
  lancedbRowId: string | null;

  /** Schema version */
  schemaVersion: number;
}

/**
 * ProofClaim node - represents evidence of work performed.
 */
export interface ProofClaimNode {
  /** Unique claim identifier */
  claimId: string;

  /** Business ID that owns this claim */
  businessId: string;

  /** Type of proof */
  proofType: 'completion' | 'certification' | 'portfolio' | 'testimonial';

  /** Claim title */
  title: string;

  /** Claim description */
  description: string | null;

  /** Related service tags (JSON array) */
  serviceTagsJson: string;

  /** Client reference (anonymized) */
  clientReference: string | null;

  /** When the work was completed */
  completedAt: number | null;

  /** Verification status */
  status: 'submitted' | 'verified' | 'rejected';

  /** Who verified (admin user ID) */
  verifiedBy: string | null;

  /** When it was verified */
  verifiedAt: number | null;

  /** Rejection reason (if rejected) */
  rejectionReason: string | null;

  /** Artifact blob IDs (JSON array) */
  artifactBlobIdsJson: string | null;

  /** Submission timestamp */
  submittedAt: number;

  /** Schema version */
  schemaVersion: number;
}

/**
 * SearchSession node - represents a user's search session for analytics.
 */
export interface SearchSessionNode {
  /** Unique search session identifier */
  searchSessionId: string;

  /** User who performed the search (null for anonymous) */
  userId: string | null;

  /** Search query */
  query: string;

  /** Applied filters (JSON) */
  filtersJson: string | null;

  /** User location lat */
  userLocationLat: number | null;

  /** User location lng */
  userLocationLng: number | null;

  /** Number of results returned */
  resultCount: number;

  /** Top result business IDs (JSON array) */
  topResultIdsJson: string;

  /** Processing time in ms */
  processingTimeMs: number | null;

  /** Search timestamp */
  searchedAt: number;

  /** Schema version */
  schemaVersion: number;
}

// =============================================================================
// RELATIONSHIP PROPERTY TYPES
// =============================================================================

/**
 * Properties for OWNS_BUSINESS relationship.
 */
export interface OwnsBusinessRelProps {
  /** When the business was created */
  createdAt: number;
}

/**
 * Properties for OFFERS relationship.
 */
export interface OffersRelProps {
  /** When the offering was created */
  createdAt: number;

  /** Display order */
  displayOrder: number;
}

/**
 * Properties for HAS_PROOF relationship.
 */
export interface HasProofRelProps {
  /** When the proof was submitted */
  submittedAt: number;
}

/**
 * Properties for VERIFIED_BY relationship.
 */
export interface VerifiedByRelProps {
  /** When it was verified */
  verifiedAt: number;

  /** Verification notes */
  notes: string | null;
}

/**
 * Properties for CLICKED_RESULT relationship.
 */
export interface ClickedResultRelProps {
  /** Position in results list */
  resultPosition: number;

  /** When clicked */
  clickedAt: number;

  /** Offering ID if clicked specific offering */
  offeringId: string | null;
}

// =============================================================================
// CYPHER SCHEMA CREATION QUERIES
// =============================================================================

export const MARKETPLACE_SCHEMA_CREATION_QUERIES = {
  constraints: [
    `CREATE CONSTRAINT marketplace_business_id_unique IF NOT EXISTS
     FOR (b:Business) REQUIRE b.businessId IS UNIQUE`,

    `CREATE CONSTRAINT marketplace_offering_id_unique IF NOT EXISTS
     FOR (o:Offering) REQUIRE o.offeringId IS UNIQUE`,

    `CREATE CONSTRAINT marketplace_proof_claim_id_unique IF NOT EXISTS
     FOR (p:ProofClaim) REQUIRE p.claimId IS UNIQUE`,

    `CREATE CONSTRAINT marketplace_search_session_id_unique IF NOT EXISTS
     FOR (s:SearchSession) REQUIRE s.searchSessionId IS UNIQUE`,
  ],

  indexes: [
    // Business indexes
    `CREATE INDEX marketplace_business_owner IF NOT EXISTS FOR (b:Business) ON (b.ownerId)`,
    `CREATE INDEX marketplace_business_status IF NOT EXISTS FOR (b:Business) ON (b.status)`,
    `CREATE INDEX marketplace_business_category IF NOT EXISTS FOR (b:Business) ON (b.primaryCategory)`,
    `CREATE INDEX marketplace_business_verified IF NOT EXISTS FOR (b:Business) ON (b.isVerified)`,
    `CREATE INDEX marketplace_business_proof_sharing IF NOT EXISTS FOR (b:Business) ON (b.proofSharingEnabled)`,

    // Offering indexes
    `CREATE INDEX marketplace_offering_business IF NOT EXISTS FOR (o:Offering) ON (o.businessId)`,
    `CREATE INDEX marketplace_offering_status IF NOT EXISTS FOR (o:Offering) ON (o.status)`,
    `CREATE INDEX marketplace_offering_type IF NOT EXISTS FOR (o:Offering) ON (o.offeringType)`,

    // ProofClaim indexes
    `CREATE INDEX marketplace_proof_business IF NOT EXISTS FOR (p:ProofClaim) ON (p.businessId)`,
    `CREATE INDEX marketplace_proof_status IF NOT EXISTS FOR (p:ProofClaim) ON (p.status)`,
    `CREATE INDEX marketplace_proof_type IF NOT EXISTS FOR (p:ProofClaim) ON (p.proofType)`,

    // SearchSession indexes
    `CREATE INDEX marketplace_search_user IF NOT EXISTS FOR (s:SearchSession) ON (s.userId)`,
    `CREATE INDEX marketplace_search_timestamp IF NOT EXISTS FOR (s:SearchSession) ON (s.searchedAt)`,

    // Composite indexes
    `CREATE INDEX marketplace_business_owner_status IF NOT EXISTS FOR (b:Business) ON (b.ownerId, b.status)`,
    `CREATE INDEX marketplace_proof_business_status IF NOT EXISTS FOR (p:ProofClaim) ON (p.businessId, p.status)`,
  ],
} as const;

// =============================================================================
// CYPHER QUERY TEMPLATES
// =============================================================================

export const MARKETPLACE_CYPHER_QUERIES = {
  // ==========================================================================
  // NODE UPSERT QUERIES
  // ==========================================================================

  upsertBusiness: `
    MERGE (b:Business {businessId: $businessId})
    ON CREATE SET
      b.ownerId = $ownerId,
      b.name = $name,
      b.description = $description,
      b.primaryCategory = $primaryCategory,
      b.tagsJson = $tagsJson,
      b.serviceAreaType = $serviceAreaType,
      b.serviceAreaLat = $serviceAreaLat,
      b.serviceAreaLng = $serviceAreaLng,
      b.serviceAreaRadiusMiles = $serviceAreaRadiusMiles,
      b.serviceAreaRegionsJson = $serviceAreaRegionsJson,
      b.status = $status,
      b.isVerified = $isVerified,
      b.proofSharingEnabled = $proofSharingEnabled,
      b.verifiedProofCount = $verifiedProofCount,
      b.totalCompletions = $totalCompletions,
      b.lastVerifiedAt = $lastVerifiedAt,
      b.createdAt = $createdAt,
      b.updatedAt = $updatedAt,
      b.lancedbRowId = $lancedbRowId,
      b.schemaVersion = $schemaVersion
    ON MATCH SET
      b.name = $name,
      b.description = $description,
      b.primaryCategory = $primaryCategory,
      b.tagsJson = $tagsJson,
      b.serviceAreaType = $serviceAreaType,
      b.serviceAreaLat = $serviceAreaLat,
      b.serviceAreaLng = $serviceAreaLng,
      b.serviceAreaRadiusMiles = $serviceAreaRadiusMiles,
      b.serviceAreaRegionsJson = $serviceAreaRegionsJson,
      b.status = $status,
      b.isVerified = $isVerified,
      b.proofSharingEnabled = $proofSharingEnabled,
      b.verifiedProofCount = $verifiedProofCount,
      b.totalCompletions = $totalCompletions,
      b.lastVerifiedAt = $lastVerifiedAt,
      b.updatedAt = $updatedAt,
      b.lancedbRowId = $lancedbRowId,
      b.schemaVersion = $schemaVersion
    RETURN b
  `,

  upsertOffering: `
    MERGE (o:Offering {offeringId: $offeringId})
    ON CREATE SET
      o.businessId = $businessId,
      o.title = $title,
      o.description = $description,
      o.offeringType = $offeringType,
      o.tagsJson = $tagsJson,
      o.priceType = $priceType,
      o.priceAmountCents = $priceAmountCents,
      o.priceCurrency = $priceCurrency,
      o.status = $status,
      o.createdAt = $createdAt,
      o.updatedAt = $updatedAt,
      o.lancedbRowId = $lancedbRowId,
      o.schemaVersion = $schemaVersion
    ON MATCH SET
      o.title = $title,
      o.description = $description,
      o.offeringType = $offeringType,
      o.tagsJson = $tagsJson,
      o.priceType = $priceType,
      o.priceAmountCents = $priceAmountCents,
      o.priceCurrency = $priceCurrency,
      o.status = $status,
      o.updatedAt = $updatedAt,
      o.lancedbRowId = $lancedbRowId,
      o.schemaVersion = $schemaVersion
    RETURN o
  `,

  upsertProofClaim: `
    MERGE (p:ProofClaim {claimId: $claimId})
    ON CREATE SET
      p.businessId = $businessId,
      p.proofType = $proofType,
      p.title = $title,
      p.description = $description,
      p.serviceTagsJson = $serviceTagsJson,
      p.clientReference = $clientReference,
      p.completedAt = $completedAt,
      p.status = $status,
      p.verifiedBy = $verifiedBy,
      p.verifiedAt = $verifiedAt,
      p.rejectionReason = $rejectionReason,
      p.artifactBlobIdsJson = $artifactBlobIdsJson,
      p.submittedAt = $submittedAt,
      p.schemaVersion = $schemaVersion
    ON MATCH SET
      p.title = $title,
      p.description = $description,
      p.serviceTagsJson = $serviceTagsJson,
      p.clientReference = $clientReference,
      p.completedAt = $completedAt,
      p.status = $status,
      p.verifiedBy = $verifiedBy,
      p.verifiedAt = $verifiedAt,
      p.rejectionReason = $rejectionReason,
      p.artifactBlobIdsJson = $artifactBlobIdsJson,
      p.schemaVersion = $schemaVersion
    RETURN p
  `,

  upsertSearchSession: `
    MERGE (s:SearchSession {searchSessionId: $searchSessionId})
    ON CREATE SET
      s.userId = $userId,
      s.query = $query,
      s.filtersJson = $filtersJson,
      s.userLocationLat = $userLocationLat,
      s.userLocationLng = $userLocationLng,
      s.resultCount = $resultCount,
      s.topResultIdsJson = $topResultIdsJson,
      s.processingTimeMs = $processingTimeMs,
      s.searchedAt = $searchedAt,
      s.schemaVersion = $schemaVersion
    RETURN s
  `,

  // ==========================================================================
  // RELATIONSHIP CREATION QUERIES
  // ==========================================================================

  createUserOwnsBusiness: `
    MATCH (u:User {userId: $userId})
    MATCH (b:Business {businessId: $businessId})
    MERGE (u)-[r:OWNS_BUSINESS]->(b)
    ON CREATE SET r.createdAt = $createdAt
    RETURN r
  `,

  createBusinessOffers: `
    MATCH (b:Business {businessId: $businessId})
    MATCH (o:Offering {offeringId: $offeringId})
    MERGE (b)-[r:OFFERS]->(o)
    ON CREATE SET
      r.createdAt = $createdAt,
      r.displayOrder = $displayOrder
    RETURN r
  `,

  createBusinessHasProof: `
    MATCH (b:Business {businessId: $businessId})
    MATCH (p:ProofClaim {claimId: $claimId})
    MERGE (b)-[r:HAS_PROOF]->(p)
    ON CREATE SET r.submittedAt = $submittedAt
    RETURN r
  `,

  createSearchClickedResult: `
    MATCH (s:SearchSession {searchSessionId: $searchSessionId})
    MATCH (b:Business {businessId: $businessId})
    MERGE (s)-[r:CLICKED_RESULT]->(b)
    ON CREATE SET
      r.resultPosition = $resultPosition,
      r.clickedAt = $clickedAt,
      r.offeringId = $offeringId
    RETURN r
  `,

  // ==========================================================================
  // PROOF QUERY OPERATIONS
  // ==========================================================================

  getVerifiedProofsByBusiness: `
    MATCH (b:Business {businessId: $businessId})-[:HAS_PROOF]->(p:ProofClaim)
    WHERE p.status = 'verified'
    RETURN p
    ORDER BY p.verifiedAt DESC
    LIMIT $limit
  `,

  getProofMetricsByBusinessIds: `
    MATCH (b:Business)
    WHERE b.businessId IN $businessIds AND b.proofSharingEnabled = true
    OPTIONAL MATCH (b)-[:HAS_PROOF]->(p:ProofClaim {status: 'verified'})
    WITH b,
      count(p) as verifiedCount,
      max(p.verifiedAt) as lastVerifiedAt
    RETURN
      b.businessId as businessId,
      verifiedCount,
      b.totalCompletions as totalCompletions,
      lastVerifiedAt
  `,

  getProofClaimsByTags: `
    MATCH (b:Business {businessId: $businessId})-[:HAS_PROOF]->(p:ProofClaim)
    WHERE p.status = 'verified'
    RETURN p, b
    ORDER BY p.verifiedAt DESC
  `,

  // ==========================================================================
  // BUSINESS QUERY OPERATIONS
  // ==========================================================================

  getBusinessByOwner: `
    MATCH (u:User {userId: $userId})-[:OWNS_BUSINESS]->(b:Business)
    RETURN b
    ORDER BY b.createdAt DESC
  `,

  getBusinessWithOfferings: `
    MATCH (b:Business {businessId: $businessId})
    OPTIONAL MATCH (b)-[:OFFERS]->(o:Offering {status: 'active'})
    RETURN b, collect(o) as offerings
  `,

  // ==========================================================================
  // UPDATE PROOF COUNTS
  // ==========================================================================

  updateBusinessProofCounts: `
    MATCH (b:Business {businessId: $businessId})
    OPTIONAL MATCH (b)-[:HAS_PROOF]->(p:ProofClaim {status: 'verified'})
    WITH b, count(p) as verifiedCount, max(p.verifiedAt) as lastVerified
    SET
      b.verifiedProofCount = verifiedCount,
      b.lastVerifiedAt = lastVerified,
      b.updatedAt = $updatedAt
    RETURN b
  `,

  incrementBusinessCompletions: `
    MATCH (b:Business {businessId: $businessId})
    SET
      b.totalCompletions = b.totalCompletions + 1,
      b.updatedAt = $updatedAt
    RETURN b
  `,
} as const;

export type MarketplaceCypherQueryName = keyof typeof MARKETPLACE_CYPHER_QUERIES;
