/**
 * Neural Intelligence Platform - Text Processing Pipeline
 *
 * Handles:
 * - Text embedding generation via OpenRouter
 * - Entity extraction (people, places, organizations, dates, events)
 * - Language detection
 * - Text normalization
 */

import {
  TextProcessingResult,
  TextPipelineConfig,
  ExtractedEntity,
  EmbeddingVector,
  MediaSource,
  DEFAULT_PIPELINE_CONFIG,
} from '../types';
import {
  OpenRouterAdapter,
  getDefaultAdapter,
} from '../adapters/openrouter';
import { generateId, chunk } from '../utils/math';

// ============================================================================
// Types
// ============================================================================

interface TextMetadata {
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  language?: string;
  languageConfidence?: number;
}

interface EntityExtractionResult {
  entities: ExtractedEntity[];
  processingTimeMs: number;
}

// ============================================================================
// Text Pipeline Implementation
// ============================================================================

/**
 * Process text content and return structured results
 */
export async function processText(
  text: string,
  config: Partial<TextPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<TextProcessingResult> {
  const startTime = Date.now();
  const resolvedConfig = { ...DEFAULT_PIPELINE_CONFIG.text, ...config };
  const resolvedAdapter = adapter || getDefaultAdapter();

  // Step 1: Normalize and analyze text
  console.log('[Text Pipeline] Analyzing text...');
  const normalizedText = normalizeText(text);
  const metadata = analyzeText(normalizedText);

  // Step 2: Truncate if needed (respect token limits)
  const truncatedText = truncateToTokenLimit(normalizedText, resolvedConfig.maxTokens);

  // Step 3: Generate text embedding
  console.log('[Text Pipeline] Generating embedding...');
  const embedding = await generateTextEmbedding(
    truncatedText,
    resolvedAdapter,
    resolvedConfig
  );

  // Step 4: Extract entities (if enabled)
  let entities: ExtractedEntity[] = [];

  if (resolvedConfig.enableEntityExtraction) {
    console.log('[Text Pipeline] Extracting entities...');
    const entityResult = await extractEntities(
      truncatedText,
      resolvedAdapter,
      resolvedConfig
    );
    entities = entityResult.entities;
  }

  // Step 5: Detect language (if not already known)
  let language = metadata.language;
  if (!language) {
    language = await detectLanguage(truncatedText, resolvedAdapter);
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    embedding,
    entities,
    language,
    wordCount: metadata.wordCount,
    processingTimeMs,
  };
}

/**
 * Process text from a media source (file URL)
 */
export async function processTextSource(
  source: MediaSource,
  config: Partial<TextPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<TextProcessingResult> {
  // Fetch text content from URL
  const text = await fetchTextContent(source.url);
  return processText(text, config, adapter);
}

// ============================================================================
// Text Analysis
// ============================================================================

/**
 * Normalize text (remove extra whitespace, normalize unicode, etc.)
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFKC')  // Normalize unicode
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\t/g, ' ')  // Convert tabs to spaces
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .trim();
}

/**
 * Analyze text and extract metadata
 */
function analyzeText(text: string): TextMetadata {
  // Count words (split by whitespace)
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Count characters
  const characterCount = text.length;

  // Count sentences (rough estimate based on punctuation)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // Simple language detection heuristic
  // In production, use a proper language detection library
  const language = detectLanguageHeuristic(text);

  return {
    wordCount,
    characterCount,
    sentenceCount,
    language,
    languageConfidence: 0.8,  // Placeholder confidence
  };
}

/**
 * Simple language detection heuristic
 */
function detectLanguageHeuristic(text: string): string {
  // Common words for basic language detection
  const languagePatterns: { [key: string]: RegExp[] } = {
    en: [/\bthe\b/i, /\band\b/i, /\bis\b/i, /\bof\b/i, /\bto\b/i],
    es: [/\bel\b/i, /\bla\b/i, /\bde\b/i, /\by\b/i, /\ben\b/i],
    fr: [/\ble\b/i, /\bla\b/i, /\bde\b/i, /\bet\b/i, /\best\b/i],
    de: [/\bder\b/i, /\bdie\b/i, /\bdas\b/i, /\bund\b/i, /\bist\b/i],
    pt: [/\bo\b/i, /\ba\b/i, /\bde\b/i, /\be\b/i, /\bque\b/i],
  };

  let maxScore = 0;
  let detectedLanguage = 'en';

  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      detectedLanguage = lang;
    }
  }

  return detectedLanguage;
}

