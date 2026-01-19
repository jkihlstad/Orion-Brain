/**
 * debugRoutes.ts
 * Debug API routes for Exchange admin dashboard
 * Part of Window 6: Dashboard hooks & rule debugger
 */

import { Env } from "../../env";
import { exchangeSearch } from "../services/exchangeSearch";
import {
  calculateEvidenceScore,
  EVIDENCE_SCORING_CONFIG,
  type ProofData as EvidenceProofData,
  type BusinessProfileData,
  type ProofArtifact,
  type ChecklistItem,
} from "../services/evidenceScoring";
import {
  fetchBusinessById,
  fetchProofsByBusinessId,
  getSearchAnalytics as fetchSearchAnalytics,
} from "../adapters/exchangeData";

export interface DebugSearchRequest {
  query: string;
  riskTolerance?: string;
  applyUserPrefs?: boolean;
  location?: { lat: number; lng: number };
  debug?: boolean;
}

export interface DebugSearchResponse {
  ok: boolean;
  results: DebugSearchResult[];
  totalCount: number;
  processingTimeMs: number;
  debug?: {
    rankingWeights: {
      vectorSimilarity: number;
      evidenceScore: number;
      taskFrequency: number;
      recency: number;
      profileQuality: number;
    };
  };
}

export interface DebugSearchResult {
  businessId: string;
  businessName: string;
  category: string;
  isVerified: boolean;
  position: number;
  finalScore: number;
  scores: {
    vectorSimilarity: number;
    evidenceScore: number;
    taskFrequency: number;
    recency: number;
    profileQuality: number;
  };
  reasons: string[];
  evidenceRefs: Array<{
    type: string;
    refId: string;
    label: string;
    weight: number;
  }>;
  evidenceBreakdown?: {
    total: number;
    baseScore: number;
    completionConfidence: number;
    mediaRichness: number;
    confirmations: number;
    recencyBoost: number;
    fraudPenalty: number;
  };
  distanceMiles: number | null;
}

// Default ranking weights matching the formula
const DEFAULT_RANKING_WEIGHTS = {
  vectorSimilarity: 0.55,
  evidenceScore: 0.25,
  taskFrequency: 0.10,
  recency: 0.05,
  profileQuality: 0.05,
};

/**
 * Handle debug search request - full score breakdown for admin testing
 */
