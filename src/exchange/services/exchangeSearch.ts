/**
 * Enhanced Exchange Search Service
 *
 * Provides semantic search with advanced evidence-based ranking for Orion Exchange.
 * Implements the enhanced ranking formula from Window 4 specification.
 *
 * Ranking Formula:
 * final = 0.55*vectorSim + 0.25*evidenceScore + 0.10*taskFrequency + 0.05*recency + 0.05*profileQuality
 *
 * Key Features:
 * - Semantic vector search via LanceDB
 * - Evidence-based scoring with explainability
 * - User preference integration
 * - Risk tolerance filtering
 * - Full ranking trace for debugging
 *
 * @version 4.0.0
 */

import type { Env } from '../../env';
import type { EvidenceReference } from './evidenceScoring';
import {
  searchListingsVector,
  fetchEvidenceMetricsBatch,
  fetchUserPreferences as fetchUserPrefsFromConvex,
  recordSearchSession as recordSession,
  type BusinessData as AdapterBusinessData,
  type ListingData as AdapterListingData,
} from '../adapters/exchangeData';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Exchange search request from gateway.
 */
export interface ExchangeSearchRequest {
  /** Search query text */
  query: string;

  /** User ID for personalization */
  userId: string;

  /** Search filters */
  filters?: ExchangeSearchFilters;

  /** Pagination */
  page?: number;
  limit?: number;

  /** Whether to apply user preferences from profile */
  applyUserPreferences?: boolean;
}

export interface ExchangeSearchFilters {
  /** Filter by categories */
  categories?: string[];

  /** Maximum distance in miles */
  maxDistanceMiles?: number;

  /** User's location */
  userLocation?: {
    lat: number;
    lng: number;
  };

  /** Only show verified businesses */
  verifiedOnly?: boolean;

  /** Minimum evidence score threshold */
  minEvidenceScore?: number;

  /** Minimum number of verified proofs */
  minVerifiedProofs?: number;

  /** Price range filter */
  priceRange?: {
    min?: number;
    max?: number;
  };

  /** Only show businesses available now */
  availableNow?: boolean;

  /** Risk tolerance for results */
  riskTolerance?: 'verified_only' | 'high_evidence_preferred' | 'open_to_new';
}

/**
 * User preferences for search personalization.
 */
export interface UserSearchPreferences {
  /** Preferred categories */
  preferredCategories?: string[];

  /** Preferred service area */
  preferredLocation?: {
    lat: number;
    lng: number;
    radiusMiles: number;
  };

  /** Communication preferences */
  communicationStyle?: 'quick' | 'detailed' | 'flexible';

  /** Evidence importance (0-1) */
  evidenceImportance?: number;

  /** Price sensitivity (budget/moderate/premium) */
  priceSensitivity?: 'budget' | 'moderate' | 'premium';

  /** Provider type preferences */
  providerPreferences?: {
    preferIndividual?: boolean;
    preferCompany?: boolean;
    preferCertified?: boolean;
  };
}

/**
 * Business data from storage.
 */
export interface BusinessData {
  businessId: string;
  ownerId: string;
  businessName: string;
  businessDescription: string | null;
  primaryCategory: string;
  tags: string[];
  serviceArea: {
    type: 'radius' | 'regions' | 'remote';
    lat?: number;
    lng?: number;
    radiusMiles?: number;
    regions?: string[];
  };
  status: 'draft' | 'active' | 'suspended';
  isVerified: boolean;
  proofSharingEnabled: boolean;
  stripeAccountId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Listing/offering data from storage.
 */
export interface ListingData {
  listingId: string;
  businessId: string;
  title: string;
  description: string;
  category: string;
  skillTags: string[];
  priceType: 'fixed' | 'hourly' | 'quote';
  priceAmount?: number;
  isAvailable: boolean;
  createdAt: number;
}

/**
 * Business evidence metrics from Neo4j.
 */
export interface BusinessEvidenceMetrics {
  businessId: string;
  verifiedProofCount: number;
  totalCompletions: number;
  lastVerifiedAt: number | null;
  averageRating: number | null;
  totalRatings: number;
  evidenceScore: number;
  taskFrequency: number;
  profileQuality: number;
  /** Category-specific proof counts */
  proofsByCategory: Record<string, number>;
  /** Recent proofs within last 30 days */
  recentProofCount: number;
}

/**
 * Individual ranked search result.
 */
export interface ExchangeSearchResult {
  /** Business ID */
  businessId: string;

