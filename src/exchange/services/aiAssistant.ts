/**
 * AI Assistant Service for Orion Exchange
 *
 * Provides AI-powered features for the marketplace:
 * - Listing draft generation from rough descriptions
 * - Customer request parsing to structured service requests
 * - Matchmaking recommendations
 *
 * Uses OpenRouter for LLM access with streaming support.
 *
 * @version 4.0.0
 */

import type { Env } from '../../env';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Request for AI listing draft generation.
 */
export interface AIListingDraftRequest {
  /** Business ID creating the listing */
  businessId: string;

  /** User ID of business owner */
  userId: string;

  /** Rough description of the service/offering */
  roughDescription: string;

  /** Target customer description (optional) */
  targetCustomer?: string;

  /** Existing business profile data for context */
  businessContext?: {
    name: string;
    category: string;
    tags: string[];
    existingListings?: string[];
  };
}

/**
 * Generated listing draft.
 */
export interface AIListingDraft {
  /** Suggested title */
  title: string;

  /** Full description */
  description: string;

  /** Suggested category */
  category: string;

  /** Suggested skill tags */
  skillTags: string[];

  /** Suggested pricing model */
  pricing: {
    type: 'fixed' | 'hourly' | 'quote';
    suggestedAmount?: number;
    reasoning: string;
  };

  /** Suggested checklist template for proofs */
  checklistTemplate: Array<{
    text: string;
    suggestedPhotoProof: boolean;
  }>;

  /** AI confidence in suggestions */
  confidence: 'low' | 'medium' | 'high';

  /** Improvement suggestions */
  suggestions: string[];

  /** Generation metadata */
  metadata: {
    model: string;
    tokensUsed: number;
    generatedAt: number;
  };
}

/**
 * Request to parse customer problem description.
 */
export interface AIParseRequestInput {
  /** User ID of customer */
  userId: string;

  /** Raw problem description from customer */
  problemDescription: string;

  /** Customer's location (optional) */
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };

  /** Customer's preferences from profile */
  customerPreferences?: {
    preferredCategories?: string[];
    budgetLevel?: 'budget' | 'moderate' | 'premium';
    urgency?: 'flexible' | 'soon' | 'urgent';
  };
}

/**
 * Structured service request parsed from description.
 */
export interface ParsedServiceRequest {
  /** Inferred service category */
  category: string;

  /** Extracted skill requirements */
  skillsNeeded: string[];

  /** Structured description */
  structuredDescription: string;

  /** Detected urgency level */
  urgency: 'flexible' | 'soon' | 'urgent';

  /** Inferred budget range (if mentioned) */
  budgetRange?: {
    min: number;
    max: number;
    currency: string;
  };

  /** Detected location requirements */
  locationRequirements: {
    onSite: boolean;
    remote: boolean;
    specificAddress?: string;
  };

  /** Time constraints */
  timing?: {
    preferredDate?: string;
    preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'flexible';
    deadline?: string;
  };

  /** Search query to use */
  suggestedSearchQuery: string;

  /** Search filters to apply */
  suggestedFilters: {
    categories?: string[];
    maxDistanceMiles?: number;
    verifiedOnly?: boolean;
    minEvidenceScore?: number;
  };

  /** Clarifying questions (if description is ambiguous) */
  clarifyingQuestions?: string[];

  /** AI confidence in parsing */
  confidence: 'low' | 'medium' | 'high';

  /** Generation metadata */
  metadata: {
    model: string;
    tokensUsed: number;
    generatedAt: number;
  };
}

/**
 * Matchmaking request between customer and providers.
 */
export interface MatchmakingRequest {
  /** Parsed service request */
  serviceRequest: ParsedServiceRequest;

  /** Customer user ID */
  customerId: string;

  /** Top search results to analyze */
  candidates: Array<{
    businessId: string;
    businessName: string;
    category: string;
    tags: string[];
    evidenceScore: number;
    verifiedProofs: number;
    averageRating: number | null;
  }>;

