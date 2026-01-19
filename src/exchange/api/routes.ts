/**
 * Exchange API Routes for Brain Platform
 *
 * HTTP endpoints for Exchange search, AI features, and evidence scoring.
 * These endpoints are called by edge-gateway-worker.
 *
 * @version 4.0.0
 */

import type { Env } from '../../env';
import {
  exchangeSearch,
  type ExchangeSearchRequest,
} from '../services/exchangeSearch';
import {
  generateListingDraft,
  parseServiceRequest,
  generateMatchmaking,
  type AIListingDraftRequest,
  type AIParseRequestInput,
  type MatchmakingRequest,
} from '../services/aiAssistant';
import {
  calculateEvidenceScore,
  calculateAggregateEvidenceScore,
  type ProofData,
  type BusinessProfileData,
  type FraudIndicators,
  type EvidenceScoreResult,
} from '../services/evidenceScoring';
import {
  handleDebugSearch,
  handleEvidenceInspection,
  handleSearchAnalytics,
} from './debugRoutes';
import {
  fetchBusinessById,
  fetchListingsByBusinessId,
  fetchProofsByBusinessId,
  fetchEvidenceMetricsBatch,
  recordClickEvent,
} from '../adapters/exchangeData';

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Verify internal API key from gateway.
 */
function verifyInternalKey(request: Request, env: Env): boolean {
  const internalKey = request.headers.get('X-Internal-Key');
  if (!internalKey || !env.GATEWAY_INTERNAL_KEY) {
    return false;
  }
  return internalKey === env.GATEWAY_INTERNAL_KEY;
}

/**
 * Create JSON response.
 */
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create error response.
 */
function errorResponse(
  error: string,
  code: string,
  status: number = 500
): Response {
  return jsonResponse({ error, code, ok: false }, status);
}

// =============================================================================
// SEARCH ROUTES
// =============================================================================

/**
 * POST /api/exchange/search
 *
 * Main search endpoint called by edge-gateway.
 * Returns ranked results with evidence-based scoring.
 */