  /** Listing ID (if matched specific listing) */
  listingId: string | null;

  /** Business details */
  business: {
    name: string;
    description: string | null;
    category: string;
    tags: string[];
    isVerified: boolean;
    hasStripe: boolean;
  };

  /** Listing details (if applicable) */
  listing: {
    title: string;
    description: string;
    priceType: string;
    priceAmount: number | null;
  } | null;

  /** Final ranking score (0-1) */
  finalScore: number;

  /** Score breakdown for transparency */
  scores: ExchangeScoreBreakdown;

  /** Evidence metrics */
  evidence: {
    verifiedProofs: number;
    completions: number;
    averageRating: number | null;
    recentActivity: boolean;
  };

  /** Distance in miles (if location provided) */
  distanceMiles: number | null;

  /** Ranking explanation for UI */
  explanation: ExchangeRankingExplanation;
}

export interface ExchangeScoreBreakdown {
  /** Semantic similarity (0-1) */
  vectorSimilarity: number;

  /** Evidence score from proofs (0-1) */
  evidenceScore: number;

  /** Task frequency score (0-1) */
  taskFrequency: number;

  /** Recency score (0-1) */
  recency: number;

  /** Profile quality score (0-1) */
  profileQuality: number;

  /** Final weighted score */
  final: number;
}

export interface ExchangeRankingExplanation {
  /** Human-readable summary */
  summary: string;

  /** UI-friendly reason chips */
  reasons: ExchangeReasonChip[];

  /** Evidence references for drill-down */
  evidenceRefs: EvidenceReference[];

  /** Debug reason codes */
  reasonCodes: string[];
}

export interface ExchangeReasonChip {
  /** Chip type for styling */
  type: 'verified' | 'evidence' | 'popular' | 'recent' | 'match' | 'warning';

  /** Short label for chip */
  label: string;

  /** Tooltip/description */
  tooltip: string;

  /** Icon identifier */
  icon?: string;
}

/**
 * Full search response.
 */
export interface ExchangeSearchResponse {
  /** Unique search session ID */
  searchSessionId: string;

  /** Original query */
  query: string;

  /** Total matching results */
  totalCount: number;

  /** Ranked results */
  results: ExchangeSearchResult[];

  /** Whether more results available */
  hasMore: boolean;

  /** Applied filters (for debugging) */
  appliedFilters: ExchangeSearchFilters;

  /** Processing time in ms */
  processingTimeMs: number;