  /** Maximum recommendations to return */
  maxRecommendations?: number;
}

/**
 * AI matchmaking recommendations.
 */
export interface MatchmakingResult {
  /** Ranked recommendations */
  recommendations: Array<{
    businessId: string;
    rank: number;
    matchScore: number;
    reasons: string[];
    concerns?: string[];
    suggestedApproach?: string;
  }>;

  /** Overall match quality assessment */
  overallQuality: 'excellent' | 'good' | 'fair' | 'limited';

  /** Suggestions for better matches */
  suggestions?: string[];

  /** Generation metadata */
  metadata: {
    model: string;
    tokensUsed: number;
    generatedAt: number;
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface AIAssistantConfig {
  /** Model for listing generation */
  listingModel: string;

  /** Model for request parsing */
  parsingModel: string;

  /** Model for matchmaking */
  matchmakingModel: string;

  /** Maximum tokens for generation */
  maxTokens: {
    listing: number;
    parsing: number;
    matchmaking: number;
  };

  /** Temperature settings */
  temperature: {
    listing: number;
    parsing: number;
    matchmaking: number;
  };

  /** System prompts */
  systemPrompts: {
    listing: string;
    parsing: string;
    matchmaking: string;
  };
}

const DEFAULT_CONFIG: AIAssistantConfig = {
  listingModel: 'anthropic/claude-3-haiku-20240307',
  parsingModel: 'anthropic/claude-3-haiku-20240307',
  matchmakingModel: 'anthropic/claude-3-haiku-20240307',

  maxTokens: {
    listing: 1500,
    parsing: 1000,
    matchmaking: 800,
  },

  temperature: {
    listing: 0.7,
    parsing: 0.3,
    matchmaking: 0.5,
  },

  systemPrompts: {
    listing: `You are an expert at creating compelling service listings for a marketplace.
Your task is to transform rough service descriptions into professional, clear listings.

Guidelines:
- Write in a professional but approachable tone
- Focus on value to the customer
- Be specific about what's included
- Suggest appropriate skill tags that match common search terms
- Create realistic checklist items that demonstrate work quality
- Consider pricing based on market rates

Output valid JSON matching the specified schema.`,

    parsing: `You are an expert at understanding customer service needs.
Your task is to parse natural language descriptions into structured service requests.

Guidelines:
- Extract all relevant details from the description
- Infer urgency from language cues
- Identify location requirements
- Detect budget hints if mentioned
- Generate an optimized search query
- Ask clarifying questions only when truly ambiguous
- Be conservative with confidence scores

Output valid JSON matching the specified schema.`,

    matchmaking: `You are an expert at matching customers with service providers.
Your task is to analyze customer needs against provider capabilities.

Guidelines:
- Consider skill alignment carefully
- Weight evidence/verification highly
- Factor in ratings and completion history
- Identify any potential concerns
- Provide actionable suggestions
- Be honest about match quality

Output valid JSON matching the specified schema.`,
  },
};

// =============================================================================
// LLM INTERFACE
// =============================================================================

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
}

/**
 * Call LLM via OpenRouter.
 */
async function callLLM(
  env: Env,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const openRouterApiKey = env.OPENROUTER_API_KEY;
  const openRouterBaseUrl = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'https://orion.suite',
      'X-Title': 'Orion Exchange AI',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM call failed: ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage: { total_tokens: number };
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from LLM');
  }

