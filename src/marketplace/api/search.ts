/**
 * Marketplace Search API Routes
 *
 * Provides HTTP endpoints for marketplace search functionality.
 *
 * @version 1.0.0
 */

import type { Env } from '../../env';
import {
  marketplaceSearch,
  generateRankTraces,
  type MarketplaceSearchRequest,
  type MarketplaceSearchResponse,
  type RankTrace,
} from '../services/marketplaceSearch';

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

interface SearchRequestBody {
  query: string;
  filters?: {
    categories?: string[];
    maxDistanceMiles?: number;
    openNow?: boolean;
    verifiedProofOnly?: boolean;
    minProofCount?: number;
  };
  userLocation?: {
    lat: number;
    lng: number;
  };
  limit?: number;
  offset?: number;
  includeRankTraces?: boolean;
}

interface SearchResponseBody extends MarketplaceSearchResponse {
  rankTraces?: RankTrace[];
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * Handle POST /api/marketplace/search
 *
 * Performs a ranked search across marketplace offerings.
 */
export async function handleMarketplaceSearch(
  request: Request,
  env: Env,
  userId?: string
): Promise<Response> {
  try {
    // Parse request body
    const body = (await request.json()) as SearchRequestBody;

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid query field',
          code: 'INVALID_REQUEST',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Build search request - only include defined properties
    const searchRequest: MarketplaceSearchRequest = {
      query: body.query.trim(),
    };
    if (userId !== undefined) searchRequest.userId = userId;
    if (body.filters !== undefined) searchRequest.filters = body.filters;
    if (body.userLocation !== undefined) searchRequest.userLocation = body.userLocation;
    if (body.limit !== undefined) searchRequest.limit = body.limit;
    if (body.offset !== undefined) searchRequest.offset = body.offset;

    // Perform search
    const searchResponse = await marketplaceSearch(env, searchRequest);

    // Build response
    const responseBody: SearchResponseBody = {
      ...searchResponse,
    };

    // Include rank traces if requested (for debugging/explainability)
    if (body.includeRankTraces) {
      responseBody.rankTraces = generateRankTraces(
        searchResponse.searchSessionId,
        searchResponse.query,
        searchResponse.results
      );
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Marketplace Search API] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        error: message,
        code: 'SEARCH_ERROR',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle POST /api/marketplace/search/click
 *
 * Records a click on a search result for analytics.
 */
export async function handleSearchResultClick(
  request: Request,
  _env: Env,
  _userId?: string
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      searchSessionId: string;
      businessId: string;
      offeringId?: string;
      resultPosition: number;
    };

    // Validate required fields
    if (!body.searchSessionId || !body.businessId || typeof body.resultPosition !== 'number') {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: searchSessionId, businessId, resultPosition',
          code: 'INVALID_REQUEST',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // TODO: Record click in Neo4j
    // await recordSearchResultClick(env, body);

    console.log(`[Marketplace Click] Session: ${body.searchSessionId}, Business: ${body.businessId}, Position: ${body.resultPosition}`);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Marketplace Click API] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to record click',
        code: 'CLICK_ERROR',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle GET /api/marketplace/business/:businessId
 *
 * Gets a business profile with offerings.
 */
export async function handleGetBusiness(
  _request: Request,
  _env: Env,
  businessId: string
): Promise<Response> {
  try {
    // TODO: Fetch from Neo4j
    // const business = await getBusinessWithOfferings(env, businessId);

    console.log(`[Marketplace Business] Fetching business: ${businessId}`);

    // Placeholder response
    return new Response(
      JSON.stringify({
        businessId,
        message: 'Business fetch not yet implemented',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Marketplace Business API] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch business',
        code: 'FETCH_ERROR',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle GET /api/marketplace/business/:businessId/proofs
 *
 * Gets verified proofs for a business.
 */
export async function handleGetBusinessProofs(
  _request: Request,
  _env: Env,
  businessId: string
): Promise<Response> {
  try {
    // TODO: Fetch from Neo4j
    // const proofs = await getVerifiedProofsByBusiness(env, businessId);

    console.log(`[Marketplace Proofs] Fetching proofs for business: ${businessId}`);

    // Placeholder response
    return new Response(
      JSON.stringify({
        businessId,
        proofs: [],
        message: 'Proofs fetch not yet implemented',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Marketplace Proofs API] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch proofs',
        code: 'FETCH_ERROR',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle GET /api/marketplace/ranking/explain/:traceId
 *
 * Gets ranking explanation for a specific result.
 */
export async function handleGetRankingExplanation(
  _request: Request,
  _env: Env,
  traceId: string
): Promise<Response> {
  try {
    // TODO: Fetch from storage or regenerate
    console.log(`[Marketplace Explain] Fetching trace: ${traceId}`);

    // Placeholder response
    return new Response(
      JSON.stringify({
        traceId,
        message: 'Ranking explanation not yet implemented',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Marketplace Explain API] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch explanation',
        code: 'FETCH_ERROR',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
