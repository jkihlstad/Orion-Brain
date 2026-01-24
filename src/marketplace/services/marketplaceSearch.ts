/**
 * Marketplace Search Service
 *
 * Provides semantic search with proof-of-work ranking for the Orion Marketplace.
 * Combines LanceDB vector search with Neo4j proof metrics.
 *
 * Scoring Formula:
 * finalScore = relevanceScore * (1 + evidenceScore) * (1 + recencyBoost)
 *
 * Where:
 * - relevanceScore: Vector similarity (0-1)
 * - evidenceScore: Proof-of-work evidence score (0-1)
 * - recencyBoost: Bonus for recent verified proofs (0-0.2)
 *
 * @version 1.0.0
 */

import type { Env } from '../../env';
import type { MarketplaceSearchResult } from '../schemas/lancedb-marketplace';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Search request from client.
 */
export interface MarketplaceSearchRequest {
  /** Search query text */
  query: string;

  /** User ID (optional, for personalization) */
  userId?: string;

  /** Search filters */
  filters?: MarketplaceSearchFilters;

  /** User's location for distance filtering */
  userLocation?: {
    lat: number;
    lng: number;
  };

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

export interface MarketplaceSearchFilters {
  /** Filter by categories */
  categories?: string[];

  /** Maximum distance in miles */
  maxDistanceMiles?: number;

  /** Only show currently open businesses */
  openNow?: boolean;

  /** Only show businesses with verified proofs */
  verifiedProofOnly?: boolean;

  /** Minimum proof count */
  minProofCount?: number;
}

/**
 * Individual search result with ranking explanation.
 */
export interface RankedSearchResult {
  /** Business ID */
  businessId: string;

  /** Offering ID (if matched specific offering) */
  offeringId: string | null;

  /** Business name */
  businessName: string;

  /** Business description */
  businessDescription: string | null;

  /** Primary category */
  primaryCategory: string;

  /** Tags */
  tags: string[];

  /** Offering title */
  offeringTitle: string | null;

  /** Offering description */
  offeringDescription: string | null;

  /** Final computed score */
  finalScore: number;

  /** Score breakdown for explainability */
  scores: ScoreBreakdown;

  /** Proof metrics */
  proofMetrics: ProofMetrics;

  /** Distance in miles (if location provided) */
  distanceMiles: number | null;

  /** Ranking explanation */
  explanation: RankingExplanation;
}

export interface ScoreBreakdown {
  /** Semantic relevance (0-1) */
  relevance: number;

  /** Evidence score (0-1) */
  evidence: number;

  /** Recency boost (0-0.2) */
  recency: number;

  /** Final score */
  final: number;
}

export interface ProofMetrics {
  /** Number of verified proofs */
  verifiedCount: number;

  /** Number of exact tag matches */
  exactTagMatches: number;

  /** Total completions */
  totalCompletions: number;

  /** Last verified timestamp */
  lastVerifiedAt: number | null;
}

export interface RankingExplanation {
  /** Human-readable summary */
  summary: string;

  /** Factors that contributed to ranking */
  factors: RankingFactor[];

  /** Reason codes for debugging */
  reasonCodes: string[];
}

export interface RankingFactor {
  /** Factor name */
  name: string;

  /** Factor contribution to score */
  contribution: number;

  /** Human-readable description */
  description: string;
}

/**
 * Search response to client.
 */
export interface MarketplaceSearchResponse {
  /** Unique search session ID */
  searchSessionId: string;

  /** Original query */
  query: string;

  /** Total result count */
  totalCount: number;

  /** Ranked results */
  results: RankedSearchResult[];

  /** Whether more results are available */
  hasMore: boolean;

  /** Processing time in ms */
  processingTimeMs: number;
}

/**
 * Rank trace for debugging/explainability.
 */
export interface RankTrace {
  /** Unique trace ID */
  traceId: string;

  /** Search session ID */
  searchSessionId: string;

  /** Business being scored */
  businessId: string;

  /** The search query */
  query: string;

  /** Score breakdown */
  scores: ScoreBreakdown;

  /** Matched tags */
  matchedTags: string[];

  /** Proof metrics used */
  proofMetrics: ProofMetrics;

  /** Reason codes applied */
  reasonCodes: string[];

