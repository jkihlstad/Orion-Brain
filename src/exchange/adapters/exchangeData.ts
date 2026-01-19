/**
 * Exchange Data Adapter
 *
 * Provides data access layer for Exchange marketplace:
 * - Business profiles and listings from Neo4j
 * - Evidence/proof metrics from Neo4j
 * - Vector search for listings (via embeddings)
 * - User preferences from Convex
 * - Search analytics storage
 *
 * @version 4.0.0
 */

import type { Env } from "../../env";
import { neo4jCommit, type Neo4jCommitResponse } from "../../neo4j/http";

// =============================================================================
// TYPES
// =============================================================================

export interface BusinessData {
  businessId: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  isVerified: boolean;
  hasStripe: boolean;
  profilePhotoUrl?: string;
  serviceAreaMiles?: number;
  location?: { lat: number; lng: number };
  createdAt: number;
}

export interface ListingData {
  listingId: string;
  businessId: string;
  title: string;
  description: string;
  priceType: "fixed" | "hourly" | "quote";
  priceAmount: number | null;
  category: string;
  skillTags: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessEvidenceMetrics {
  businessId: string;
  verifiedProofsCount: number;
  totalProofsCount: number;
  completedOrdersCount: number;
  averageRating: number | null;
  ratingCount: number;
  daysSinceLastProof: number | null;
  hasRecentActivity: boolean;
  evidenceScore: number;
}

export interface UserSearchPreferences {
  userId: string;
  preferredCategories: string[];
  riskTolerance: "verified_only" | "high_evidence_preferred" | "open_to_new";
  maxDistanceMiles?: number;
  pricePreference?: "budget" | "mid" | "premium";
}

export interface SearchSessionRecord {
  searchSessionId: string;
  userId?: string;
  query: string;
  filters?: Record<string, unknown>;
  resultCount: number;
  topResultIds: string[];
  processingTimeMs: number;
  timestamp: number;
}

export interface ClickRecord {
  searchSessionId: string;
  userId: string;
  businessId: string;
  listingId?: string;
  resultPosition: number;
  timestamp: number;
}

// =============================================================================
// CYPHER QUERIES
// =============================================================================

const CYPHER_QUERIES = {
  // Get business by ID
  getBusinessById: `
    MATCH (b:Business {businessId: $businessId})
    RETURN b {
      .businessId, .name, .description, .category, .tags, .isVerified,
      .hasStripe, .profilePhotoUrl, .serviceAreaMiles, .location, .createdAt
    } as business
  `,

  // Get multiple businesses by IDs
  getBusinessesByIds: `
    MATCH (b:Business)
    WHERE b.businessId IN $businessIds
    RETURN b {
      .businessId, .name, .description, .category, .tags, .isVerified,
      .hasStripe, .profilePhotoUrl, .serviceAreaMiles, .location, .createdAt
    } as business
  `,

  // Get listings for a business
  getListingsByBusinessId: `
    MATCH (b:Business {businessId: $businessId})-[:HAS_LISTING]->(l:Listing)
    WHERE l.isActive = true
    RETURN l {
      .listingId, .businessId, .title, .description, .priceType, .priceAmount,
      .category, .skillTags, .isActive, .createdAt, .updatedAt
    } as listing
    ORDER BY l.updatedAt DESC
  `,

  // Get evidence metrics for businesses
  getEvidenceMetrics: `
    MATCH (b:Business)
    WHERE b.businessId IN $businessIds
    OPTIONAL MATCH (b)-[:HAS_PROOF]->(p:Proof)
    OPTIONAL MATCH (b)-[:COMPLETED_ORDER]->(o:Order)
    OPTIONAL MATCH (o)-[:HAS_REVIEW]->(r:Review)
    WITH b,
         count(DISTINCT p) as totalProofs,
         count(DISTINCT CASE WHEN p.status = 'verified' THEN p END) as verifiedProofs,
         count(DISTINCT o) as completedOrders,
         avg(r.rating) as avgRating,
         count(DISTINCT r) as ratingCount,
         max(p.submittedAt) as lastProofAt
    RETURN {
      businessId: b.businessId,
      verifiedProofsCount: verifiedProofs,
      totalProofsCount: totalProofs,
      completedOrdersCount: completedOrders,
      averageRating: avgRating,
      ratingCount: ratingCount,
      lastProofAt: lastProofAt
    } as metrics
  `,

  // Get proofs for a business
  getProofsByBusinessId: `
    MATCH (b:Business {businessId: $businessId})-[:HAS_PROOF]->(p:Proof)
    RETURN p {
      .proofId, .businessId, .orderId, .taskCategory, .status,
      .artifacts, .checklist, .customerConfirmation, .submittedAt
    } as proof
    ORDER BY p.submittedAt DESC
    LIMIT $limit
  `,

  // Record search session
  recordSearchSession: `
    CREATE (s:SearchSession {
      searchSessionId: $searchSessionId,
      userId: $userId,
      query: $query,
      filters: $filters,
      resultCount: $resultCount,
      topResultIds: $topResultIds,
      processingTimeMs: $processingTimeMs,
      timestamp: $timestamp
    })
    RETURN s.searchSessionId as id
  `,

  // Record click event
  recordClick: `
    MATCH (s:SearchSession {searchSessionId: $searchSessionId})
    CREATE (c:ClickEvent {
      searchSessionId: $searchSessionId,
      userId: $userId,
      businessId: $businessId,
      listingId: $listingId,
      resultPosition: $resultPosition,
      timestamp: $timestamp
    })
    CREATE (s)-[:HAD_CLICK]->(c)
    RETURN c.searchSessionId as id
  `,

  // Search analytics aggregation
  getSearchAnalytics: `
    MATCH (s:SearchSession)
    WHERE s.timestamp >= $startTime AND s.timestamp <= $endTime
    OPTIONAL MATCH (s)-[:HAD_CLICK]->(c:ClickEvent)
    WITH s, collect(c) as clicks
    RETURN {
      totalSearches: count(DISTINCT s),
      totalClicks: size(clicks),
      queries: collect(DISTINCT s.query),
      avgResultCount: avg(s.resultCount),
      avgProcessingTime: avg(s.processingTimeMs)
    } as analytics
  `,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse Neo4j response rows into typed objects.
 */
function parseNeo4jRows<T>(
  response: Neo4jCommitResponse,
  key: string
): T[] {
  const firstResult = response.results[0];
  if (!firstResult?.data) {
    return [];
  }

  const columns = firstResult.columns;
  return firstResult.data
    .map((row) => {
      const idx = columns.indexOf(key);
      return idx >= 0 ? (row.row[idx] as T) : null;
    })
    .filter((item): item is T => item !== null);
}

/**
 * Calculate days since timestamp.
 */
function daysSince(timestamp: number | null): number | null {
  if (!timestamp) return null;
  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

// =============================================================================
// DATA ACCESS FUNCTIONS
// =============================================================================

/**
 * Fetch a single business by ID.
 */
export async function fetchBusinessById(
  env: Env,
  businessId: string
): Promise<BusinessData | null> {
  const response = await neo4jCommit(env, [
    {
      statement: CYPHER_QUERIES.getBusinessById,
      parameters: { businessId },
    },
  ]);

  const businesses = parseNeo4jRows<BusinessData>(response, "business");
  return businesses[0] || null;
}

/**
 * Fetch multiple businesses by IDs.
 */
export async function fetchBusinessesByIds(
  env: Env,
  businessIds: string[]
): Promise<Map<string, BusinessData>> {
  if (businessIds.length === 0) {
    return new Map();
  }

  const response = await neo4jCommit(env, [
    {
      statement: CYPHER_QUERIES.getBusinessesByIds,
      parameters: { businessIds },
    },
  ]);

  const businesses = parseNeo4jRows<BusinessData>(response, "business");
  const businessMap = new Map<string, BusinessData>();

  for (const business of businesses) {
    businessMap.set(business.businessId, business);
  }

  return businessMap;
}

/**
 * Fetch listings for a business.
 */
export async function fetchListingsByBusinessId(
  env: Env,
  businessId: string
): Promise<ListingData[]> {
  const response = await neo4jCommit(env, [
    {
      statement: CYPHER_QUERIES.getListingsByBusinessId,
      parameters: { businessId },
    },
  ]);

  return parseNeo4jRows<ListingData>(response, "listing");
}

/**
 * Fetch evidence metrics for multiple businesses.
 */
export async function fetchEvidenceMetricsBatch(
  env: Env,
  businessIds: string[]
): Promise<Map<string, BusinessEvidenceMetrics>> {
  if (businessIds.length === 0) {
    return new Map();
  }

  const response = await neo4jCommit(env, [
    {
      statement: CYPHER_QUERIES.getEvidenceMetrics,
      parameters: { businessIds },
    },
  ]);

  interface RawMetrics {
    businessId: string;
    verifiedProofsCount: number;
    totalProofsCount: number;
    completedOrdersCount: number;
    averageRating: number | null;
    ratingCount: number;
    lastProofAt: number | null;
  }

  const rawMetrics = parseNeo4jRows<RawMetrics>(response, "metrics");
  const metricsMap = new Map<string, BusinessEvidenceMetrics>();

  for (const raw of rawMetrics) {
    const daysSinceProof = daysSince(raw.lastProofAt);
    const hasRecentActivity = daysSinceProof !== null && daysSinceProof <= 30;

    // Calculate evidence score based on metrics
    let evidenceScore = 0;
    evidenceScore += Math.min(raw.verifiedProofsCount * 4, 30); // Max 30 from proofs
    evidenceScore += raw.completedOrdersCount > 0 ? 10 : 0;
    evidenceScore +=
      raw.averageRating !== null ? (raw.averageRating / 5) * 20 : 0;
    evidenceScore += hasRecentActivity ? 10 : 0;
    evidenceScore = Math.min(evidenceScore, 100) / 100; // Normalize to 0-1

    metricsMap.set(raw.businessId, {
      businessId: raw.businessId,
      verifiedProofsCount: raw.verifiedProofsCount,
      totalProofsCount: raw.totalProofsCount,
      completedOrdersCount: raw.completedOrdersCount,
      averageRating: raw.averageRating,
      ratingCount: raw.ratingCount,
      daysSinceLastProof: daysSinceProof,
      hasRecentActivity,
      evidenceScore,
    });
  }

  return metricsMap;
}

/**
 * Fetch proofs for a business.
 */
export async function fetchProofsByBusinessId(
  env: Env,
  businessId: string,
  limit: number = 50
): Promise<
  Array<{
    proofId: string;
    businessId: string;
    orderId?: string;
    taskCategory: string;
    status: string;
    artifacts?: Array<{ type: string; contentHash: string }>;
    checklist?: Array<{ completed: boolean }>;
    customerConfirmation?: {
      confirmationType: string;
      rating?: number;
      customerVerified: boolean;
      confirmedAt: number;
    };
    submittedAt: number;
  }>
> {
  const response = await neo4jCommit(env, [
    {
      statement: CYPHER_QUERIES.getProofsByBusinessId,
      parameters: { businessId, limit },
    },
  ]);

  return parseNeo4jRows(response, "proof");
}

// =============================================================================
// USER PREFERENCES (CONVEX INTEGRATION)
// =============================================================================

/**
 * Fetch user search preferences from Convex.
 *
 * Note: This calls the Convex HTTP API to fetch user preferences.
 */
export async function fetchUserPreferences(
  env: Env,
  userId: string
): Promise<UserSearchPreferences | null> {
  // Call Convex API to fetch user preferences
  const convexUrl = `${env.CONVEX_INGEST_BASE_URL}/api/query`;

  try {
    const response = await fetch(convexUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CONVEX_GATEWAY_SHARED_SECRET}`,
      },
      body: JSON.stringify({
        path: "exchange:getUserPreferences",
        args: { userId },
      }),
    });

    if (!response.ok) {
      console.warn(
        `[Exchange Convex] Failed to fetch preferences for ${userId}: ${response.status}`
      );
      return null;
    }

    const data = (await response.json()) as {
      value: UserSearchPreferences | null;
    };
    return data.value;
  } catch (error) {
    console.error("[Exchange Convex] Error fetching user preferences:", error);
    return null;
  }
}

// =============================================================================
// ANALYTICS STORAGE
// =============================================================================

/**
 * Record a search session for analytics.
 */
export async function recordSearchSession(
  env: Env,
  record: SearchSessionRecord
): Promise<void> {
  try {
    await neo4jCommit(env, [
      {
        statement: CYPHER_QUERIES.recordSearchSession,
        parameters: {
          searchSessionId: record.searchSessionId,
          userId: record.userId || null,
          query: record.query,
          filters: JSON.stringify(record.filters || {}),
          resultCount: record.resultCount,
          topResultIds: record.topResultIds,
          processingTimeMs: record.processingTimeMs,
          timestamp: record.timestamp,
        },
      },
    ]);
  } catch (error) {
    // Log but don't fail the search if analytics recording fails
    console.error("[Exchange Analytics] Failed to record search session:", error);
  }
}

/**
 * Record a click event for analytics.
 */
export async function recordClickEvent(
  env: Env,
  record: ClickRecord
): Promise<void> {
  try {
    await neo4jCommit(env, [
      {
        statement: CYPHER_QUERIES.recordClick,
        parameters: {
          searchSessionId: record.searchSessionId,
          userId: record.userId,
          businessId: record.businessId,
          listingId: record.listingId || null,
          resultPosition: record.resultPosition,
          timestamp: record.timestamp,
        },
      },
    ]);
  } catch (error) {
    // Log but don't fail if analytics recording fails
    console.error("[Exchange Analytics] Failed to record click:", error);
  }
}

/**
 * Get search analytics for a time range.
 */
export async function getSearchAnalytics(
  env: Env,
  startTime: number,
  endTime: number
): Promise<{
  totalSearches: number;
  totalClicks: number;
  clickThroughRate: number;
  avgResultCount: number;
  avgProcessingTime: number;
}> {
  const response = await neo4jCommit(env, [
    {
      statement: CYPHER_QUERIES.getSearchAnalytics,
      parameters: { startTime, endTime },
    },
  ]);

  interface AnalyticsResult {
    totalSearches: number;
    totalClicks: number;
    avgResultCount: number;
    avgProcessingTime: number;
  }

  const results = parseNeo4jRows<AnalyticsResult>(response, "analytics");
  const analytics = results[0] || {
    totalSearches: 0,
    totalClicks: 0,
    avgResultCount: 0,
    avgProcessingTime: 0,
  };

  return {
    ...analytics,
    clickThroughRate:
      analytics.totalSearches > 0
        ? analytics.totalClicks / analytics.totalSearches
        : 0,
  };
}

// =============================================================================
// VECTOR SEARCH (EMBEDDINGS)
// =============================================================================

/**
 * Generate embedding for search query using OpenRouter.
 */
export async function generateQueryEmbedding(
  env: Env,
  query: string
): Promise<number[]> {
  const response = await fetch(
    env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: query,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`OpenRouter embedding failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  const firstEmbedding = data.data[0];
  if (!firstEmbedding) {
    throw new Error("No embedding returned from OpenRouter");
  }

  return firstEmbedding.embedding;
}

/**
 * Search LanceDB for matching listings.
 *
 * Note: This uses the LanceDB HTTP API. In production, this would connect
 * to LanceDB Cloud or a self-hosted LanceDB instance.
 */
export async function searchListingsVector(
  env: Env,
  queryVector: number[],
  filters: {
    categories?: string[];
    verifiedOnly?: boolean;
    maxDistanceMiles?: number;
    userLocation?: { lat: number; lng: number };
  },
  limit: number
): Promise<
  Array<{
    businessId: string;
    listingId: string | null;
    similarity: number;
    businessData: BusinessData;
    listingData: ListingData | null;
  }>
> {
  // If LanceDB URI is not configured, fall back to Neo4j text search
  if (!env.LANCEDB_URI) {
    console.log("[Exchange Search] LanceDB not configured, using Neo4j fallback");
    return searchListingsNeo4jFallback(env, filters, limit);
  }

  // LanceDB vector search
  const lancedbUrl = `${env.LANCEDB_URI}/v1/table/exchange_listings/search`;

  // Build filter expression
  const filterParts: string[] = ["isActive = true"];
  if (filters.categories && filters.categories.length > 0) {
    filterParts.push(`category IN (${filters.categories.map((c) => `'${c}'`).join(", ")})`);
  }
  if (filters.verifiedOnly) {
    filterParts.push("isVerified = true");
  }

  try {
    const response = await fetch(lancedbUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector: queryVector,
        limit,
        filter: filterParts.join(" AND "),
        columns: ["businessId", "listingId", "businessData", "listingData"],
      }),
    });

    if (!response.ok) {
      console.warn(`[Exchange LanceDB] Search failed: ${response.status}, using fallback`);
      return searchListingsNeo4jFallback(env, filters, limit);
    }

    interface LanceDBResult {
      businessId: string;
      listingId: string | null;
      _distance: number;
      businessData: BusinessData;
      listingData: ListingData | null;
    }

    const results = (await response.json()) as LanceDBResult[];

    return results.map((r) => ({
      businessId: r.businessId,
      listingId: r.listingId,
      similarity: 1 / (1 + r._distance),
      businessData: r.businessData,
      listingData: r.listingData,
    }));
  } catch (error) {
    console.error("[Exchange LanceDB] Error:", error);
    return searchListingsNeo4jFallback(env, filters, limit);
  }
}

/**
 * Fallback search using Neo4j full-text search when LanceDB is not available.
 */
async function searchListingsNeo4jFallback(
  env: Env,
  filters: {
    categories?: string[];
    verifiedOnly?: boolean;
  },
  limit: number
): Promise<
  Array<{
    businessId: string;
    listingId: string | null;
    similarity: number;
    businessData: BusinessData;
    listingData: ListingData | null;
  }>
> {
  // Build WHERE clause
  const whereParts: string[] = ["l.isActive = true"];
  if (filters.categories && filters.categories.length > 0) {
    whereParts.push(`l.category IN $categories`);
  }
  if (filters.verifiedOnly) {
    whereParts.push("b.isVerified = true");
  }

  const query = `
    MATCH (b:Business)-[:HAS_LISTING]->(l:Listing)
    WHERE ${whereParts.join(" AND ")}
    RETURN
      b.businessId as businessId,
      l.listingId as listingId,
      b {
        .businessId, .name, .description, .category, .tags, .isVerified,
        .hasStripe, .profilePhotoUrl, .serviceAreaMiles, .location, .createdAt
      } as businessData,
      l {
        .listingId, .businessId, .title, .description, .priceType, .priceAmount,
        .category, .skillTags, .isActive, .createdAt, .updatedAt
      } as listingData
    ORDER BY b.isVerified DESC, l.updatedAt DESC
    LIMIT $limit
  `;

  const response = await neo4jCommit(env, [
    {
      statement: query,
      parameters: {
        categories: filters.categories || [],
        limit,
      },
    },
  ]);

  if (!response.results[0]?.data) {
    return [];
  }

  const columns = response.results[0].columns;
  const businessIdIdx = columns.indexOf("businessId");
  const listingIdIdx = columns.indexOf("listingId");
  const businessDataIdx = columns.indexOf("businessData");
  const listingDataIdx = columns.indexOf("listingData");

  return response.results[0].data.map((row, index) => ({
    businessId: row.row[businessIdIdx] as string,
    listingId: row.row[listingIdIdx] as string | null,
    similarity: 0.5 - index * 0.01, // Synthetic similarity for fallback
    businessData: row.row[businessDataIdx] as BusinessData,
    listingData: row.row[listingDataIdx] as ListingData | null,
  }));
}