  /** Whether user preferences were applied */
  preferencesApplied: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ExchangeSearchConfig {
  /** Default result limit */
  defaultLimit: number;

  /** Maximum result limit */
  maxLimit: number;

  /** Minimum similarity threshold */
  minSimilarity: number;

  /** Ranking weights */
  rankingWeights: {
    vectorSimilarity: number;
    evidenceScore: number;
    taskFrequency: number;
    recency: number;
    profileQuality: number;
  };

  /** Risk tolerance thresholds */
  riskToleranceThresholds: {
    verified_only: { minEvidence: number; verifiedRequired: boolean };
    high_evidence_preferred: { minEvidence: number; verifiedRequired: boolean };
    open_to_new: { minEvidence: number; verifiedRequired: boolean };
  };

  /** Recency decay half-life in days */
  recencyHalfLifeDays: number;

  /** Embedding model */
  embeddingModel: string;
}

const DEFAULT_CONFIG: ExchangeSearchConfig = {
  defaultLimit: 20,
  maxLimit: 50,
  minSimilarity: 0.3,

  rankingWeights: {
    vectorSimilarity: 0.55,
    evidenceScore: 0.25,
    taskFrequency: 0.10,
    recency: 0.05,
    profileQuality: 0.05,
  },

  riskToleranceThresholds: {
    verified_only: { minEvidence: 0.6, verifiedRequired: true },
    high_evidence_preferred: { minEvidence: 0.3, verifiedRequired: false },
    open_to_new: { minEvidence: 0.0, verifiedRequired: false },
  },

  recencyHalfLifeDays: 30,
  embeddingModel: 'openai/text-embedding-3-small',
};

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Calculate final ranking score using enhanced formula.
 *
 * Formula: final = 0.55*vectorSim + 0.25*evidenceScore + 0.10*taskFrequency + 0.05*recency + 0.05*profileQuality
 */
function calculateFinalScore(
  vectorSimilarity: number,
  evidenceScore: number,
  taskFrequency: number,
  recency: number,
  profileQuality: number,
  weights: ExchangeSearchConfig['rankingWeights']
): number {
  return (
    weights.vectorSimilarity * vectorSimilarity +
    weights.evidenceScore * evidenceScore +
    weights.taskFrequency * taskFrequency +
    weights.recency * recency +
    weights.profileQuality * profileQuality
  );
}

/**
 * Calculate task frequency score from completion history.
 * Uses log scale, capped at 100 completions for full score.
 */
function calculateTaskFrequencyScore(totalCompletions: number): number {
  if (totalCompletions === 0) return 0;
  return Math.min(1.0, Math.log10(totalCompletions + 1) / Math.log10(101));
}

/**
 * Calculate recency score based on last verification date.
 * Uses exponential decay.
 */
function calculateRecencyScore(
  lastVerifiedAt: number | null,
  halfLifeDays: number
): number {
  if (!lastVerifiedAt) return 0;

  const daysSinceVerified = (Date.now() - lastVerifiedAt) / (1000 * 60 * 60 * 24);
  return Math.pow(2, -daysSinceVerified / halfLifeDays);
}

/**
 * Calculate profile quality score.
 * Based on: verification status, Stripe connection, completeness, age.
 */
function calculateProfileQualityScore(
  business: BusinessData,
  metrics: BusinessEvidenceMetrics
): number {
  let score = 0;

  // Verified identity (30%)
  if (business.isVerified) score += 0.30;

  // Stripe connected (25%)
  if (business.stripeAccountId) score += 0.25;

  // Description present (15%)
  if (business.businessDescription && business.businessDescription.length > 50) {
    score += 0.15;
  }

  // Service area defined (10%)
  if (business.serviceArea.type !== 'remote' || business.serviceArea.regions) {
    score += 0.10;
  }

  // Has ratings (10%)
  if (metrics.totalRatings > 0 && metrics.averageRating && metrics.averageRating >= 4) {
    score += 0.10;
  }

  // Account age bonus (10% max, requires 6+ months)
  const accountAgeDays = (Date.now() - business.createdAt) / (1000 * 60 * 60 * 24);
  if (accountAgeDays > 180) {
    score += Math.min(0.10, (accountAgeDays / 365) * 0.10);
  }

  return Math.min(1.0, score);
}

/**
 * Generate reason chips for UI display.
 */
function generateReasonChips(
  business: BusinessData,
  metrics: BusinessEvidenceMetrics,
  scores: ExchangeScoreBreakdown,
  queryTags: string[]
): ExchangeReasonChip[] {
  const chips: ExchangeReasonChip[] = [];

  // Verification chip
  if (business.isVerified) {
    chips.push({
      type: 'verified',
      label: 'Verified',
      tooltip: 'Business identity has been verified',
      icon: 'checkmark.seal.fill',
    });
  }

  // High evidence chip
  if (scores.evidenceScore > 0.5) {
    chips.push({
      type: 'evidence',
      label: `${metrics.verifiedProofCount} Proofs`,
      tooltip: `${metrics.verifiedProofCount} verified proof${metrics.verifiedProofCount !== 1 ? 's' : ''} of work`,
      icon: 'photo.stack.fill',
    });
  }

  // High completion count
  if (metrics.totalCompletions >= 20) {
    chips.push({
      type: 'popular',
      label: `${metrics.totalCompletions} Jobs`,
      tooltip: `Completed ${metrics.totalCompletions} jobs`,
      icon: 'star.fill',
    });
  }

  // Recent activity
  if (metrics.recentProofCount > 0) {
    chips.push({
      type: 'recent',
      label: 'Active',
      tooltip: 'Has recent verified work',
      icon: 'clock.fill',
    });
  }

  // Good rating
  if (metrics.averageRating && metrics.averageRating >= 4.5 && metrics.totalRatings >= 5) {
    chips.push({
      type: 'match',
      label: `${metrics.averageRating.toFixed(1)}★`,
      tooltip: `${metrics.averageRating.toFixed(1)} stars from ${metrics.totalRatings} ratings`,
      icon: 'star.fill',
    });
  }

  // Tag matches
  const matchedTags = business.tags.filter((t) =>
    queryTags.some((qt) => t.toLowerCase().includes(qt.toLowerCase()))
  );
  if (matchedTags.length > 0) {
    chips.push({
      type: 'match',
      label: `${matchedTags.length} Skill Match${matchedTags.length > 1 ? 'es' : ''}`,
      tooltip: `Matches: ${matchedTags.slice(0, 3).join(', ')}`,
      icon: 'tag.fill',
    });
  }

  // New provider warning (could be opportunity or risk)
  if (metrics.verifiedProofCount === 0 && business.isVerified) {
    chips.push({
      type: 'warning',
      label: 'New Provider',
      tooltip: 'Verified but no proof-of-work history yet',
      icon: 'exclamationmark.circle',
    });
  }

  return chips;
}

/**
 * Generate ranking explanation summary.
 */
function generateExplanationSummary(
  scores: ExchangeScoreBreakdown,
  metrics: BusinessEvidenceMetrics,
  business: BusinessData
): string {
  const parts: string[] = [];

  // High relevance
  if (scores.vectorSimilarity > 0.8) {
    parts.push('Excellent match for your search');
  } else if (scores.vectorSimilarity > 0.6) {
    parts.push('Good match');
  }

  // Evidence highlight
  if (scores.evidenceScore > 0.5 && metrics.verifiedProofCount > 0) {
    parts.push(`with ${metrics.verifiedProofCount} verified proof${metrics.verifiedProofCount !== 1 ? 's' : ''}`);
  }

  // Verification status
  if (business.isVerified) {
    parts.push('verified provider');
  }

  // Recent activity
  if (metrics.recentProofCount > 0) {
    parts.push('recently active');
  }

  if (parts.length === 0) {
    return 'Matches your search criteria';
  }

  // Capitalize first part and join
  const firstPart = parts[0];
  if (firstPart) {
    parts[0] = firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
  }
  return parts.join(', ');
}

/**
 * Extract tags from search query for matching.
 */
function extractQueryTags(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((word) => word.length > 2)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length > 0);
}

/**
 * Calculate distance between two points using Haversine formula.
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// =============================================================================
// MOCK DATA FUNCTIONS (TO BE REPLACED WITH REAL IMPLEMENTATIONS)
// =============================================================================

/**
 * Generate query embedding via OpenRouter.
 */
async function generateQueryEmbedding(
  env: Env,
  query: string,
  model: string
): Promise<number[]> {
  const openRouterApiKey = env.OPENROUTER_API_KEY;
  const openRouterBaseUrl = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  const response = await fetch(`${openRouterBaseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'https://orion.suite',
      'X-Title': 'Orion Exchange',
    },
    body: JSON.stringify({
      model,
      input: query,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding generation failed: ${error}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  const firstEmbedding = data.data?.[0]?.embedding;
  if (!firstEmbedding) {
    throw new Error('No embedding returned from API');
  }
  return firstEmbedding;
}

/**
 * Search LanceDB for matching businesses.
 * Uses the Exchange data adapter for vector search with Neo4j fallback.
 */
async function searchLanceDb(
  env: Env,
  queryVector: number[],
  filters: ExchangeSearchFilters,
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
  // Build filters object conditionally for exactOptionalPropertyTypes
  const vectorFilters: {
    categories?: string[];
    verifiedOnly?: boolean;
    maxDistanceMiles?: number;
    userLocation?: { lat: number; lng: number };
  } = {};

  if (filters.categories) {
    vectorFilters.categories = filters.categories;
  }
  if (filters.verifiedOnly !== undefined) {
    vectorFilters.verifiedOnly = filters.verifiedOnly;
  }
  if (filters.maxDistanceMiles !== undefined) {
    vectorFilters.maxDistanceMiles = filters.maxDistanceMiles;
  }
  if (filters.userLocation) {
    vectorFilters.userLocation = filters.userLocation;
  }

  const adapterResults = await searchListingsVector(
    env,
    queryVector,
    vectorFilters,
    limit
  );

  // Map adapter types to local types
  return adapterResults.map((r) => ({
    businessId: r.businessId,
    listingId: r.listingId,
    similarity: r.similarity,
    businessData: mapAdapterBusinessToLocal(r.businessData),
    listingData: r.listingData ? mapAdapterListingToLocal(r.listingData) : null,
  }));
}

/**
 * Map adapter business data to local BusinessData type.
 */
function mapAdapterBusinessToLocal(adapter: AdapterBusinessData): BusinessData {
  // Build serviceArea with proper typing for exactOptionalPropertyTypes
  let serviceArea: BusinessData["serviceArea"];
  if (adapter.serviceAreaMiles && adapter.location) {
    serviceArea = {
      type: "radius" as const,
      lat: adapter.location.lat,
      lng: adapter.location.lng,
      radiusMiles: adapter.serviceAreaMiles,
    };
  } else {
    serviceArea = { type: "remote" as const };
  }

  // Build result with conditional optional properties
  const result: BusinessData = {
    businessId: adapter.businessId,
    ownerId: "",
    businessName: adapter.name,
    businessDescription: adapter.description,
    primaryCategory: adapter.category,
    tags: adapter.tags,
    serviceArea,
    status: "active" as const,
    isVerified: adapter.isVerified,
    proofSharingEnabled: true,
    createdAt: adapter.createdAt,
    updatedAt: adapter.createdAt,
  };

  if (adapter.hasStripe) {
    result.stripeAccountId = "connected";
  }

  return result;
}

/**
 * Map adapter listing data to local ListingData type.
 */
function mapAdapterListingToLocal(adapter: AdapterListingData): ListingData {
  const result: ListingData = {
    listingId: adapter.listingId,
    businessId: adapter.businessId,
    title: adapter.title,
    description: adapter.description,
    category: adapter.category,
    skillTags: adapter.skillTags,
    priceType: adapter.priceType,
    isAvailable: adapter.isActive,
    createdAt: adapter.createdAt,
  };

  if (adapter.priceAmount !== null) {
    result.priceAmount = adapter.priceAmount;
  }

  return result;
}

/**
 * Fetch evidence metrics from Neo4j.
 * Uses the Exchange data adapter for batch metrics retrieval.
 */
async function fetchEvidenceMetrics(
  env: Env,
  businessIds: string[]
): Promise<Map<string, BusinessEvidenceMetrics>> {
  const adapterMetrics = await fetchEvidenceMetricsBatch(env, businessIds);

  // Map adapter metrics to local BusinessEvidenceMetrics type
  const result = new Map<string, BusinessEvidenceMetrics>();
  for (const [id, adapter] of adapterMetrics) {
    result.set(id, {
      businessId: adapter.businessId,
      verifiedProofCount: adapter.verifiedProofsCount,
      totalCompletions: adapter.completedOrdersCount,
      lastVerifiedAt: adapter.daysSinceLastProof !== null
        ? Date.now() - (adapter.daysSinceLastProof * 24 * 60 * 60 * 1000)
        : null,
      averageRating: adapter.averageRating,
      totalRatings: adapter.ratingCount,
      evidenceScore: adapter.evidenceScore,
      taskFrequency: adapter.completedOrdersCount > 0 ? 0.5 : 0, // Estimate
      profileQuality: 0.5, // Would need separate calculation
      proofsByCategory: {},
      recentProofCount: adapter.hasRecentActivity ? adapter.verifiedProofsCount : 0,
    });
  }
  return result;
}

/**
 * Fetch user preferences from Convex.
 * Uses the Exchange data adapter for Convex HTTP API access.
 */
async function fetchUserPreferences(
  env: Env,
  userId: string
): Promise<UserSearchPreferences | null> {
  const adapterPrefs = await fetchUserPrefsFromConvex(env, userId);

  if (!adapterPrefs) {
    return null;
  }

  // Map adapter preferences to local UserSearchPreferences type
  const result: UserSearchPreferences = {};

  if (adapterPrefs.preferredCategories.length > 0) {
    result.preferredCategories = adapterPrefs.preferredCategories;
  }

  if (adapterPrefs.maxDistanceMiles !== undefined) {
    result.preferredLocation = {
      lat: 0,
      lng: 0,
      radiusMiles: adapterPrefs.maxDistanceMiles,
    };
  }

  // Map risk tolerance to evidence importance
  if (adapterPrefs.riskTolerance === "verified_only") {
    result.evidenceImportance = 1.0;
  } else if (adapterPrefs.riskTolerance === "high_evidence_preferred") {
    result.evidenceImportance = 0.7;
  } else {
    result.evidenceImportance = 0.3;
  }

  return result;
}

/**
 * Record search session for analytics.
 * Uses the Exchange data adapter for Neo4j storage.
 */
async function recordSearchSession(
  env: Env,
  searchSessionId: string,
  request: ExchangeSearchRequest,
  resultCount: number,
  topResultIds: string[],
  processingTimeMs: number
): Promise<void> {
  await recordSession(env, {
    searchSessionId,
    userId: request.userId,
    query: request.query,
    filters: request.filters as Record<string, unknown>,
    resultCount,
    topResultIds,
    processingTimeMs,
    timestamp: Date.now(),
  });
}

// =============================================================================
// MAIN SEARCH FUNCTION
// =============================================================================

/**
 * Perform Exchange search with enhanced evidence-based ranking.
 *
 * @param env - Environment bindings
 * @param request - Search request from gateway
 * @param config - Search configuration
 * @returns Full search response with ranked results
 */
export async function exchangeSearch(
  env: Env,
  request: ExchangeSearchRequest,
  config: ExchangeSearchConfig = DEFAULT_CONFIG
): Promise<ExchangeSearchResponse> {
  const startTime = Date.now();
  const searchSessionId = crypto.randomUUID();

  // Validate request
  if (!request.query || request.query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  const effectiveLimit = Math.min(
    Math.max(1, request.limit ?? config.defaultLimit),
    config.maxLimit
  );

  const page = Math.max(1, request.page ?? 1);
  const offset = (page - 1) * effectiveLimit;

  try {
    // Step 1: Fetch user preferences if enabled
    let userPrefs: UserSearchPreferences | null = null;
    if (request.applyUserPreferences !== false) {
      userPrefs = await fetchUserPreferences(env, request.userId);
    }

    // Step 2: Merge filters with user preferences
    const effectiveFilters: ExchangeSearchFilters = {
      ...request.filters,
    };

    if (userPrefs) {
      // Apply preferred location if not specified in request
      if (!effectiveFilters.userLocation && userPrefs.preferredLocation) {
        effectiveFilters.userLocation = {
          lat: userPrefs.preferredLocation.lat,
          lng: userPrefs.preferredLocation.lng,
        };
        effectiveFilters.maxDistanceMiles =
          effectiveFilters.maxDistanceMiles ??
          userPrefs.preferredLocation.radiusMiles;
      }

      // Apply category preferences
      if (
        !effectiveFilters.categories &&
        userPrefs.preferredCategories?.length
      ) {
        effectiveFilters.categories = userPrefs.preferredCategories;
      }

      // Adjust evidence importance based on user preference
      if (userPrefs.evidenceImportance !== undefined) {
        effectiveFilters.minEvidenceScore =
          effectiveFilters.minEvidenceScore ??
          userPrefs.evidenceImportance * 0.5;
      }
    }

    // Step 3: Apply risk tolerance thresholds
    const riskTolerance = effectiveFilters.riskTolerance ?? 'high_evidence_preferred';
    const toleranceConfig = config.riskToleranceThresholds[riskTolerance];
    effectiveFilters.minEvidenceScore =
      effectiveFilters.minEvidenceScore ?? toleranceConfig.minEvidence;
    effectiveFilters.verifiedOnly =
      effectiveFilters.verifiedOnly ?? toleranceConfig.verifiedRequired;

    // Step 4: Generate query embedding
    const queryVector = await generateQueryEmbedding(
      env,
      request.query,
      config.embeddingModel
    );
    const queryTags = extractQueryTags(request.query);

    // Step 5: Search LanceDB
    const vectorResults = await searchLanceDb(
      env,
      queryVector,
      effectiveFilters,
      effectiveLimit * 3 // Fetch extra for post-filtering
    );

    // Filter by minimum similarity
    const filteredResults = vectorResults.filter(
      (r) => r.similarity >= config.minSimilarity
    );

    if (filteredResults.length === 0) {
      await recordSearchSession(
        env,
        searchSessionId,
        request,
        0,
        [],
        Date.now() - startTime
      );

      return {
        searchSessionId,
        query: request.query,
        totalCount: 0,
        results: [],
        hasMore: false,
        appliedFilters: effectiveFilters,
        processingTimeMs: Date.now() - startTime,
        preferencesApplied: userPrefs !== null,
      };
    }

    // Step 6: Fetch evidence metrics from Neo4j
    const businessIds = [...new Set(filteredResults.map((r) => r.businessId))];
    const metricsMap = await fetchEvidenceMetrics(env, businessIds);

    // Step 7: Calculate scores and rank results
    const rankedResults: ExchangeSearchResult[] = filteredResults.map((result) => {
      const business = result.businessData;
      const listing = result.listingData;

      // Get or generate default metrics
      const metrics: BusinessEvidenceMetrics = metricsMap.get(result.businessId) ?? {
        businessId: result.businessId,
        verifiedProofCount: 0,
        totalCompletions: 0,
        lastVerifiedAt: null,
        averageRating: null,
        totalRatings: 0,
        evidenceScore: 0,
        taskFrequency: 0,
        profileQuality: 0,
        proofsByCategory: {},
        recentProofCount: 0,
      };

      // Calculate individual scores
      const vectorSimilarity = result.similarity;
      const evidenceScore = metrics.evidenceScore;
      const taskFrequency = calculateTaskFrequencyScore(metrics.totalCompletions);
      const recency = calculateRecencyScore(
        metrics.lastVerifiedAt,
        config.recencyHalfLifeDays
      );
      const profileQuality = calculateProfileQualityScore(business, metrics);

      // Calculate final weighted score
      const finalScore = calculateFinalScore(
        vectorSimilarity,
        evidenceScore,
        taskFrequency,
        recency,
        profileQuality,
        config.rankingWeights
      );

      // Build score breakdown
      const scores: ExchangeScoreBreakdown = {
        vectorSimilarity,
        evidenceScore,
        taskFrequency,
        recency,
        profileQuality,
        final: finalScore,
      };

      // Generate reason chips
      const reasonChips = generateReasonChips(
        business,
        metrics,
        scores,
        queryTags
      );

      // Generate explanation summary
      const summary = generateExplanationSummary(scores, metrics, business);

      // Build reason codes
      const reasonCodes: string[] = [];
      if (vectorSimilarity > 0.8) reasonCodes.push('HIGH_RELEVANCE');
      if (evidenceScore > 0.5) reasonCodes.push('HIGH_EVIDENCE');
      if (taskFrequency > 0.5) reasonCodes.push('HIGH_FREQUENCY');
      if (recency > 0.5) reasonCodes.push('RECENT_ACTIVITY');
      if (profileQuality > 0.7) reasonCodes.push('HIGH_QUALITY_PROFILE');
      if (business.isVerified) reasonCodes.push('VERIFIED');

      // Calculate distance
      let distanceMiles: number | null = null;
      if (
        effectiveFilters.userLocation &&
        business.serviceArea.lat &&
        business.serviceArea.lng
      ) {
        distanceMiles = calculateDistance(
          effectiveFilters.userLocation.lat,
          effectiveFilters.userLocation.lng,
          business.serviceArea.lat,
          business.serviceArea.lng
        );
      }

      return {
        businessId: result.businessId,
        listingId: result.listingId,
        business: {
          name: business.businessName,
          description: business.businessDescription,
          category: business.primaryCategory,
          tags: business.tags,
          isVerified: business.isVerified,
          hasStripe: !!business.stripeAccountId,
        },
        listing: listing
          ? {
              title: listing.title,
              description: listing.description,
              priceType: listing.priceType,
              priceAmount: listing.priceAmount ?? null,
            }
          : null,
        finalScore,
        scores,
        evidence: {
          verifiedProofs: metrics.verifiedProofCount,
          completions: metrics.totalCompletions,
          averageRating: metrics.averageRating,
          recentActivity: metrics.recentProofCount > 0,
        },
        distanceMiles,
        explanation: {
          summary,
          reasons: reasonChips,
          evidenceRefs: [], // Would be populated from actual proof data
          reasonCodes,
        },
      };
    });

    // Step 8: Sort by final score
    rankedResults.sort((a, b) => b.finalScore - a.finalScore);

    // Step 9: Apply pagination
    const paginatedResults = rankedResults.slice(offset, offset + effectiveLimit);
    const hasMore = rankedResults.length > offset + effectiveLimit;

    // Step 10: Record search session
    const processingTimeMs = Date.now() - startTime;
    await recordSearchSession(
      env,
      searchSessionId,
      request,
      rankedResults.length,
      paginatedResults.map((r) => r.businessId),
      processingTimeMs
    );

    return {
      searchSessionId,
      query: request.query,
      totalCount: rankedResults.length,
      results: paginatedResults,
      hasMore,
      appliedFilters: effectiveFilters,
      processingTimeMs,
      preferencesApplied: userPrefs !== null,
    };
  } catch (error) {
    console.error('[Exchange Search] Error:', error);
    throw error;
  }
}

// Export config for testing
export { DEFAULT_CONFIG as EXCHANGE_SEARCH_CONFIG };
export type { ExchangeSearchConfig };