  return {
    content,
    model: data.model,
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

// =============================================================================
// LISTING DRAFT GENERATION
// =============================================================================

/**
 * Generate an AI-assisted listing draft.
 */
export async function generateListingDraft(
  env: Env,
  request: AIListingDraftRequest,
  config: AIAssistantConfig = DEFAULT_CONFIG
): Promise<AIListingDraft> {
  const userPrompt = buildListingPrompt(request);

  const llmResponse = await callLLM(
    env,
    config.listingModel,
    [
      { role: 'system', content: config.systemPrompts.listing },
      { role: 'user', content: userPrompt },
    ],
    config.maxTokens.listing,
    config.temperature.listing
  );

  try {
    const parsed = JSON.parse(llmResponse.content) as Partial<AIListingDraft>;

    // Validate and normalize response
    const draft: AIListingDraft = {
      title: parsed.title || 'Untitled Service',
      description: parsed.description || request.roughDescription,
      category: parsed.category || request.businessContext?.category || 'general',
      skillTags: Array.isArray(parsed.skillTags) ? parsed.skillTags.slice(0, 10) : [],
      pricing: parsed.pricing || {
        type: 'quote',
        reasoning: 'Unable to suggest pricing without more context',
      },
      checklistTemplate: Array.isArray(parsed.checklistTemplate)
        ? parsed.checklistTemplate.slice(0, 10)
        : [],
      confidence: parsed.confidence || 'medium',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        generatedAt: Date.now(),
      },
    };

    return draft;
  } catch (parseError) {
    console.error('[AI Assistant] Failed to parse listing response:', parseError);

    // Return a basic draft on parse failure
    return {
      title: 'Service Listing',
      description: request.roughDescription,
      category: request.businessContext?.category || 'general',
      skillTags: [],
      pricing: {
        type: 'quote',
        reasoning: 'Please set pricing based on your expertise',
      },
      checklistTemplate: [],
      confidence: 'low',
      suggestions: ['Unable to generate full draft. Please complete manually.'],
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        generatedAt: Date.now(),
      },
    };
  }
}

function buildListingPrompt(request: AIListingDraftRequest): string {
  let prompt = `Create a professional service listing from this description:

"${request.roughDescription}"`;

  if (request.targetCustomer) {
    prompt += `

Target customer: ${request.targetCustomer}`;
  }

  if (request.businessContext) {
    prompt += `

Business context:
- Name: ${request.businessContext.name}
- Current category: ${request.businessContext.category}
- Existing tags: ${request.businessContext.tags.join(', ')}`;

    if (request.businessContext.existingListings?.length) {
      prompt += `
- Existing listings: ${request.businessContext.existingListings.join(', ')}`;
    }
  }

  prompt += `

Generate a JSON response with this structure:
{
  "title": "Compelling service title (max 60 chars)",
  "description": "Full service description (150-500 words)",
  "category": "Primary category",
  "skillTags": ["tag1", "tag2", ...] (5-10 relevant tags),
  "pricing": {
    "type": "fixed" | "hourly" | "quote",
    "suggestedAmount": number or null,
    "reasoning": "Why this pricing model"
  },
  "checklistTemplate": [
    {"text": "Task to complete", "suggestedPhotoProof": true/false},
    ...
  ],
  "confidence": "low" | "medium" | "high",
  "suggestions": ["Improvement suggestion 1", ...]
}`;

  return prompt;
}

// =============================================================================
// REQUEST PARSING
// =============================================================================

/**
 * Parse customer problem description into structured request.
 */
