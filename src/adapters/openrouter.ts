/**
 * Neural Intelligence Platform - OpenRouter Adapter
 * Provides unified interface for AI model access via OpenRouter API
 *
 * Features:
 * - Text embeddings
 * - CLIP embeddings for images
 * - Audio transcription
 * - Chat completions for analysis
 * - Rate limiting with token bucket
 * - Exponential backoff retry logic
 * - Cost tracking
 */

import { EmbeddingVector } from '../types';

// ============================================================================
// OpenRouter Types
// ============================================================================

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  rateLimitRpm?: number;  // Requests per minute
  enableCostTracking?: boolean;
}

export interface OpenRouterRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContent[];
}

export interface ChatContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingResponse {
  model: string;
  data: {
    embedding: number[];
    index: number;
  }[];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface TranscriptionResponse {
  text: string;
  segments?: {
    id: number;
    start: number;
    end: number;
    text: string;
    speaker?: string;
    confidence?: number;
  }[];
  language?: string;
  duration?: number;
}

export interface CostRecord {
  timestamp: number;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

// ============================================================================
// Rate Limiter Implementation
// ============================================================================

class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = requestsPerMinute / 60000; // Convert to per-millisecond
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
      await this.sleep(waitTime);
      this.refill();
    }

    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// OpenRouter Adapter Implementation
// ============================================================================

export class OpenRouterAdapter {
  private readonly config: Required<OpenRouterConfig>;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private costRecords: CostRecord[] = [];

  // Model pricing (approximate, in USD per 1M tokens)
  private static readonly MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'openai/gpt-4o': { input: 2.5, output: 10 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
    'openai/text-embedding-3-small': { input: 0.02, output: 0 },
    'openai/text-embedding-3-large': { input: 0.13, output: 0 },
    'openai/whisper-large-v3': { input: 0.111, output: 0 }, // Per minute pricing converted
    'openai/clip-vit-large-patch14': { input: 0.0, output: 0 }, // Usually free/minimal
  };

  constructor(config: OpenRouterConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
      defaultModel: config.defaultModel || 'openai/gpt-4o-mini',
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      rateLimitRpm: config.rateLimitRpm ?? 60,
      enableCostTracking: config.enableCostTracking ?? true,
    };

    this.rateLimiter = new TokenBucketRateLimiter(this.config.rateLimitRpm);
  }

  // ============================================================================
  // Text Embeddings
  // ============================================================================

  async generateTextEmbedding(
    text: string,
    options?: OpenRouterRequestOptions
  ): Promise<EmbeddingVector> {
    const model = options?.model || 'openai/text-embedding-3-small';

    const response = await this.makeRequest<EmbeddingResponse>('/embeddings', {
      model,
      input: text,
    });

    const embedding = response.data[0].embedding;

    this.trackCost(model, 'embedding', response.usage.prompt_tokens, 0);

    return {
      values: embedding,
      dimensions: embedding.length,
      model,
      normalizedAt: Date.now(),
    };
  }

  async generateTextEmbeddingBatch(
    texts: string[],
    options?: OpenRouterRequestOptions
  ): Promise<EmbeddingVector[]> {
    const model = options?.model || 'openai/text-embedding-3-small';

    const response = await this.makeRequest<EmbeddingResponse>('/embeddings', {
      model,
      input: texts,
    });

    this.trackCost(model, 'embedding_batch', response.usage.prompt_tokens, 0);

    return response.data.map(item => ({
      values: item.embedding,
      dimensions: item.embedding.length,
      model,
      normalizedAt: Date.now(),
    }));
  }

  // ============================================================================
  // CLIP Embeddings (for images)
  // ============================================================================