export async function handleExchangeSearch(
  request: Request,
  env: Env
): Promise<Response> {
  // Verify internal key
  if (!verifyInternalKey(request, env)) {
    return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = (await request.json()) as ExchangeSearchRequest & { userId: string };

    if (!body.query || !body.userId) {
      return errorResponse(
        'Missing required fields: query, userId',
        'INVALID_REQUEST',
        400
      );
    }

    const searchRequest: ExchangeSearchRequest = {
      query: body.query,
      userId: body.userId,
    };
    if (body.filters !== undefined) searchRequest.filters = body.filters;
    if (body.page !== undefined) searchRequest.page = body.page;
    if (body.limit !== undefined) searchRequest.limit = body.limit;
    if (body.applyUserPreferences !== undefined) searchRequest.applyUserPreferences = body.applyUserPreferences;

    const response = await exchangeSearch(env, searchRequest);

    return jsonResponse({
      ok: true,
      ...response,
    });
  } catch (error) {
    console.error('[Exchange Search API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'SEARCH_ERROR', 500);
  }
}

/**
 * POST /api/exchange/search/click
 *
 * Record search result click for analytics.
 */
export async function handleSearchClick(
  request: Request,
  env: Env
): Promise<Response> {
  if (!verifyInternalKey(request, env)) {
    return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = (await request.json()) as {
      searchSessionId: string;
      query: string;
      businessId: string;
      listingId?: string;
      resultPosition: number;
      userId: string;
    };

    if (!body.searchSessionId || !body.businessId || !body.userId) {
      return errorResponse(
        'Missing required fields',
        'INVALID_REQUEST',
        400
      );
    }

    // Record click in Neo4j for analytics
    // Build click record with conditional optional properties
    const clickRecord: {
      searchSessionId: string;
      userId: string;
      businessId: string;
      resultPosition: number;
      timestamp: number;
      listingId?: string;
    } = {
      searchSessionId: body.searchSessionId,
      userId: body.userId,
      businessId: body.businessId,
      resultPosition: body.resultPosition,
      timestamp: Date.now(),
    };

    if (body.listingId) {
      clickRecord.listingId = body.listingId;
    }

    await recordClickEvent(env, clickRecord);

    return jsonResponse({ ok: true, recorded: true });
  } catch (error) {
    console.error('[Exchange Click API] Error:', error);
    return errorResponse('Failed to record click', 'CLICK_ERROR', 500);
  }
}

// =============================================================================
// AI ROUTES
// =============================================================================

/**
 * POST /api/exchange/ai/listing-draft
 *
 * Generate AI-assisted listing draft.
 */
export async function handleAIListingDraft(
  request: Request,
  env: Env
): Promise<Response> {
  if (!verifyInternalKey(request, env)) {
    return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = (await request.json()) as AIListingDraftRequest & { userId: string };

    if (!body.roughDescription || !body.businessId || !body.userId) {
      return errorResponse(
        'Missing required fields: roughDescription, businessId, userId',
        'INVALID_REQUEST',
        400
      );
    }

    const draftRequest: AIListingDraftRequest = {
      businessId: body.businessId,
      userId: body.userId,
      roughDescription: body.roughDescription,
    };
    if (body.targetCustomer !== undefined) draftRequest.targetCustomer = body.targetCustomer;
    if (body.businessContext !== undefined) draftRequest.businessContext = body.businessContext;

    const draft = await generateListingDraft(env, draftRequest);

    return jsonResponse({
      ok: true,
      draft,
    });
  } catch (error) {
    console.error('[AI Listing Draft API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'AI_ERROR', 500);
  }
}

/**
 * POST /api/exchange/ai/parse-request
 *
 * Parse customer problem description to structured request.
 */
export async function handleAIParseRequest(
  request: Request,
  env: Env
): Promise<Response> {
  if (!verifyInternalKey(request, env)) {
    return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = (await request.json()) as AIParseRequestInput & { userId: string };

    if (!body.problemDescription || !body.userId) {
      return errorResponse(
        'Missing required fields: problemDescription, userId',
        'INVALID_REQUEST',
        400
      );
    }

    const parseRequest: AIParseRequestInput = {
      userId: body.userId,
      problemDescription: body.problemDescription,
    };
    if (body.location !== undefined) parseRequest.location = body.location;
    if (body.customerPreferences !== undefined) parseRequest.customerPreferences = body.customerPreferences;

    const parsed = await parseServiceRequest(env, parseRequest);

    return jsonResponse({
      ok: true,
      parsed,
    });
  } catch (error) {
    console.error('[AI Parse Request API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'AI_ERROR', 500);
  }
}

/**
 * POST /api/exchange/ai/matchmaking
 *
 * Generate AI matchmaking recommendations.
 */
export async function handleAIMatchmaking(
  request: Request,
  env: Env
): Promise<Response> {
  if (!verifyInternalKey(request, env)) {
    return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = (await request.json()) as MatchmakingRequest;

    if (!body.serviceRequest || !body.customerId || !body.candidates?.length) {
      return errorResponse(
        'Missing required fields: serviceRequest, customerId, candidates',
        'INVALID_REQUEST',
        400
      );
    }

    const result = await generateMatchmaking(env, body);

    return jsonResponse({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[AI Matchmaking API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'AI_ERROR', 500);
  }
}

// =============================================================================
// EVIDENCE SCORING ROUTES
// =============================================================================

/**
 * POST /api/exchange/evidence/score
 *
 * Calculate evidence score for a single proof.
 */
export async function handleEvidenceScore(
  request: Request,
  env: Env
): Promise<Response> {
  if (!verifyInternalKey(request, env)) {
    return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = (await request.json()) as {
      proof: ProofData;
      profile: BusinessProfileData;
      fraudIndicators?: FraudIndicators;
    };

    if (!body.proof || !body.profile) {
      return errorResponse(
        'Missing required fields: proof, profile',
        'INVALID_REQUEST',
        400
      );
    }

    const scoreResult = calculateEvidenceScore(
      body.proof,
      body.profile,
      body.fraudIndicators
    );

    return jsonResponse({
      ok: true,
      ...scoreResult,
    });
  } catch (error) {
    console.error('[Evidence Score API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'SCORING_ERROR', 500);
  }
}

/**
 * POST /api/exchange/evidence/aggregate
 *
 * Calculate aggregate evidence score from multiple proofs.
 */
export async function handleAggregateEvidence(
  request: Request,
  env: Env
): Promise<Response> {
  if (!verifyInternalKey(request, env)) {
    return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = (await request.json()) as {
      proofScores: EvidenceScoreResult[];
    };

    if (!body.proofScores || !Array.isArray(body.proofScores)) {
      return errorResponse(
        'Missing required field: proofScores (array)',
        'INVALID_REQUEST',
        400
      );
    }

    const aggregateResult = calculateAggregateEvidenceScore(body.proofScores);

    return jsonResponse({
      ok: true,
      ...aggregateResult,
    });
  } catch (error) {
    console.error('[Aggregate Evidence API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'SCORING_ERROR', 500);
  }
}

// =============================================================================
// BUSINESS PROFILE ROUTES
// =============================================================================

/**
 * GET /api/exchange/business/:businessId
 *
 * Get business profile with evidence metrics.
 */
export async function handleGetBusiness(
  _request: Request,
  env: Env,
  businessId: string
): Promise<Response> {
  try {
    // Fetch business profile from Neo4j
    const business = await fetchBusinessById(env, businessId);

    if (!business) {
      return errorResponse('Business not found', 'NOT_FOUND', 404);
    }

    // Fetch evidence metrics
    const metricsMap = await fetchEvidenceMetricsBatch(env, [businessId]);
    const metrics = metricsMap.get(businessId);

    return jsonResponse({
      ok: true,
      business: {
        ...business,
        evidenceMetrics: metrics || {
          verifiedProofsCount: 0,
          totalProofsCount: 0,
          completedOrdersCount: 0,
          averageRating: null,
          ratingCount: 0,
          daysSinceLastProof: null,
          hasRecentActivity: false,
          evidenceScore: 0,
        },
      },
    });
  } catch (error) {
    console.error('[Exchange Business API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'FETCH_ERROR', 500);
  }
}

/**
 * GET /api/exchange/business/:businessId/proofs
 *
 * Get verified proofs for a business.
 */
export async function handleGetBusinessProofs(
  request: Request,
  env: Env,
  businessId: string
): Promise<Response> {
  try {
    // Parse query params for pagination
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    // Fetch proofs from Neo4j
    const proofs = await fetchProofsByBusinessId(env, businessId, limit);

    return jsonResponse({
      ok: true,
      proofs,
      count: proofs.length,
    });
  } catch (error) {
    console.error('[Exchange Proofs API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'FETCH_ERROR', 500);
  }
}

/**
 * GET /api/exchange/business/:businessId/listings
 *
 * Get listings for a business.
 */
export async function handleGetBusinessListings(
  _request: Request,
  env: Env,
  businessId: string
): Promise<Response> {
  try {
    // Fetch listings from Neo4j
    const listings = await fetchListingsByBusinessId(env, businessId);

    return jsonResponse({
      ok: true,
      listings,
      count: listings.length,
    });
  } catch (error) {
    console.error('[Exchange Listings API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, 'FETCH_ERROR', 500);
  }
}

// =============================================================================
// RANKING EXPLAINABILITY ROUTES
// =============================================================================

/**
 * GET /api/exchange/ranking/explain/:traceId
 *
 * Get detailed ranking explanation for a search result.
 */
export async function handleRankingExplanation(
  _request: Request,
  _env: Env,
  traceId: string
): Promise<Response> {
  // TODO: Implement trace fetch/regeneration
  console.log(`[Exchange Explain API] Get trace: ${traceId}`);

  return jsonResponse({
    ok: false,
    error: 'Not yet implemented',
    code: 'NOT_IMPLEMENTED',
  }, 501);
}

// =============================================================================
// ROUTER
// =============================================================================

/**
 * Route Exchange API requests.
 */
export async function routeExchangeRequest(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Search routes
  if (path === '/api/exchange/search' && method === 'POST') {
    return handleExchangeSearch(request, env);
  }

  if (path === '/api/exchange/search/click' && method === 'POST') {
    return handleSearchClick(request, env);
  }

  // AI routes
  if (path === '/api/exchange/ai/listing-draft' && method === 'POST') {
    return handleAIListingDraft(request, env);
  }

  if (path === '/api/exchange/ai/parse-request' && method === 'POST') {
    return handleAIParseRequest(request, env);
  }

  if (path === '/api/exchange/ai/matchmaking' && method === 'POST') {
    return handleAIMatchmaking(request, env);
  }

  // Evidence scoring routes
  if (path === '/api/exchange/evidence/score' && method === 'POST') {
    return handleEvidenceScore(request, env);
  }

  if (path === '/api/exchange/evidence/aggregate' && method === 'POST') {
    return handleAggregateEvidence(request, env);
  }

  // Business profile routes
  const businessMatch = path.match(/^\/api\/exchange\/business\/([^/]+)$/);
  if (businessMatch && businessMatch[1] && method === 'GET') {
    return handleGetBusiness(request, env, businessMatch[1]);
  }

  const proofsMatch = path.match(/^\/api\/exchange\/business\/([^/]+)\/proofs$/);
  if (proofsMatch && proofsMatch[1] && method === 'GET') {
    return handleGetBusinessProofs(request, env, proofsMatch[1]);
  }

  const listingsMatch = path.match(/^\/api\/exchange\/business\/([^/]+)\/listings$/);
  if (listingsMatch && listingsMatch[1] && method === 'GET') {
    return handleGetBusinessListings(request, env, listingsMatch[1]);
  }

  // Ranking explainability
  const explainMatch = path.match(/^\/api\/exchange\/ranking\/explain\/([^/]+)$/);
  if (explainMatch && explainMatch[1] && method === 'GET') {
    return handleRankingExplanation(request, env, explainMatch[1]);
  }

  // Debug routes (admin only - require Authorization header)
  if (path === '/api/exchange/debug/search' && method === 'POST') {
    // Verify admin authorization
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
    }
    return handleDebugSearch(request, env);
  }

  const evidenceInspectMatch = path.match(/^\/api\/exchange\/debug\/evidence-score\/([^/]+)$/);
  if (evidenceInspectMatch && evidenceInspectMatch[1] && method === 'GET') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
    }
    return handleEvidenceInspection(request, env, evidenceInspectMatch[1]);
  }

  if (path === '/api/exchange/debug/analytics' && method === 'GET') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
    }
    return handleSearchAnalytics(request, env);
  }

  // Not an exchange route
  return null;
}