export async function handleDebugSearch(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as DebugSearchRequest;

    const startTime = Date.now();

    // Build filters with proper handling for exactOptionalPropertyTypes
    const filters: {
      riskTolerance?: "verified_only" | "high_evidence_preferred" | "open_to_new";
      userLocation?: { lat: number; lng: number };
    } = {};

    if (body.riskTolerance) {
      filters.riskTolerance = body.riskTolerance as "verified_only" | "high_evidence_preferred" | "open_to_new";
    }
    if (body.location) {
      filters.userLocation = body.location;
    }

    // Execute search with placeholder admin userId for debug
    const searchResult = await exchangeSearch(env, {
      query: body.query,
      userId: "admin_debug_user",
      filters,
      page: 1,
      limit: 50,
      applyUserPreferences: body.applyUserPrefs ?? false,
    });

    const processingTimeMs = Date.now() - startTime;

    // Transform results with full debug info
    const debugResults: DebugSearchResult[] = searchResult.results.map((result, index) => ({
      businessId: result.businessId,
      businessName: result.business.name,
      category: result.business.category,
      isVerified: result.business.isVerified,
      position: index + 1,
      finalScore: result.finalScore,
      scores: {
        vectorSimilarity: result.scores.vectorSimilarity,
        evidenceScore: result.scores.evidenceScore,
        taskFrequency: result.scores.taskFrequency,
        recency: result.scores.recency,
        profileQuality: result.scores.profileQuality,
      },
      reasons: result.explanation.reasons.map((r) => r.label),
      evidenceRefs: result.explanation.evidenceRefs.map((ref) => ({
        type: ref.type,
        refId: ref.refId,
        label: ref.label,
        weight: ref.weight,
      })),
      distanceMiles: result.distanceMiles,
    }));

    const response: DebugSearchResponse = {
      ok: true,
      results: debugResults,
      totalCount: searchResult.totalCount,
      processingTimeMs,
      debug: {
        rankingWeights: DEFAULT_RANKING_WEIGHTS,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Debug search error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Handle evidence score inspection for a specific business
 */
export async function handleEvidenceInspection(
  _request: Request,
  env: Env,
  businessId: string
): Promise<Response> {
  try {
    // Fetch business data
    const businessData = await fetchBusinessData(env, businessId);
    if (!businessData) {
      return new Response(
        JSON.stringify({ ok: false, error: "Business not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch proofs for the business
    const proofs = await fetchBusinessProofs(env, businessId);

    // Build profile data for scoring (matching BusinessProfileData interface)
    const profileData: BusinessProfileData = {
      businessId,
      profileCompleteness: calculateProfileCompleteness(businessData),
      hasVerifiedIdentity: businessData.isVerified,
      hasConnectedStripe: businessData.stripeAccountId !== null,
      hasCoverPhoto: businessData.profilePhotoUrl !== undefined,
      hasServiceArea: true, // Placeholder - would come from business data
      hasOfferings: true, // Placeholder - would come from business data
      accountAgeDays: 30, // Placeholder - would come from business data
      isProUser: false, // Placeholder - would come from business data
    };

    // Use the most recent proof for scoring, or create a placeholder if none exist
    const mostRecentProof = proofs.length > 0 ? proofs[0] : null;

    // Build proofData for scoring
    let proofData: EvidenceProofData;
    if (mostRecentProof) {
      // Convert artifacts with proper typing
      const artifacts: ProofArtifact[] = (mostRecentProof.artifacts || []).map(
        (a: { type: string; contentHash: string }): ProofArtifact => ({
          type: a.type as ProofArtifact["type"],
          sizeBytes: 0,
          contentHash: a.contentHash,
        })
      );

      // Convert checklist with proper typing
      const checklist: ChecklistItem[] | undefined = mostRecentProof.checklist
        ? mostRecentProof.checklist.map(
            (c: { completed: boolean }): ChecklistItem => ({
              itemId: crypto.randomUUID(),
              text: "",
              completed: c.completed,
            })
          )
        : undefined;

      // Build base proofData with required fields
      const baseProofData: EvidenceProofData = {
        proofId: mostRecentProof.proofId,
        businessId,
        taskCategory: mostRecentProof.taskCategory,
        skillTags: [],
        artifacts,
        submittedAt: mostRecentProof.submittedAt,
        historicalProofsCount: proofs.length,
      };

      // Add optional fields only if they have values
      if (checklist) {
        baseProofData.checklist = checklist;
      }
      if (mostRecentProof.customerConfirmation) {
        const confirmation: {
          confirmationType: "work_completed" | "quality_satisfactory" | "recommendation";
          confirmedAt: number;
          customerVerified: boolean;
          rating?: number;
          comments?: string;
        } = {
          confirmationType: mostRecentProof.customerConfirmation
            .confirmationType as
            | "work_completed"
            | "quality_satisfactory"
            | "recommendation",
          confirmedAt: mostRecentProof.customerConfirmation.confirmedAt,
          customerVerified:
            mostRecentProof.customerConfirmation.customerVerified,
        };
        if (mostRecentProof.customerConfirmation.rating !== undefined) {
          confirmation.rating = mostRecentProof.customerConfirmation.rating;
        }
        baseProofData.customerConfirmation = confirmation;
      }
      const daysSinceLastVerified = calculateDaysSinceLastProof(proofs);
      if (daysSinceLastVerified < 999) {
        baseProofData.daysSinceLastVerified = daysSinceLastVerified;
      }

      proofData = baseProofData;
    } else {
      // Placeholder for businesses with no proofs
      proofData = {
        proofId: "placeholder",
        businessId,
        taskCategory: "general",
        skillTags: [],
        artifacts: [],
        submittedAt: Date.now(),
        historicalProofsCount: 0,
      };
    }

    // Calculate evidence score with full breakdown
    const scoreResult = calculateEvidenceScore(
      proofData,
      profileData,
      undefined, // fraud indicators - would come from fraud detection service
      EVIDENCE_SCORING_CONFIG
    );

    // Build detailed response
    const response = {
      ok: true,
      business: {
        name: businessData.name,
        category: businessData.category,
        isVerified: businessData.isVerified,
        totalProofs: proofs.length,
        verifiedProofs: proofs.filter((p) => p.status === "verified").length,
      },
      scoreDetails: {
        total: scoreResult.finalScore * 100, // Convert to 0-100 scale
        baseScore: scoreResult.breakdown.base * 40, // Scale components
        completionConfidence: scoreResult.breakdown.completionConfidence * 20,
        mediaRichness: scoreResult.breakdown.mediaRichness * 15,
        confirmations: scoreResult.breakdown.confirmations * 15,
        recencyBoost: scoreResult.breakdown.recencyBoost * 10,
        fraudPenalty: scoreResult.breakdown.fraudPenalty * 50,
        baseDetails: {
          proofCountFactor: Math.min(proofs.filter((p) => p.status === "verified").length * 4, 30),
          qualityFactor: calculateQualityFactor(proofs),
          verificationBonus: businessData.isVerified ? 5 : 0,
        },
        completionDetails: {
          avgChecklistCompletion: calculateAvgChecklistCompletion(proofs),
          proofsWithChecklists: proofs.filter((p) => p.checklist && p.checklist.length > 0).length,
          perfectCompletions: proofs.filter(
            (p) => p.checklist && p.checklist.every((c: { completed: boolean }) => c.completed)
          ).length,
        },
        mediaDetails: {
          videoProofs: proofs.filter((p) => p.artifacts?.some((a: { type: string }) => a.type === "video")).length,
          videoBonus: Math.min(proofs.filter((p) => p.artifacts?.some((a: { type: string }) => a.type === "video")).length * 2, 8),
          beforeAfterSets: countBeforeAfterSets(proofs),
          beforeAfterBonus: Math.min(countBeforeAfterSets(proofs) * 2, 6),
          receiptUploads: proofs.filter((p) => p.artifacts?.some((a: { type: string }) => a.type === "receipt")).length,
          receiptBonus: Math.min(proofs.filter((p) => p.artifacts?.some((a: { type: string }) => a.type === "receipt")).length, 3),
        },
        confirmationDetails: {
          totalConfirmations: proofs.filter((p) => p.customerConfirmation).length,
          verifiedConfirmations: proofs.filter(
            (p) => p.customerConfirmation?.customerVerified
          ).length,
          avgRating: calculateAvgRating(proofs),
          recommendationRate: calculateRecommendationRate(proofs),
        },
        recencyDetails: {
          daysSinceLastProof: calculateDaysSinceLastProof(proofs),
          proofsLast30Days: countProofsInDays(proofs, 30),
          proofsLast90Days: countProofsInDays(proofs, 90),
        },
        fraudDetails: scoreResult.breakdown.fraudPenalty > 0
          ? {
              detectedPatterns: scoreResult.reasons
                .filter((r) => r.impact === "negative")
                .map((r) => r.label),
              suspiciousPhotoSimilarity: false, // Would come from fraud detection
              locationAnomalies: 0,
              timingAnomalies: 0,
            }
          : undefined,
      },
      recentProofs: proofs.slice(0, 10).map((p) => ({
        proofId: p.proofId,
        taskCategory: p.taskCategory,
        status: p.status,
        artifactCount: p.artifacts?.length ?? 0,
        hasVideo: p.artifacts?.some((a: { type: string }) => a.type === "video") ?? false,
        hasChecklist: p.checklist !== undefined && p.checklist.length > 0,
        checklistCompleted: p.checklist?.filter((c: { completed: boolean }) => c.completed).length ?? 0,
        checklistTotal: p.checklist?.length ?? 0,
        customerConfirmed: p.customerConfirmation !== undefined,
        submittedAt: p.submittedAt,
      })),
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Evidence inspection error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Handle search analytics request
 */
export async function handleSearchAnalytics(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") || "24h";

    // Calculate time range
    const now = Date.now();
    const rangeMs =
      range === "24h"
        ? 24 * 60 * 60 * 1000
        : range === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
    const startTime = now - rangeMs;

    // Try to fetch real analytics, fall back to placeholder if needed
    let analytics: AnalyticsData;
    try {
      const realAnalytics = await fetchSearchAnalytics(env, startTime, now);
      // Build analytics without optional rankingImpact for exactOptionalPropertyTypes
      analytics = {
        totalSearches: realAnalytics.totalSearches,
        totalClicks: realAnalytics.totalClicks,
        avgClickPosition: 2.4, // Would need separate query
        topQueries: [], // Would need separate query
        zeroResultQueries: [], // Would need separate query
        categoryDistribution: [], // Would need separate query
        clickPositionDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    } catch {
      // Fall back to placeholder if real data isn't available
      analytics = getPlaceholderAnalytics(range);
    }

    const response = {
      ok: true,
      stats: {
        totalSearches: analytics.totalSearches,
        totalClicks: analytics.totalClicks,
        clickThroughRate: analytics.totalSearches > 0
          ? analytics.totalClicks / analytics.totalSearches
          : 0,
        avgClickPosition: analytics.avgClickPosition,
        volumeByHour: generateVolumeByHour(range),
        topQueries: analytics.topQueries,
        zeroResultQueries: analytics.zeroResultQueries,
        categoryDistribution: analytics.categoryDistribution,
        clickPositionDistribution: analytics.clickPositionDistribution,
        rankingImpact: {
          vectorSimClicked: analytics.rankingImpact?.vectorSimClicked ?? 0.75,
          vectorSimUnclicked: analytics.rankingImpact?.vectorSimUnclicked ?? 0.45,
          evidenceClicked: analytics.rankingImpact?.evidenceClicked ?? 0.82,
          evidenceUnclicked: analytics.rankingImpact?.evidenceUnclicked ?? 0.55,
          recencyClicked: analytics.rankingImpact?.recencyClicked ?? 0.68,
          recencyUnclicked: analytics.rankingImpact?.recencyUnclicked ?? 0.42,
        },
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Search analytics error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Helper functions

interface BusinessData {
  businessId: string;
  name: string;
  category: string;
  isVerified: boolean;
  stripeAccountId: string | null;
  profilePhotoUrl?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
}

interface LocalProofData {
  proofId: string;
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
}

async function fetchBusinessData(env: Env, businessId: string): Promise<BusinessData | null> {
  // Fetch from Neo4j via adapter
  const adapterBusiness = await fetchBusinessById(env, businessId);

  if (!adapterBusiness) {
    return null;
  }

  // Map adapter type to local BusinessData type with conditional optional properties
  const result: BusinessData = {
    businessId: adapterBusiness.businessId,
    name: adapterBusiness.name,
    category: adapterBusiness.category,
    isVerified: adapterBusiness.isVerified,
    stripeAccountId: adapterBusiness.hasStripe ? "connected" : null,
  };

  if (adapterBusiness.profilePhotoUrl) {
    result.profilePhotoUrl = adapterBusiness.profilePhotoUrl;
  }
  if (adapterBusiness.description) {
    result.description = adapterBusiness.description;
  }

  return result;
}

async function fetchBusinessProofs(env: Env, businessId: string): Promise<LocalProofData[]> {
  // Fetch from Neo4j via adapter
  const proofs = await fetchProofsByBusinessId(env, businessId);

  // Map to local type with conditional optional properties
  return proofs.map((p) => {
    const result: LocalProofData = {
      proofId: p.proofId,
      taskCategory: p.taskCategory,
      status: p.status,
      submittedAt: p.submittedAt,
    };

    if (p.artifacts) {
      result.artifacts = p.artifacts;
    }
    if (p.checklist) {
      result.checklist = p.checklist;
    }
    if (p.customerConfirmation) {
      result.customerConfirmation = p.customerConfirmation;
    }

    return result;
  });
}

interface AnalyticsData {
  totalSearches: number;
  totalClicks: number;
  avgClickPosition: number;
  topQueries: Array<{ query: string; count: number; ctr: number }>;
  zeroResultQueries: Array<{ query: string; count: number; ctr: number }>;
  categoryDistribution: Array<{ category: string; count: number; percentage: number }>;
  clickPositionDistribution: Record<number, number>;
  rankingImpact?: {
    vectorSimClicked: number;
    vectorSimUnclicked: number;
    evidenceClicked: number;
    evidenceUnclicked: number;
    recencyClicked: number;
    recencyUnclicked: number;
  };
}

function getPlaceholderAnalytics(_range: string): AnalyticsData {
  // Placeholder data
  return {
    totalSearches: 1250,
    totalClicks: 375,
    avgClickPosition: 2.4,
    topQueries: [
      { query: "plumber near me", count: 145, ctr: 0.42 },
      { query: "electrician", count: 98, ctr: 0.38 },
      { query: "house cleaning", count: 87, ctr: 0.45 },
    ],
    zeroResultQueries: [
      { query: "specific obscure service", count: 12, ctr: 0 },
      { query: "misspelled query", count: 8, ctr: 0 },
    ],
    categoryDistribution: [
      { category: "Home Repair", count: 450, percentage: 0.36 },
      { category: "Cleaning", count: 280, percentage: 0.224 },
      { category: "Plumbing", count: 220, percentage: 0.176 },
    ],
    clickPositionDistribution: {
      1: 180, 2: 95, 3: 45, 4: 25, 5: 15, 6: 8, 7: 4, 8: 2, 9: 1, 10: 0,
    },
    rankingImpact: {
      vectorSimClicked: 0.78,
      vectorSimUnclicked: 0.52,
      evidenceClicked: 0.85,
      evidenceUnclicked: 0.58,
      recencyClicked: 0.72,
      recencyUnclicked: 0.45,
    },
  };
}

function generateVolumeByHour(range: string): Array<{ hour: string; count: number }> {
  // Generate placeholder hourly data
  const hours = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  return Array.from({ length: hours }, (_, i) => ({
    hour: range === "24h" ? `${i}:00` : `Day ${i + 1}`,
    count: Math.floor(Math.random() * 100) + 10,
  }));
}

function calculateQualityFactor(proofs: LocalProofData[]): number {
  if (proofs.length === 0) return 0;
  const avgArtifacts = proofs.reduce((sum, p) => sum + (p.artifacts?.length ?? 0), 0) / proofs.length;
  return Math.min(avgArtifacts * 2, 10);
}

function calculateAvgChecklistCompletion(proofs: LocalProofData[]): number {
  const proofsWithChecklists = proofs.filter((p) => p.checklist && p.checklist.length > 0);
  if (proofsWithChecklists.length === 0) return 0;
  return proofsWithChecklists.reduce((sum, p) => {
    const completed = p.checklist!.filter((c) => c.completed).length;
    return sum + completed / p.checklist!.length;
  }, 0) / proofsWithChecklists.length;
}

function countBeforeAfterSets(proofs: LocalProofData[]): number {
  return proofs.reduce((count, p) => {
    if (!p.artifacts) return count;
    const befores = p.artifacts.filter((a) => a.type === "photo_before").length;
    const afters = p.artifacts.filter((a) => a.type === "photo_after").length;
    return count + Math.min(befores, afters);
  }, 0);
}

function calculateAvgRating(proofs: LocalProofData[]): number {
  const rated = proofs.filter((p) => p.customerConfirmation?.rating);
  if (rated.length === 0) return 0;
  return rated.reduce((sum, p) => sum + (p.customerConfirmation!.rating ?? 0), 0) / rated.length;
}

function calculateRecommendationRate(proofs: LocalProofData[]): number {
  const confirmed = proofs.filter((p) => p.customerConfirmation);
  if (confirmed.length === 0) return 0;
  const recommendations = confirmed.filter(
    (p) => p.customerConfirmation!.confirmationType === "recommendation"
  ).length;
  return recommendations / confirmed.length;
}

function calculateDaysSinceLastProof(proofs: LocalProofData[]): number {
  if (proofs.length === 0) return 999;
  const lastProofTime = Math.max(...proofs.map((p) => p.submittedAt));
  return Math.floor((Date.now() - lastProofTime) / (24 * 60 * 60 * 1000));
}

function countProofsInDays(proofs: LocalProofData[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return proofs.filter((p) => p.submittedAt >= cutoff).length;
}

function calculateProfileCompleteness(business: BusinessData): number {
  let score = 0;
  const weights = {
    name: 0.2,
    description: 0.2,
    profilePhoto: 0.15,
    contactEmail: 0.15,
    contactPhone: 0.15,
    website: 0.15,
  };

  if (business.name) score += weights.name;
  if (business.description) score += weights.description;
  if (business.profilePhotoUrl) score += weights.profilePhoto;
  if (business.contactEmail) score += weights.contactEmail;
  if (business.contactPhone) score += weights.contactPhone;
  if (business.website) score += weights.website;

  return score;
}