  async generateClipEmbedding(
    imageUrl: string,
    options?: OpenRouterRequestOptions
  ): Promise<EmbeddingVector> {
    // Note: OpenRouter doesn't directly expose CLIP embeddings
    // We use a vision model to generate a description, then embed that
    // For true CLIP embeddings, you'd need to call a dedicated CLIP API

    // TODO: Replace with actual CLIP API when available on OpenRouter
    // For now, we simulate CLIP-like behavior using vision + text embedding

    const model = options?.model || 'openai/gpt-4o-mini';

    // First, get a detailed description of the image
    const descriptionResponse = await this.chatCompletion([
      {
        role: 'system',
        content: 'You are an image analysis assistant. Provide a detailed, factual description of the image focusing on visual elements, objects, people, text, colors, and composition. Be concise but comprehensive.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'high' },
          },
          {
            type: 'text',
            text: 'Describe this image in detail for semantic indexing.',
          },
        ],
      },
    ], { model, maxTokens: 300 });

    const description = descriptionResponse.choices[0].message.content;

    // Then generate embedding from the description
    const embedding = await this.generateTextEmbedding(description, {
      model: 'openai/text-embedding-3-small',
    });

    return {
      ...embedding,
      model: `clip-via-${model}`,
    };
  }

  async generateClipEmbeddingFromBase64(
    base64Image: string,
    mimeType: string = 'image/jpeg',
    options?: OpenRouterRequestOptions
  ): Promise<EmbeddingVector> {
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    return this.generateClipEmbedding(dataUrl, options);
  }

  // ============================================================================
  // Audio Transcription
  // ============================================================================

  async transcribeAudio(
    audioUrl: string,
    options?: OpenRouterRequestOptions & {
      language?: string;
      enableTimestamps?: boolean;
      enableSpeakerDiarization?: boolean;
    }
  ): Promise<TranscriptionResponse> {
    // TODO: OpenRouter Whisper API integration
    // The actual implementation depends on OpenRouter's audio API availability
    // Below is a placeholder that would need to be adapted to the actual API

    const model = options?.model || 'openai/whisper-large-v3';

    // For now, simulate the API call structure
    // In production, this would be:
    // 1. Download audio file
    // 2. Send to transcription endpoint
    // 3. Process response with timestamps and speaker info

    console.warn('Audio transcription: Using placeholder implementation');
    console.warn('TODO: Implement actual OpenRouter Whisper API call');

    // Simulated response structure
    const response: TranscriptionResponse = {
      text: '', // Would contain full transcription
      segments: [], // Would contain timestamped segments
      language: options?.language || 'en',
      duration: 0,
    };

    // In actual implementation:
    // const audioData = await this.fetchAudioFile(audioUrl);
    // const formData = new FormData();
    // formData.append('file', audioData);
    // formData.append('model', model);
    // formData.append('response_format', 'verbose_json');
    // formData.append('timestamp_granularities', JSON.stringify(['segment', 'word']));
    //
    // const response = await this.makeFormDataRequest('/audio/transcriptions', formData);

    return response;
  }

  // ============================================================================
  // Chat Completion
  // ============================================================================

  async chatCompletion(
    messages: ChatMessage[],
    options?: OpenRouterRequestOptions
  ): Promise<ChatCompletionResponse> {
    const model = options?.model || this.config.defaultModel;

    const response = await this.makeRequest<ChatCompletionResponse>('/chat/completions', {
      model,
      messages,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
    });

    this.trackCost(
      model,
      'chat_completion',
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );

    return response;
  }

  async chatCompletionJson<T>(
    messages: ChatMessage[],
    options?: OpenRouterRequestOptions
  ): Promise<T> {
    const model = options?.model || this.config.defaultModel;

    const response = await this.makeRequest<ChatCompletionResponse>('/chat/completions', {
      model,
      messages,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.3,
      response_format: { type: 'json_object' },
    });

    this.trackCost(
      model,
      'chat_completion_json',
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );

    try {
      return JSON.parse(response.choices[0].message.content) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error}`);
    }
  }

  // ============================================================================
  // Specialized Analysis Methods
  // ============================================================================

  async analyzeSentiment(
    text: string,
    options?: OpenRouterRequestOptions
  ): Promise<{ score: number; label: 'negative' | 'neutral' | 'positive'; confidence: number }> {
    const result = await this.chatCompletionJson<{
      score: number;
      label: string;
      confidence: number;
    }>([
      {
        role: 'system',
        content: `Analyze the sentiment of the given text. Return a JSON object with:
- score: number from -1 (very negative) to 1 (very positive)
- label: one of "negative", "neutral", or "positive"
- confidence: number from 0 to 1 indicating how confident you are

Only return valid JSON, no other text.`,
      },
      {
        role: 'user',
        content: text,
      },
    ], { ...options, model: options?.model || 'openai/gpt-4o-mini' });

    return {
      score: Math.max(-1, Math.min(1, result.score)),
      label: result.label as 'negative' | 'neutral' | 'positive',
      confidence: Math.max(0, Math.min(1, result.confidence)),
    };
  }

  async analyzeEmotions(
    text: string,
    options?: OpenRouterRequestOptions
  ): Promise<{ emotion: string; score: number }[]> {
    const result = await this.chatCompletionJson<{
      emotions: { emotion: string; score: number }[];
    }>([
      {
        role: 'system',
        content: `Analyze the emotions present in the given text. Return a JSON object with:
- emotions: array of objects, each with:
  - emotion: one of "joy", "sadness", "anger", "fear", "surprise", "disgust", "neutral"
  - score: number from 0 to 1 indicating intensity

Only include emotions with score > 0.1. Only return valid JSON, no other text.`,
      },
      {
        role: 'user',
        content: text,
      },
    ], { ...options, model: options?.model || 'openai/gpt-4o-mini' });

    return result.emotions.map(e => ({
      emotion: e.emotion,
      score: Math.max(0, Math.min(1, e.score)),
    }));
  }

  async extractEntities(
    text: string,
    options?: OpenRouterRequestOptions
  ): Promise<{
    type: 'person' | 'place' | 'organization' | 'date' | 'event' | 'other';
    value: string;
    confidence: number;
  }[]> {
    const result = await this.chatCompletionJson<{
      entities: {
        type: string;
        value: string;
        confidence: number;
      }[];
    }>([
      {
        role: 'system',
        content: `Extract named entities from the given text. Return a JSON object with:
- entities: array of objects, each with:
  - type: one of "person", "place", "organization", "date", "event", "other"
  - value: the entity text as it appears
  - confidence: number from 0 to 1

Only return valid JSON, no other text.`,
      },
      {
        role: 'user',
        content: text,
      },
    ], { ...options, model: options?.model || 'openai/gpt-4o-mini' });

    return result.entities.map(e => ({
      type: e.type as 'person' | 'place' | 'organization' | 'date' | 'event' | 'other',
      value: e.value,
      confidence: Math.max(0, Math.min(1, e.confidence)),
    }));
  }

  async extractOcrText(
    imageUrl: string,
    options?: OpenRouterRequestOptions
  ): Promise<{ text: string; confidence: number }> {
    const response = await this.chatCompletion([
      {
        role: 'system',
        content: 'Extract all visible text from the image. Return only the extracted text, preserving layout where possible. If no text is visible, return an empty string.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'high' },
          },
          {
            type: 'text',
            text: 'Extract all text from this image.',
          },
        ],
      },
    ], { ...options, model: options?.model || 'openai/gpt-4o' });

    const extractedText = response.choices[0].message.content.trim();

    // Confidence is estimated based on response characteristics
    const confidence = extractedText.length > 0 ? 0.85 : 0.5;

    return { text: extractedText, confidence };
  }

  // ============================================================================
  // Cost Tracking
  // ============================================================================

  private trackCost(
    model: string,
    operation: string,
    promptTokens: number,
    completionTokens: number
  ): void {
    if (!this.config.enableCostTracking) return;

    const pricing = OpenRouterAdapter.MODEL_PRICING[model] || { input: 0.01, output: 0.03 };
    const estimatedCost =
      (promptTokens * pricing.input / 1_000_000) +
      (completionTokens * pricing.output / 1_000_000);

    this.costRecords.push({
      timestamp: Date.now(),
      model,
      operation,
      promptTokens,
      completionTokens,
      estimatedCost,
    });
  }

  getCostRecords(): CostRecord[] {
    return [...this.costRecords];
  }

  getTotalCost(): number {
    return this.costRecords.reduce((sum, record) => sum + record.estimatedCost, 0);
  }

  clearCostRecords(): void {
    this.costRecords = [];
  }

  // ============================================================================
  // HTTP Request Handling
  // ============================================================================

  private async makeRequest<T>(
    endpoint: string,
    body: Record<string, unknown>,
    attempt: number = 1
  ): Promise<T> {
    await this.rateLimiter.acquire();

    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://neural-intelligence.app',
          'X-Title': 'Neural Intelligence Platform',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        // Handle rate limiting
        if (response.status === 429) {
          if (attempt <= this.config.maxRetries) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '0') * 1000;
            const delay = Math.max(retryAfter, this.config.retryDelayMs * Math.pow(2, attempt - 1));
            await this.sleep(delay);
            return this.makeRequest<T>(endpoint, body, attempt + 1);
          }
        }

        // Handle server errors with retry
        if (response.status >= 500 && attempt <= this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
          return this.makeRequest<T>(endpoint, body, attempt + 1);
        }

        throw new OpenRouterError(
          `OpenRouter API error: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof OpenRouterError) {
        throw error;
      }

      // Network errors - retry
      if (attempt <= this.config.maxRetries) {
        const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
        return this.makeRequest<T>(endpoint, body, attempt + 1);
      }

      throw new OpenRouterError(
        `Network error: ${error}`,
        0,
        String(error)
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Error Types
// ============================================================================

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let defaultAdapter: OpenRouterAdapter | null = null;

export function createOpenRouterAdapter(config: OpenRouterConfig): OpenRouterAdapter {
  return new OpenRouterAdapter(config);
}

export function getDefaultAdapter(): OpenRouterAdapter {
  if (!defaultAdapter) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    defaultAdapter = new OpenRouterAdapter({ apiKey });
  }
  return defaultAdapter;
}

export function setDefaultAdapter(adapter: OpenRouterAdapter): void {
  defaultAdapter = adapter;
}