  /** Trace generation timestamp */
  generatedAt: number;
}

// =============================================================================
// DEMO DATA FOR MVP
// =============================================================================

/**
 * Demo marketplace data for MVP demonstration.
 * Returns sample businesses with realistic proof-of-work metrics.
 */
function getDemoMarketplaceResults(limit: number): MarketplaceSearchResult[] {
  const demoBusinesses: MarketplaceSearchResult[] = [
    {
      row: {
        id: 'demo-1',
        businessId: 'biz-bright-digital',
        ownerId: 'owner-1',
        offeringId: 'off-web-dev',
        textVector: [],
        businessName: 'Bright Digital Solutions',
        businessDescription: 'Full-service digital marketing and web development agency specializing in modern, responsive websites.',
        primaryCategory: 'Technology & Software',
        tagsJson: JSON.stringify(['web development', 'digital marketing', 'SEO', 'responsive design']),
        offeringTitle: 'Custom Website Development',
        offeringDescription: 'Professional custom website development with modern frameworks and SEO optimization.',
        offeringType: 'service',
        serviceAreaType: 'remote',
        serviceAreaLat: null,
        serviceAreaLng: null,
        serviceAreaRadiusMiles: null,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 12,
        totalCompletions: 45,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.92,
      distance: 0.08,
    },
    {
      row: {
        id: 'demo-2',
        businessId: 'biz-pacific-realty',
        ownerId: 'owner-2',
        offeringId: 'off-home-sale',
        textVector: [],
        businessName: 'Pacific Group Realty',
        businessDescription: 'Premier real estate agency serving the Bay Area with luxury home sales and property management.',
        primaryCategory: 'Real Estate',
        tagsJson: JSON.stringify(['real estate', 'luxury homes', 'property management', 'Bay Area']),
        offeringTitle: 'Luxury Home Sales',
        offeringDescription: 'Expert guidance for buying and selling luxury properties in prime locations.',
        offeringType: 'service',
        serviceAreaType: 'regions',
        serviceAreaLat: 37.7749,
        serviceAreaLng: -122.4194,
        serviceAreaRadiusMiles: 50,
        serviceAreaRegionsJson: JSON.stringify(['San Francisco', 'Oakland', 'San Jose']),
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 8,
        totalCompletions: 23,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.88,
      distance: 0.12,
    },
    {
      row: {
        id: 'demo-3',
        businessId: 'biz-power-health',
        ownerId: 'owner-3',
        offeringId: 'off-personal-training',
        textVector: [],
        businessName: 'Power Health Fitness',
        businessDescription: 'Comprehensive fitness and wellness center offering personal training and nutrition coaching.',
        primaryCategory: 'Fitness & Wellness',
        tagsJson: JSON.stringify(['fitness', 'personal training', 'nutrition', 'wellness']),
        offeringTitle: 'Personal Training Sessions',
        offeringDescription: 'One-on-one personal training with certified fitness professionals.',
        offeringType: 'service',
        serviceAreaType: 'radius',
        serviceAreaLat: 34.0522,
        serviceAreaLng: -118.2437,
        serviceAreaRadiusMiles: 25,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 15,
        totalCompletions: 89,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 120 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.85,
      distance: 0.15,
    },
    {
      row: {
        id: 'demo-4',
        businessId: 'biz-elite-consulting',
        ownerId: 'owner-4',
        offeringId: 'off-strategy',
        textVector: [],
        businessName: 'Elite Business Consulting',
        businessDescription: 'Strategic business consulting firm helping startups and enterprises scale their operations.',
        primaryCategory: 'Business Services',
        tagsJson: JSON.stringify(['consulting', 'strategy', 'business growth', 'startups']),
        offeringTitle: 'Growth Strategy Consulting',
        offeringDescription: 'Comprehensive business strategy and growth planning for ambitious companies.',
        offeringType: 'consultation',
        serviceAreaType: 'remote',
        serviceAreaLat: null,
        serviceAreaLng: null,
        serviceAreaRadiusMiles: null,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 7,
        totalCompletions: 34,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 200 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.82,
      distance: 0.18,
    },
    {
      row: {
        id: 'demo-5',
        businessId: 'biz-gourmet-catering',
        ownerId: 'owner-5',
        offeringId: 'off-event-catering',
        textVector: [],
        businessName: 'Gourmet Events Catering',
        businessDescription: 'Premium catering service specializing in corporate events and weddings.',
        primaryCategory: 'Food & Beverage',
        tagsJson: JSON.stringify(['catering', 'events', 'weddings', 'corporate']),
        offeringTitle: 'Corporate Event Catering',
        offeringDescription: 'Full-service catering for corporate events, conferences, and business meetings.',
        offeringType: 'service',
        serviceAreaType: 'radius',
        serviceAreaLat: 40.7128,
        serviceAreaLng: -74.0060,
        serviceAreaRadiusMiles: 30,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 11,
        totalCompletions: 67,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 150 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.79,
      distance: 0.21,
    },
    {
      row: {
        id: 'demo-6',
        businessId: 'biz-clear-legal',
        ownerId: 'owner-6',
        offeringId: 'off-contracts',
        textVector: [],
        businessName: 'Clear Path Legal Services',
        businessDescription: 'Business law firm specializing in contracts, intellectual property, and corporate compliance.',
        primaryCategory: 'Legal Services',
        tagsJson: JSON.stringify(['legal', 'contracts', 'IP', 'compliance']),
        offeringTitle: 'Contract Review & Drafting',
        offeringDescription: 'Expert contract review, drafting, and negotiation services for businesses.',
        offeringType: 'service',
        serviceAreaType: 'remote',
        serviceAreaLat: null,
        serviceAreaLng: null,
        serviceAreaRadiusMiles: null,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 9,
        totalCompletions: 56,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 300 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.76,
      distance: 0.24,
    },
    {
      row: {
        id: 'demo-7',
        businessId: 'biz-green-landscapes',
        ownerId: 'owner-7',
        offeringId: 'off-design',
        textVector: [],
        businessName: 'Green Horizons Landscaping',
        businessDescription: 'Professional landscaping and garden design services for residential and commercial properties.',
        primaryCategory: 'Home Services',
        tagsJson: JSON.stringify(['landscaping', 'garden design', 'outdoor', 'residential']),
        offeringTitle: 'Landscape Design',
        offeringDescription: 'Custom landscape design and installation for beautiful outdoor spaces.',
        offeringType: 'service',
        serviceAreaType: 'radius',
        serviceAreaLat: 33.4484,
        serviceAreaLng: -112.0740,
        serviceAreaRadiusMiles: 40,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 6,
        totalCompletions: 42,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 250 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.73,
      distance: 0.27,
    },
    {
      row: {
        id: 'demo-8',
        businessId: 'biz-bright-minds',
        ownerId: 'owner-8',
        offeringId: 'off-tutoring',
        textVector: [],
        businessName: 'Bright Minds Learning Center',
        businessDescription: 'Educational tutoring and test prep services for K-12 and college students.',
        primaryCategory: 'Education & Training',
        tagsJson: JSON.stringify(['tutoring', 'education', 'test prep', 'SAT']),
        offeringTitle: 'SAT/ACT Test Prep',
        offeringDescription: 'Comprehensive test preparation courses with proven score improvement strategies.',
        offeringType: 'service',
        serviceAreaType: 'remote',
        serviceAreaLat: null,
        serviceAreaLng: null,
        serviceAreaRadiusMiles: null,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 14,
        totalCompletions: 112,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.71,
      distance: 0.29,
    },
    {
      row: {
        id: 'demo-9',
        businessId: 'biz-secure-tech',
        ownerId: 'owner-9',
        offeringId: 'off-it-support',
        textVector: [],
        businessName: 'SecureTech IT Solutions',
        businessDescription: 'Managed IT services and cybersecurity solutions for small and medium businesses.',
        primaryCategory: 'Technology & Software',
        tagsJson: JSON.stringify(['IT support', 'cybersecurity', 'managed services', 'cloud']),
        offeringTitle: 'Managed IT Support',
        offeringDescription: '24/7 IT support and monitoring services with proactive maintenance.',
        offeringType: 'service',
        serviceAreaType: 'remote',
        serviceAreaLat: null,
        serviceAreaLng: null,
        serviceAreaRadiusMiles: null,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 10,
        totalCompletions: 78,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 220 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.68,
      distance: 0.32,
    },
    {
      row: {
        id: 'demo-10',
        businessId: 'biz-creative-studio',
        ownerId: 'owner-10',
        offeringId: 'off-branding',
        textVector: [],
        businessName: 'Creative Vision Studio',
        businessDescription: 'Boutique creative agency specializing in branding, graphic design, and visual identity.',
        primaryCategory: 'Arts & Design',
        tagsJson: JSON.stringify(['branding', 'graphic design', 'visual identity', 'creative']),
        offeringTitle: 'Brand Identity Design',
        offeringDescription: 'Complete brand identity packages including logo, color palette, and style guide.',
        offeringType: 'service',
        serviceAreaType: 'remote',
        serviceAreaLat: null,
        serviceAreaLng: null,
        serviceAreaRadiusMiles: null,
        serviceAreaRegionsJson: null,
        businessStatus: 'active',
        isVerified: true,
        proofSharingEnabled: true,
        verifiedProofCount: 8,
        totalCompletions: 51,
        exactTagMatches: 0,
        lastVerifiedAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
        createdAt: Date.now() - 140 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        schemaVersion: '1.0.0',
      },
      similarity: 0.65,
      distance: 0.35,
    },
  ];

  return demoBusinesses.slice(0, limit);
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface MarketplaceSearchConfig {
  /** Default result limit */
  defaultLimit: number;

  /** Maximum result limit */
  maxLimit: number;

  /** Minimum similarity threshold */
  minSimilarity: number;

  /** Maximum evidence score */
  maxEvidenceScore: number;

  /** Maximum recency boost */
  maxRecencyBoost: number;

  /** Recency decay half-life in days */
  recencyHalfLifeDays: number;

  /** Evidence scoring weights */
  evidenceWeights: {
    verifiedProof: number;
    exactTagMatch: number;
    recentCompletion: number;
  };

  /** Embedding model */
  embeddingModel: string;
}

const DEFAULT_CONFIG: MarketplaceSearchConfig = {
  defaultLimit: 20,
  maxLimit: 100,
  minSimilarity: 0.3,
  maxEvidenceScore: 1.0,
  maxRecencyBoost: 0.2,
  recencyHalfLifeDays: 30,
  evidenceWeights: {
    verifiedProof: 0.4,
    exactTagMatch: 0.3,
    recentCompletion: 0.3,
  },
  embeddingModel: 'openai/text-embedding-3-small',
};

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Calculate evidence score from proof metrics.
 *
 * Formula: evidenceScore = min(1.0, w1*verifiedScore + w2*tagMatchScore + w3*completionScore)
 */
function calculateEvidenceScore(
  metrics: ProofMetrics,
  queryTags: string[],
  config: MarketplaceSearchConfig
): { score: number; factors: RankingFactor[] } {
  const factors: RankingFactor[] = [];

  // Verified proof score (log scale, caps at 10 proofs)
  const verifiedScore = Math.min(1.0, Math.log10(metrics.verifiedCount + 1) / Math.log10(11));
  const verifiedContribution = verifiedScore * config.evidenceWeights.verifiedProof;
  factors.push({
    name: 'verified_proofs',
    contribution: verifiedContribution,
    description: `${metrics.verifiedCount} verified proof${metrics.verifiedCount !== 1 ? 's' : ''} of work`,
  });

  // Exact tag match score
  const tagMatchScore = queryTags.length > 0
    ? Math.min(1.0, metrics.exactTagMatches / queryTags.length)
    : 0;
  const tagMatchContribution = tagMatchScore * config.evidenceWeights.exactTagMatch;
  if (metrics.exactTagMatches > 0) {
    factors.push({
      name: 'tag_matches',
      contribution: tagMatchContribution,
      description: `${metrics.exactTagMatches} tag${metrics.exactTagMatches !== 1 ? 's' : ''} matching your search`,
    });
  }

  // Completion score (log scale, caps at 100 completions)
  const completionScore = Math.min(1.0, Math.log10(metrics.totalCompletions + 1) / Math.log10(101));
  const completionContribution = completionScore * config.evidenceWeights.recentCompletion;
  if (metrics.totalCompletions > 0) {
    factors.push({
      name: 'completions',
      contribution: completionContribution,
      description: `${metrics.totalCompletions} completed job${metrics.totalCompletions !== 1 ? 's' : ''}`,
    });
  }

  const totalScore = Math.min(
    config.maxEvidenceScore,
    verifiedContribution + tagMatchContribution + completionContribution
  );

  return { score: totalScore, factors };
}

/**
 * Calculate recency boost based on last verified proof.
 *
 * Uses exponential decay: boost = maxBoost * 2^(-daysSinceVerified / halfLife)
 */
function calculateRecencyBoost(
  lastVerifiedAt: number | null,
  config: MarketplaceSearchConfig
): { boost: number; factor: RankingFactor | null } {
  if (!lastVerifiedAt) {
    return { boost: 0, factor: null };
  }

  const daysSinceVerified = (Date.now() - lastVerifiedAt) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(2, -daysSinceVerified / config.recencyHalfLifeDays);
  const boost = config.maxRecencyBoost * decayFactor;

  const factor: RankingFactor = {
    name: 'recency',
    contribution: boost,
    description: daysSinceVerified < 1
      ? 'Verified work today'
      : daysSinceVerified < 7
        ? 'Verified work this week'
        : daysSinceVerified < 30
          ? 'Verified work this month'
          : 'Has verified work history',
  };

  return { boost, factor };
}

/**
 * Calculate final score using the ranking formula.
 *
 * finalScore = relevanceScore * (1 + evidenceScore) * (1 + recencyBoost)
 */
function calculateFinalScore(
  relevanceScore: number,
  evidenceScore: number,
  recencyBoost: number
): number {
  return relevanceScore * (1 + evidenceScore) * (1 + recencyBoost);
}

/**
 * Extract query tags from search query for tag matching.
 */
function extractQueryTags(query: string): string[] {
  // Simple tag extraction - split on common delimiters and filter short words
  return query
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(word => word.length > 2)
    .map(word => word.replace(/[^a-z0-9]/g, ''))
    .filter(word => word.length > 0);
}

/**
 * Count exact tag matches between query tags and business tags.
 */
function countExactTagMatches(queryTags: string[], businessTags: string[]): number {
  const lowerBusinessTags = businessTags.map(t => t.toLowerCase());
  return queryTags.filter(qt => lowerBusinessTags.includes(qt)).length;
}

/**
 * Generate human-readable ranking explanation.
 */
function generateExplanation(
  scores: ScoreBreakdown,
  factors: RankingFactor[],
  proofMetrics: ProofMetrics
): RankingExplanation {
  const reasonCodes: string[] = [];

  // Determine primary ranking reason
  if (scores.evidence > 0.5) {
    reasonCodes.push('HIGH_EVIDENCE');
  }
  if (scores.relevance > 0.8) {
    reasonCodes.push('HIGH_RELEVANCE');
  }
  if (scores.recency > 0.1) {
    reasonCodes.push('RECENT_ACTIVITY');
  }
  if (proofMetrics.verifiedCount > 5) {
    reasonCodes.push('MANY_VERIFICATIONS');
  }
  if (proofMetrics.exactTagMatches > 2) {
    reasonCodes.push('STRONG_TAG_MATCH');
  }

  // Generate summary
  let summary = '';
  if (scores.evidence > 0.3 && proofMetrics.verifiedCount > 0) {
    summary = `Highly relevant with ${proofMetrics.verifiedCount} verified proof${proofMetrics.verifiedCount !== 1 ? 's' : ''} of work`;
  } else if (scores.relevance > 0.7) {
    summary = 'Strong match for your search';
  } else {
    summary = 'Matches your search criteria';
  }

  return {
    summary,
    factors: factors.filter(f => f.contribution > 0),
    reasonCodes,
  };
}

// =============================================================================
// MAIN SEARCH FUNCTION
// =============================================================================

/**
 * Generate embedding for search query.
 */
async function generateQueryEmbedding(
  env: Env,
  query: string,
  config: MarketplaceSearchConfig
): Promise<number[]> {
  const openRouterApiKey = env.OPENROUTER_API_KEY;
  const openRouterBaseUrl = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  const response = await fetch(`${openRouterBaseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'https://orion.suite',
      'X-Title': 'Orion Marketplace',
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: query,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding generation failed: ${error}`);
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  const firstEmbedding = data.data?.[0]?.embedding;
  if (!firstEmbedding) {
    throw new Error('No embedding returned from API');
  }
  return firstEmbedding;
}

/**
 * Search LanceDB for matching offerings.
 *
 * IMPORTANT: Only returns businesses with proofSharingEnabled = true
 * and status = 'active'.
 */
async function searchLanceDb(
  _env: Env,
  queryVector: number[],
  filters: MarketplaceSearchFilters,
  limit: number
): Promise<MarketplaceSearchResult[]> {
  // TODO: Replace with actual LanceDB client
  // const lancedb = await createLanceDBAdapter(env.LANCEDB_URI);

  const filterConditions: string[] = [];

  // ALWAYS filter to active businesses only
  filterConditions.push(`businessStatus = 'active'`);

  // ALWAYS filter to businesses with proof sharing enabled
  filterConditions.push(`proofSharingEnabled = true`);

  // Category filter
  if (filters.categories && filters.categories.length > 0) {
    const cats = filters.categories.map(c => `'${c}'`).join(', ');
    filterConditions.push(`primaryCategory IN (${cats})`);
  }

  // Verified proof filter
  if (filters.verifiedProofOnly) {
    filterConditions.push(`verifiedProofCount > 0`);
  }

  // Minimum proof count filter
  if (filters.minProofCount !== undefined) {
    filterConditions.push(`verifiedProofCount >= ${filters.minProofCount}`);
  }

  const whereClause = filterConditions.join(' AND ');

  console.log(`[Marketplace LanceDB] Would search with filter: ${whereClause}`);
  console.log(`[Marketplace LanceDB] Query vector length: ${queryVector.length}`);
  console.log(`[Marketplace LanceDB] Limit: ${limit}`);

  // Demo mode: Return sample marketplace data for MVP demonstration
  // TODO: Replace with actual LanceDB client implementation
  return getDemoMarketplaceResults(limit);
}

/**
 * Fetch proof metrics from Neo4j for a list of business IDs.
 */
async function fetchProofMetrics(
  _env: Env,
  businessIds: string[]
): Promise<Map<string, ProofMetrics>> {
  // TODO: Replace with actual Neo4j client
  // const neo4j = await createNeo4jAdapter(env.NEO4J_URI, env.NEO4J_USER, env.NEO4J_PASSWORD);
  // const results = await neo4j.runQuery(MARKETPLACE_CYPHER_QUERIES.getProofMetricsByBusinessIds, { businessIds });

  console.log(`[Marketplace Neo4j] Would fetch proof metrics for ${businessIds.length} businesses`);

  // Return empty map for now
  return new Map();
}

/**
 * Record search session in Neo4j for analytics.
 */
async function recordSearchSession(
  _env: Env,
  searchSessionId: string,
  _userId: string | undefined,
  query: string,
  _filters: MarketplaceSearchFilters | undefined,
  _userLocation: { lat: number; lng: number } | undefined,
  resultCount: number,
  _topResultIds: string[],
  processingTimeMs: number
): Promise<void> {
  // TODO: Replace with actual Neo4j client
  console.log(`[Marketplace Neo4j] Would record search session: ${searchSessionId}`);
  console.log(`[Marketplace Neo4j] Query: "${query}", Results: ${resultCount}, Time: ${processingTimeMs}ms`);
}

/**
 * Generate rank trace for a single result.
 */
function generateRankTrace(
  searchSessionId: string,
  businessId: string,
  query: string,
  scores: ScoreBreakdown,
  matchedTags: string[],
  proofMetrics: ProofMetrics,
  reasonCodes: string[]
): RankTrace {
  return {
    traceId: crypto.randomUUID(),
    searchSessionId,
    businessId,
    query,
    scores,
    matchedTags,
    proofMetrics,
    reasonCodes,
    generatedAt: Date.now(),
  };
}

/**
 * Perform marketplace search with proof-of-work ranking.
 *
 * @param env - Worker environment
 * @param request - Search request
 * @param config - Search configuration (optional)
 * @returns Search response with ranked results
 */
export async function marketplaceSearch(
  env: Env,
  request: MarketplaceSearchRequest,
  config: MarketplaceSearchConfig = DEFAULT_CONFIG
): Promise<MarketplaceSearchResponse> {
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

  try {
    // Step 1: Generate query embedding
    const queryVector = await generateQueryEmbedding(env, request.query, config);

    // Step 2: Extract query tags for tag matching
    const queryTags = extractQueryTags(request.query);

    // Step 3: Search LanceDB for matching offerings
    const vectorResults = await searchLanceDb(
      env,
      queryVector,
      request.filters ?? {},
      effectiveLimit * 2 // Fetch extra for post-filtering
    );

    // Filter by minimum similarity
    const filteredResults = vectorResults.filter(
      r => r.similarity >= config.minSimilarity
    );

    if (filteredResults.length === 0) {
      // Record empty search session
      await recordSearchSession(
        env,
        searchSessionId,
        request.userId,
        request.query,
        request.filters,
        request.userLocation,
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
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 4: Fetch proof metrics from Neo4j
    const businessIds = [...new Set(filteredResults.map(r => r.row.businessId))];
    const proofMetricsMap = await fetchProofMetrics(env, businessIds);

    // Step 5: Calculate scores and rank results
    const rankedResults: RankedSearchResult[] = filteredResults.map(result => {
      const row = result.row;
      const businessTags = JSON.parse(row.tagsJson) as string[];

      // Get proof metrics (default to stored values if not in map)
      const proofMetrics: ProofMetrics = proofMetricsMap.get(row.businessId) ?? {
        verifiedCount: row.verifiedProofCount,
        exactTagMatches: countExactTagMatches(queryTags, businessTags),
        totalCompletions: row.totalCompletions,
        lastVerifiedAt: row.lastVerifiedAt,
      };

      // Update exact tag matches
      proofMetrics.exactTagMatches = countExactTagMatches(queryTags, businessTags);

      // Calculate evidence score
      const { score: evidenceScore, factors: evidenceFactors } = calculateEvidenceScore(
        proofMetrics,
        queryTags,
        config
      );

      // Calculate recency boost
      const { boost: recencyBoost, factor: recencyFactor } = calculateRecencyBoost(
        proofMetrics.lastVerifiedAt,
        config
      );

      // Calculate final score
      const relevanceScore = result.similarity;
      const finalScore = calculateFinalScore(relevanceScore, evidenceScore, recencyBoost);

      // Build score breakdown
      const scores: ScoreBreakdown = {
        relevance: relevanceScore,
        evidence: evidenceScore,
        recency: recencyBoost,
        final: finalScore,
      };

      // Collect all factors
      const allFactors: RankingFactor[] = [
        {
          name: 'relevance',
          contribution: relevanceScore,
          description: `${Math.round(relevanceScore * 100)}% match to your search`,
        },
        ...evidenceFactors,
      ];
      if (recencyFactor) {
        allFactors.push(recencyFactor);
      }

      // Generate explanation
      const explanation = generateExplanation(scores, allFactors, proofMetrics);

      // Calculate distance if user location provided
      let distanceMiles: number | null = null;
      if (request.userLocation && row.serviceAreaLat && row.serviceAreaLng) {
        distanceMiles = calculateDistance(
          request.userLocation.lat,
          request.userLocation.lng,
          row.serviceAreaLat,
          row.serviceAreaLng
        );
      }

      return {
        businessId: row.businessId,
        offeringId: row.offeringId,
        businessName: row.businessName,
        businessDescription: row.businessDescription,
        primaryCategory: row.primaryCategory,
        tags: businessTags,
        offeringTitle: row.offeringTitle,
        offeringDescription: row.offeringDescription,
        finalScore,
        scores,
        proofMetrics,
        distanceMiles,
        explanation,
      };
    });

    // Step 6: Sort by final score (descending)
    rankedResults.sort((a, b) => b.finalScore - a.finalScore);

    // Step 7: Apply pagination
    const offset = request.offset ?? 0;
    const paginatedResults = rankedResults.slice(offset, offset + effectiveLimit);
    const hasMore = rankedResults.length > offset + effectiveLimit;

    // Step 8: Record search session
    const processingTimeMs = Date.now() - startTime;
    await recordSearchSession(
      env,
      searchSessionId,
      request.userId,
      request.query,
      request.filters,
      request.userLocation,
      rankedResults.length,
      paginatedResults.slice(0, 10).map(r => r.businessId),
      processingTimeMs
    );

    return {
      searchSessionId,
      query: request.query,
      totalCount: rankedResults.length,
      results: paginatedResults,
      hasMore,
      processingTimeMs,
    };
  } catch (error) {
    console.error('[Marketplace Search] Error:', error);
    throw error;
  }
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
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Generate rank traces for debugging/explainability.
 */
export function generateRankTraces(
  searchSessionId: string,
  query: string,
  results: RankedSearchResult[]
): RankTrace[] {
  return results.map(result =>
    generateRankTrace(
      searchSessionId,
      result.businessId,
      query,
      result.scores,
      result.tags.filter(t =>
        query.toLowerCase().includes(t.toLowerCase())
      ),
      result.proofMetrics,
      result.explanation.reasonCodes
    )
  );
}

// Export config for testing
export { DEFAULT_CONFIG as MARKETPLACE_SEARCH_CONFIG };
export type { MarketplaceSearchConfig };
