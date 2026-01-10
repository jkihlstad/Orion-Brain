/**
 * Neural Intelligence Platform - Image Processing Pipeline
 *
 * Handles:
 * - CLIP embedding generation via OpenRouter
 * - OCR text extraction
 * - Image normalization and metadata extraction
 */

import {
  ImageProcessingResult,
  ImagePipelineConfig,
  EmbeddingVector,
  MediaSource,
  DEFAULT_PIPELINE_CONFIG,
} from '../types';
import {
  OpenRouterAdapter,
  getDefaultAdapter,
} from '../adapters/openrouter';
import { generateId } from '../utils/math';

// ============================================================================
// Types
// ============================================================================

interface ImageMetadata {
  width: number;
  height: number;
  format?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
}

interface OcrResult {
  text: string;
  confidence: number;
  regions?: {
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
  }[];
}

// ============================================================================
// Image Pipeline Implementation
// ============================================================================

/**
 * Process image content and return structured results
 */
export async function processImage(
  source: MediaSource,
  config: Partial<ImagePipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<ImageProcessingResult> {
  const startTime = Date.now();
  const resolvedConfig = { ...DEFAULT_PIPELINE_CONFIG.image, ...config };
  const resolvedAdapter = adapter || getDefaultAdapter();

  // Step 1: Extract image metadata
  console.log('[Image Pipeline] Extracting image metadata...');
  const metadata = await extractImageMetadata(source.url, source.mimeType);

  // Step 2: Resize image if needed (for efficiency)
  console.log('[Image Pipeline] Preparing image for processing...');
  const processedImageUrl = await prepareImageForProcessing(
    source.url,
    metadata,
    resolvedConfig.maxImageDimension
  );

  // Step 3: Generate CLIP embedding
  console.log('[Image Pipeline] Generating CLIP embedding...');
  const embedding = await generateImageEmbedding(
    processedImageUrl,
    resolvedAdapter,
    resolvedConfig
  );

  // Step 4: OCR text extraction (if enabled)
  let ocrText: string | undefined;
  let ocrConfidence: number | undefined;

  if (resolvedConfig.enableOcr) {
    console.log('[Image Pipeline] Extracting OCR text...');
    const ocrResult = await extractOcrText(
      processedImageUrl,
      resolvedAdapter,
      resolvedConfig
    );
    ocrText = ocrResult.text;
    ocrConfidence = ocrResult.confidence;
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    embedding,
    ocrText,
    ocrConfidence,
    dimensions: {
      width: metadata.width,
      height: metadata.height,
    },
    processingTimeMs,
  };
}

// ============================================================================
// Image Metadata Extraction
// ============================================================================

/**
 * Extract image metadata
 */
async function extractImageMetadata(
  imageUrl: string,
  mimeType?: string
): Promise<ImageMetadata> {
  // TODO: Implement actual image metadata extraction
  // Options:
  // 1. Use sharp library for Node.js: sharp(imageUrl).metadata()
  // 2. Use browser Image API for web
  // 3. Parse image headers directly

  console.warn('[Image Pipeline] Using placeholder metadata - implement image metadata extraction');

  // Determine format from MIME type or URL
  let format = 'unknown';
  if (mimeType) {
    format = mimeType.split('/')[1] || 'unknown';
  } else if (imageUrl.includes('.')) {
    const ext = imageUrl.split('.').pop()?.toLowerCase();
    format = ext || 'unknown';
  }

  // Simulated metadata
  // In production, parse actual image file headers
  return {
    width: 1024,
    height: 768,
    format,
    colorSpace: 'sRGB',
    hasAlpha: format === 'png' || format === 'webp',
  };
}

// ============================================================================
// Image Preparation
// ============================================================================

/**
 * Prepare image for processing (resize if needed)
 */
async function prepareImageForProcessing(
  imageUrl: string,
  metadata: ImageMetadata,
  maxDimension: number
): Promise<string> {
  // TODO: Implement actual image resizing
  // Options:
  // 1. Use sharp library: sharp(imageUrl).resize(maxDimension).toBuffer()
  // 2. Use browser canvas for web
  // 3. Use a CDN with on-the-fly resizing (Cloudinary, imgix, etc.)

  const maxCurrentDimension = Math.max(metadata.width, metadata.height);

  if (maxCurrentDimension <= maxDimension) {
    // No resizing needed
    return imageUrl;
  }

  console.warn('[Image Pipeline] Using original image - implement image resizing');

  // In production, resize the image and return a new URL or base64
  // For now, return the original URL
  return imageUrl;
}

// ============================================================================
// CLIP Embedding Generation
// ============================================================================

/**
 * Generate CLIP embedding for an image
 */
async function generateImageEmbedding(
  imageUrl: string,
  adapter: OpenRouterAdapter,
  config: ImagePipelineConfig
): Promise<EmbeddingVector> {
  // Use OpenRouter adapter to generate CLIP-like embedding
  const embedding = await adapter.generateClipEmbedding(imageUrl, {
    model: config.clipModel,
  });

  return embedding;
}

// ============================================================================
// OCR Text Extraction
// ============================================================================

/**
 * Extract text from image using OCR
 */
async function extractOcrText(
  imageUrl: string,
  adapter: OpenRouterAdapter,
  config: ImagePipelineConfig
): Promise<OcrResult> {
  const result = await adapter.extractOcrText(imageUrl, {
    model: config.ocrModel,
  });

  return {
    text: result.text,
    confidence: result.confidence,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process multiple images in batch
 */
export async function processImageBatch(
  sources: MediaSource[],
  config: Partial<ImagePipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<ImageProcessingResult[]> {
  const results: ImageProcessingResult[] = [];

  // Process in parallel with concurrency limit
  const concurrencyLimit = 5;

  for (let i = 0; i < sources.length; i += concurrencyLimit) {
    const batch = sources.slice(i, i + concurrencyLimit);

    const batchResults = await Promise.all(
      batch.map(async (source) => {
        try {
          return await processImage(source, config, adapter);
        } catch (error) {
          console.error(`[Image Pipeline] Failed to process ${source.url}:`, error);
          // Return a minimal result with error
          return {
            embedding: {
              values: [],
              dimensions: 0,
              model: 'error',
            },
            dimensions: { width: 0, height: 0 },
            processingTimeMs: 0,
          } as ImageProcessingResult;
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}

// ============================================================================
// Image Similarity
// ============================================================================

/**
 * Compare two images by their embeddings
 */
export function compareImages(
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
 * Find most similar images from a collection
 */
export function findSimilarImages(
  queryEmbedding: EmbeddingVector,
  imageEmbeddings: { id: string; embedding: EmbeddingVector }[],
  topK: number = 5
): { id: string; similarity: number }[] {
  const similarities = imageEmbeddings.map(img => ({
    id: img.id,
    similarity: compareImages(queryEmbedding, img.embedding),
  }));

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a URL points to an image
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const lowercaseUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowercaseUrl.includes(ext));
}

/**
 * Check if a MIME type is an image type
 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Convert image URL to base64
 */
export async function imageUrlToBase64(imageUrl: string): Promise<string> {
  // TODO: Implement actual URL to base64 conversion
  // Options:
  // 1. Use fetch + arrayBuffer + Buffer.from()
  // 2. Use axios with responseType: 'arraybuffer'

  console.warn('[Image Pipeline] Using placeholder base64 - implement URL to base64 conversion');

  // Simulated base64
  // In production, fetch and convert the image
  return 'placeholder_base64_data';
}

/**
 * Get image dimensions from base64 data
 */
export async function getBase64ImageDimensions(
  base64Data: string,
  mimeType: string = 'image/jpeg'
): Promise<{ width: number; height: number }> {
  // TODO: Implement actual dimension extraction from base64
  // Options:
  // 1. Use sharp: sharp(Buffer.from(base64Data, 'base64')).metadata()
  // 2. Parse image headers manually

  console.warn('[Image Pipeline] Using placeholder dimensions - implement base64 dimension extraction');

  return { width: 1024, height: 768 };
}