export async function parseServiceRequest(
  env: Env,
  request: AIParseRequestInput,
  config: AIAssistantConfig = DEFAULT_CONFIG
): Promise<ParsedServiceRequest> {
  const userPrompt = buildParsingPrompt(request);

  const llmResponse = await callLLM(
    env,
    config.parsingModel,
    [
      { role: 'system', content: config.systemPrompts.parsing },
      { role: 'user', content: userPrompt },
    ],
    config.maxTokens.parsing,
    config.temperature.parsing
  );

  try {
    const parsed = JSON.parse(llmResponse.content) as Partial<ParsedServiceRequest>;

    // Validate and normalize response
    const result: ParsedServiceRequest = {
      category: parsed.category || 'general',
      skillsNeeded: Array.isArray(parsed.skillsNeeded) ? parsed.skillsNeeded : [],
      structuredDescription:
        parsed.structuredDescription || request.problemDescription,
      urgency: parsed.urgency || 'flexible',
      locationRequirements: parsed.locationRequirements || {
        onSite: false,
        remote: true,
      },
      suggestedSearchQuery:
        parsed.suggestedSearchQuery || extractSearchQuery(request.problemDescription),
      suggestedFilters: parsed.suggestedFilters || {},
      confidence: parsed.confidence || 'medium',
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        generatedAt: Date.now(),
      },
    };
    if (parsed.budgetRange !== undefined) result.budgetRange = parsed.budgetRange;
    if (parsed.timing !== undefined) result.timing = parsed.timing;
    if (parsed.clarifyingQuestions !== undefined) result.clarifyingQuestions = parsed.clarifyingQuestions;

    // Apply customer preferences to filters
    if (request.customerPreferences) {
      if (request.customerPreferences.preferredCategories?.length) {
        result.suggestedFilters.categories =
          result.suggestedFilters.categories ||
          request.customerPreferences.preferredCategories;
      }

      if (request.customerPreferences.budgetLevel === 'budget') {
        result.suggestedFilters.minEvidenceScore = 0.2;
      } else if (request.customerPreferences.budgetLevel === 'premium') {
        result.suggestedFilters.verifiedOnly = true;
        result.suggestedFilters.minEvidenceScore = 0.5;
      }
    }

    return result;
  } catch (parseError) {
    console.error('[AI Assistant] Failed to parse request response:', parseError);

    // Return a basic parsed request on failure
    const fallbackLocationReqs: ParsedServiceRequest['locationRequirements'] = {
      onSite: request.location !== undefined,
      remote: request.location === undefined,
    };
    if (request.location?.address) {
      fallbackLocationReqs.specificAddress = request.location.address;
    }
    return {
      category: 'general',
      skillsNeeded: [],
      structuredDescription: request.problemDescription,
      urgency: 'flexible',
      locationRequirements: fallbackLocationReqs,
      suggestedSearchQuery: extractSearchQuery(request.problemDescription),
      suggestedFilters: {},
      confidence: 'low',
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        generatedAt: Date.now(),
      },
    };
  }
}

function buildParsingPrompt(request: AIParseRequestInput): string {
  let prompt = `Parse this customer's service request:

"${request.problemDescription}"`;

  if (request.location) {
    prompt += `

Customer location: ${request.location.address || `${request.location.lat}, ${request.location.lng}`}`;
  }

  if (request.customerPreferences) {
    prompt += `

Customer preferences:`;
    if (request.customerPreferences.preferredCategories?.length) {
      prompt += `
- Preferred categories: ${request.customerPreferences.preferredCategories.join(', ')}`;
    }
    if (request.customerPreferences.budgetLevel) {
      prompt += `
- Budget level: ${request.customerPreferences.budgetLevel}`;
    }
    if (request.customerPreferences.urgency) {
      prompt += `
- Urgency: ${request.customerPreferences.urgency}`;
    }
  }

  prompt += `

Generate a JSON response with this structure:
{
  "category": "Inferred service category",
  "skillsNeeded": ["skill1", "skill2", ...],
  "structuredDescription": "Clean, structured version of request",
  "urgency": "flexible" | "soon" | "urgent",
  "budgetRange": {"min": number, "max": number, "currency": "USD"} or null,
  "locationRequirements": {
    "onSite": boolean,
    "remote": boolean,
    "specificAddress": "address or null"
  },
  "timing": {
    "preferredDate": "YYYY-MM-DD or null",
    "preferredTimeOfDay": "morning" | "afternoon" | "evening" | "flexible" | null,
    "deadline": "YYYY-MM-DD or null"
  } or null,
  "suggestedSearchQuery": "Optimized search query",
  "suggestedFilters": {
    "categories": [...] or null,
    "maxDistanceMiles": number or null,
    "verifiedOnly": boolean or null,
    "minEvidenceScore": number or null
  },
  "clarifyingQuestions": ["Question 1", ...] or null,
  "confidence": "low" | "medium" | "high"
}`;

  return prompt;
}