/**
 * Truncate text to respect token limit
 * Rough estimate: 1 token ~= 4 characters for English
 */
function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = Math.ceil(text.length / 4);

  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Truncate to approximate token limit
  const maxChars = maxTokens * 4;
  const truncated = text.slice(0, maxChars);

  // Try to end at a sentence boundary
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );

  if (lastSentenceEnd > maxChars * 0.8) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.9) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

// ============================================================================
// Text Embedding Generation
// ============================================================================

/**
 * Generate text embedding
 */
async function generateTextEmbedding(
  text: string,
  adapter: OpenRouterAdapter,
  config: TextPipelineConfig
): Promise<EmbeddingVector> {
  return adapter.generateTextEmbedding(text, {
    model: config.embeddingModel,
  });
}

// ============================================================================
// Entity Extraction
// ============================================================================

/**
 * Extract named entities from text
 */
async function extractEntities(
  text: string,
  adapter: OpenRouterAdapter,
  config: TextPipelineConfig
): Promise<EntityExtractionResult> {
  const startTime = Date.now();

  // Use OpenRouter adapter for entity extraction
  const entities = await adapter.extractEntities(text, {
    model: config.entityExtractionModel,
  });

  // Convert to our entity format with offsets
  const extractedEntities: ExtractedEntity[] = entities.map((entity, index) => {
    // Find entity position in text
    const startOffset = text.indexOf(entity.value);
    const endOffset = startOffset >= 0 ? startOffset + entity.value.length : -1;

    return {
      type: entity.type,
      value: entity.value,
      confidence: entity.confidence,
      startOffset: startOffset >= 0 ? startOffset : 0,
      endOffset: endOffset >= 0 ? endOffset : entity.value.length,
    };
  });

  return {
    entities: extractedEntities,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Detect language using LLM
 */
async function detectLanguage(
  text: string,
  adapter: OpenRouterAdapter
): Promise<string> {
  try {
    const result = await adapter.chatCompletionJson<{ language: string }>([
      {
        role: 'system',
        content: 'Detect the language of the given text. Return a JSON object with a single "language" field containing the ISO 639-1 two-letter language code (e.g., "en" for English, "es" for Spanish).',
      },
      {
        role: 'user',
        content: text.slice(0, 500),  // Only need a sample
      },
    ], { model: 'openai/gpt-4o-mini', maxTokens: 50 });

    return result.language || 'en';
  } catch (error) {
    console.warn('[Text Pipeline] Language detection failed, defaulting to English');
    return 'en';
  }
}

// ============================================================================
// Text Content Fetching
// ============================================================================

/**
 * Fetch text content from a URL
 */
async function fetchTextContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch text: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return text;
  } catch (error) {
    console.error('[Text Pipeline] Failed to fetch text content:', error);
    throw error;
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process multiple texts in batch
 */
export async function processTextBatch(
  texts: string[],
  config: Partial<TextPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<TextProcessingResult[]> {
  const results: TextProcessingResult[] = [];

  // Process in parallel with concurrency limit
  const concurrencyLimit = 10;
  const batches = chunk(texts, concurrencyLimit);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (text) => {
        try {
          return await processText(text, config, adapter);
        } catch (error) {
          console.error('[Text Pipeline] Failed to process text:', error);
          // Return a minimal result with error
          return {
            embedding: {
              values: [],
              dimensions: 0,
              model: 'error',
            },
            entities: [],
            wordCount: 0,
            processingTimeMs: 0,
          } as TextProcessingResult;
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}

/**
 * Generate embeddings for multiple texts efficiently
 */
export async function generateTextEmbeddingsBatch(
  texts: string[],
  config: Partial<TextPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<EmbeddingVector[]> {
  const resolvedConfig = { ...DEFAULT_PIPELINE_CONFIG.text, ...config };
  const resolvedAdapter = adapter || getDefaultAdapter();

  // Use batch embedding endpoint if available
  return resolvedAdapter.generateTextEmbeddingBatch(texts, {
    model: resolvedConfig.embeddingModel,
  });
}

// ============================================================================
// Text Similarity
// ============================================================================

/**
 * Compare two texts by their embeddings
 */
export function compareTexts(
  embedding1: EmbeddingVector,
  embedding2: EmbeddingVector
): number {
  if (embedding1.dimensions !== embedding2.dimensions) {
    throw new Error('Embedding dimensions must match');
  }

  // Calculate cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.values.length; i++) {
    dotProduct += embedding1.values[i] * embedding2.values[i];
    norm1 += embedding1.values[i] * embedding1.values[i];
    norm2 += embedding2.values[i] * embedding2.values[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Find most similar texts from a collection
 */
export function findSimilarTexts(
  queryEmbedding: EmbeddingVector,
  textEmbeddings: { id: string; embedding: EmbeddingVector }[],
  topK: number = 5
): { id: string; similarity: number }[] {
  const similarities = textEmbeddings.map(item => ({
    id: item.id,
    similarity: compareTexts(queryEmbedding, item.embedding),
  }));

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// ============================================================================
// Text Chunking for Long Documents
// ============================================================================

/**
 * Split long text into overlapping chunks for embedding
 */
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): { text: string; startOffset: number; endOffset: number }[] {
  const chunks: { text: string; startOffset: number; endOffset: number }[] = [];

  if (text.length <= chunkSize) {
    return [{ text, startOffset: 0, endOffset: text.length }];
  }

  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to end at a sentence boundary
    if (end < text.length) {
      const lastSentenceEnd = Math.max(
        text.lastIndexOf('.', end),
        text.lastIndexOf('!', end),
        text.lastIndexOf('?', end)
      );

      if (lastSentenceEnd > start + chunkSize * 0.5) {
        end = lastSentenceEnd + 1;
      } else {
        // Fall back to word boundary
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start + chunkSize * 0.5) {
          end = lastSpace;
        }
      }
    }

    chunks.push({
      text: text.slice(start, end).trim(),
      startOffset: start,
      endOffset: end,
    });

    start = end - overlap;

    // Avoid tiny final chunks
    if (text.length - start < chunkSize * 0.3) {
      // Include remaining text in last chunk
      break;
    }
  }

  // Handle any remaining text
  if (chunks.length > 0 && chunks[chunks.length - 1].endOffset < text.length) {
    const lastChunk = chunks[chunks.length - 1];
    lastChunk.text = text.slice(lastChunk.startOffset).trim();
    lastChunk.endOffset = text.length;
  }

  return chunks;
}

/**
 * Process a long document by chunking and embedding each chunk
 */
export async function processLongDocument(
  text: string,
  config: Partial<TextPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<{
  chunks: { text: string; embedding: EmbeddingVector; startOffset: number; endOffset: number }[];
  aggregateEmbedding: EmbeddingVector;
  entities: ExtractedEntity[];
  wordCount: number;
  processingTimeMs: number;
}> {
  const startTime = Date.now();
  const resolvedConfig = { ...DEFAULT_PIPELINE_CONFIG.text, ...config };
  const resolvedAdapter = adapter || getDefaultAdapter();

  // Split into chunks
  const textChunks = chunkText(text, 1000, 200);

  // Generate embeddings for all chunks
  const chunkTexts = textChunks.map(c => c.text);
  const embeddings = await generateTextEmbeddingsBatch(chunkTexts, config, adapter);

  // Combine chunks with embeddings
  const chunks = textChunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  // Calculate aggregate embedding (mean of all chunk embeddings)
  const allValues = embeddings.map(e => e.values);
  const dimensions = embeddings[0].dimensions;
  const aggregateValues = new Array(dimensions).fill(0);

  for (const values of allValues) {
    for (let i = 0; i < dimensions; i++) {
      aggregateValues[i] += values[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    aggregateValues[i] /= allValues.length;
  }

  // Extract entities from full text (or sample if too long)
  let entities: ExtractedEntity[] = [];
  if (resolvedConfig.enableEntityExtraction) {
    const sampleText = text.slice(0, 10000);  // Limit for entity extraction
    const entityResult = await extractEntities(sampleText, resolvedAdapter, resolvedConfig);
    entities = entityResult.entities;
  }

  // Count words in full text
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  return {
    chunks,
    aggregateEmbedding: {
      values: aggregateValues,
      dimensions,
      model: embeddings[0].model,
      normalizedAt: Date.now(),
    },
    entities,
    wordCount,
    processingTimeMs: Date.now() - startTime,
  };
}
