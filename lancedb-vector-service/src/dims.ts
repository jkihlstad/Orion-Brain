// Embedding dimensions per table - enforced at insert and search time
export const TABLE_DIMENSIONS: Record<string, number> = {
  "memory_vectors": 1536,        // OpenAI text-embedding-3-small
  "speaker_embeddings": 192,     // Speaker diarization embeddings
  "face_embeddings": 512,        // Face recognition embeddings
  "audio_fingerprints": 128,     // Audio fingerprint vectors
};

export function validateVector(table: string, vector: number[]): string | null {
  const expectedDim = TABLE_DIMENSIONS[table];

  if (!expectedDim) {
    return `Unknown table: ${table}`;
  }

  if (!Array.isArray(vector)) {
    return "Vector must be an array";
  }

  if (vector.length !== expectedDim) {
    return `Vector dimension mismatch: expected ${expectedDim}, got ${vector.length}`;
  }

  if (!vector.every((v) => typeof v === "number" && isFinite(v))) {
    return "Vector must contain only finite numbers";
  }

  return null;
}

export function getDimension(table: string): number | undefined {
  return TABLE_DIMENSIONS[table];
}