function extractSearchQuery(description: string): string {
  // Simple extraction: take first 100 chars, remove special chars
  return description
    .slice(0, 100)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// MATCHMAKING
// =============================================================================

/**
 * Generate AI matchmaking recommendations.
 */
export async function generateMatchmaking(
  env: Env,
  request: MatchmakingRequest,
  config: AIAssistantConfig = DEFAULT_CONFIG
): Promise<MatchmakingResult> {
  const userPrompt = buildMatchmakingPrompt(request);

  const llmResponse = await callLLM(
    env,
    config.matchmakingModel,
    [
      { role: 'system', content: config.systemPrompts.matchmaking },
      { role: 'user', content: userPrompt },
    ],
    config.maxTokens.matchmaking,
    config.temperature.matchmaking
  );

  try {
    const parsed = JSON.parse(llmResponse.content) as Partial<MatchmakingResult>;

    const result: MatchmakingResult = {
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, request.maxRecommendations || 5)
        : [],
      overallQuality: parsed.overallQuality || 'fair',
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        generatedAt: Date.now(),
      },
    };
    if (parsed.suggestions !== undefined) result.suggestions = parsed.suggestions;

    return result;
  } catch (parseError) {
    console.error('[AI Assistant] Failed to parse matchmaking response:', parseError);

    // Return basic recommendations on failure
    return {
      recommendations: request.candidates.slice(0, 3).map((c, i) => ({
        businessId: c.businessId,
        rank: i + 1,
        matchScore: c.evidenceScore,
        reasons: ['Based on evidence score'],
      })),
      overallQuality: 'fair',
      suggestions: ['Unable to generate detailed matchmaking. Results sorted by evidence.'],
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        generatedAt: Date.now(),
      },
    };
  }
}

function buildMatchmakingPrompt(request: MatchmakingRequest): string {
  const sr = request.serviceRequest;

  let prompt = `Match this customer request to service providers:

Customer Request:
- Category: ${sr.category}
- Skills needed: ${sr.skillsNeeded.join(', ')}
- Description: ${sr.structuredDescription}
- Urgency: ${sr.urgency}
- Location: ${sr.locationRequirements.onSite ? 'On-site required' : 'Remote OK'}`;

  if (sr.budgetRange) {
    prompt += `
- Budget: $${sr.budgetRange.min}-$${sr.budgetRange.max}`;
  }

  prompt += `

Available Providers:`;

  for (const candidate of request.candidates) {
    prompt += `

${candidate.businessName} (${candidate.businessId}):
- Category: ${candidate.category}
- Tags: ${candidate.tags.join(', ')}
- Evidence Score: ${(candidate.evidenceScore * 100).toFixed(0)}%
- Verified Proofs: ${candidate.verifiedProofs}
- Rating: ${candidate.averageRating?.toFixed(1) || 'No ratings'}`;
  }

  prompt += `

Generate a JSON response with this structure:
{
  "recommendations": [
    {
      "businessId": "id",
      "rank": 1,
      "matchScore": 0.0-1.0,
      "reasons": ["Why this is a good match", ...],
      "concerns": ["Any concerns"] or null,
      "suggestedApproach": "How customer should engage" or null
    },
    ...
  ],
  "overallQuality": "excellent" | "good" | "fair" | "limited",
  "suggestions": ["How to improve matches"] or null
}

Rank up to ${request.maxRecommendations || 5} providers.`;

  return prompt;
}

// Export config for testing
export { DEFAULT_CONFIG as AI_ASSISTANT_CONFIG };
export type { AIAssistantConfig };
