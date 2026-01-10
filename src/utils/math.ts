/**
 * Neural Intelligence Platform - Mathematical Utilities
 * Vector operations, similarity functions, and clustering algorithms
 */

// ============================================================================
// Vector Operations
// ============================================================================

/**
 * Calculate the dot product of two vectors
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Calculate the magnitude (L2 norm) of a vector
 */
export function magnitude(vector: number[]): number {
  let sum = 0;
  for (const v of vector) {
    sum += v * v;
  }
  return Math.sqrt(sum);
}

/**
 * Normalize a vector to unit length
 */
export function normalize(vector: number[]): number[] {
  const mag = magnitude(vector);
  if (mag === 0) {
    return vector.map(() => 0);
  }
  return vector.map(v => v / mag);
}

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 (opposite) and 1 (identical)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  const dot = dotProduct(a, b);
  const magA = magnitude(a);
  const magB = magnitude(b);

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (magA * magB);
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Add two vectors element-wise
 */
export function vectorAdd(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((v, i) => v + b[i]);
}

/**
 * Subtract vector b from vector a element-wise
 */
export function vectorSubtract(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((v, i) => v - b[i]);
}

/**
 * Scale a vector by a scalar
 */
export function vectorScale(vector: number[], scalar: number): number[] {
  return vector.map(v => v * scalar);
}

/**
 * Calculate the mean of multiple vectors
 */
export function vectorMean(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error('Cannot calculate mean of empty vector array');
  }

  const dimensions = vectors[0].length;
  const sum = new Array(dimensions).fill(0);

  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${dimensions}, got ${vector.length}`);
    }
    for (let i = 0; i < dimensions; i++) {
      sum[i] += vector[i];
    }
  }

  return sum.map(v => v / vectors.length);
}

// ============================================================================
// Clustering Types
// ============================================================================

export interface Cluster<T> {
  id: string;
  centroid: number[];
  members: T[];
  memberCount: number;
}

export interface ClusteringResult<T> {
  clusters: Cluster<T>[];
  noise: T[];  // Points not assigned to any cluster
}

export interface IncrementalClusterUpdate {
  action: 'create' | 'update' | 'merge';
  clusterId: string;
  mergedWithId?: string;
  newCentroid: number[];
  memberCount: number;
}

// ============================================================================
// Incremental Clustering Algorithm
// ============================================================================

/**
 * Incremental clustering algorithm for speaker embeddings
 * Uses cosine similarity with configurable threshold
 */
export class IncrementalClusterer<T> {
  private clusters: Map<string, {
    centroid: number[];
    members: T[];
    embeddingSum: number[];  // Running sum for efficient centroid update
  }> = new Map();

  private nextClusterId: number = 0;

  constructor(
    private readonly similarityThreshold: number = 0.85,
    private readonly getEmbedding: (item: T) => number[],
    private readonly minClusterSize: number = 1
  ) {}

  /**
   * Add a new item to the clustering
   * Returns the cluster assignment and any updates
   */
  addItem(item: T): {
    clusterId: string;
    isNewCluster: boolean;
    update: IncrementalClusterUpdate;
  } {
    const embedding = this.getEmbedding(item);
    const normalizedEmbedding = normalize(embedding);

    // Find best matching cluster
    let bestClusterId: string | null = null;
    let bestSimilarity = -1;

    for (const [clusterId, cluster] of this.clusters) {
      const similarity = cosineSimilarity(normalizedEmbedding, normalize(cluster.centroid));
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestClusterId = clusterId;
      }
    }

    // Check if we should join existing cluster or create new one
    if (bestClusterId !== null && bestSimilarity >= this.similarityThreshold) {
      // Add to existing cluster
      const cluster = this.clusters.get(bestClusterId)!;
      cluster.members.push(item);
      cluster.embeddingSum = vectorAdd(cluster.embeddingSum, embedding);
      cluster.centroid = vectorScale(cluster.embeddingSum, 1 / cluster.members.length);

      return {
        clusterId: bestClusterId,
        isNewCluster: false,
        update: {
          action: 'update',
          clusterId: bestClusterId,
          newCentroid: cluster.centroid,
          memberCount: cluster.members.length,
        },
      };
    } else {
      // Create new cluster
      const newClusterId = `cluster_${this.nextClusterId++}`;
      this.clusters.set(newClusterId, {
        centroid: embedding,
        members: [item],
        embeddingSum: embedding,
      });

      return {
        clusterId: newClusterId,
        isNewCluster: true,
        update: {
          action: 'create',
          clusterId: newClusterId,
          newCentroid: embedding,
          memberCount: 1,
        },
      };
    }
  }

  /**
   * Get cluster by ID
   */
  getCluster(clusterId: string): Cluster<T> | null {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return null;

    return {
      id: clusterId,
      centroid: cluster.centroid,
      members: cluster.members,
      memberCount: cluster.members.length,
    };
  }

  /**
   * Get all clusters
   */
  getAllClusters(): Cluster<T>[] {
    const result: Cluster<T>[] = [];
    for (const [id, cluster] of this.clusters) {
      result.push({
        id,
        centroid: cluster.centroid,
        members: cluster.members,
        memberCount: cluster.members.length,
      });
    }
    return result;
  }

  /**
   * Find most similar cluster to a given embedding
   */
  findMostSimilarCluster(embedding: number[]): { clusterId: string; similarity: number } | null {
    const normalizedEmbedding = normalize(embedding);
    let bestClusterId: string | null = null;
    let bestSimilarity = -1;

    for (const [clusterId, cluster] of this.clusters) {
      const similarity = cosineSimilarity(normalizedEmbedding, normalize(cluster.centroid));
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestClusterId = clusterId;
      }
    }

    if (bestClusterId === null) return null;

    return { clusterId: bestClusterId, similarity: bestSimilarity };
  }

  /**
   * Merge two clusters together
   */
  mergeClusters(clusterId1: string, clusterId2: string): IncrementalClusterUpdate | null {
    const cluster1 = this.clusters.get(clusterId1);
    const cluster2 = this.clusters.get(clusterId2);

    if (!cluster1 || !cluster2) return null;

    // Merge into cluster1
    cluster1.members.push(...cluster2.members);
    cluster1.embeddingSum = vectorAdd(cluster1.embeddingSum, cluster2.embeddingSum);
    cluster1.centroid = vectorScale(cluster1.embeddingSum, 1 / cluster1.members.length);

    // Remove cluster2
    this.clusters.delete(clusterId2);

    return {
      action: 'merge',
      clusterId: clusterId1,
      mergedWithId: clusterId2,
      newCentroid: cluster1.centroid,
      memberCount: cluster1.members.length,
    };
  }

  /**
   * Import existing clusters (for loading from storage)
   */
  importCluster(clusterId: string, centroid: number[], members: T[]): void {
    const embeddingSum = members.length > 0
      ? members.map(m => this.getEmbedding(m)).reduce((a, b) => vectorAdd(a, b))
      : centroid;

    this.clusters.set(clusterId, {
      centroid,
      members,
      embeddingSum,
    });

    // Update next cluster ID to avoid collisions
    const idNum = parseInt(clusterId.replace('cluster_', ''));
    if (!isNaN(idNum) && idNum >= this.nextClusterId) {
      this.nextClusterId = idNum + 1;
    }
  }

  /**
   * Get cluster count
   */
  get clusterCount(): number {
    return this.clusters.size;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Calculate variance of a number array
 */
export function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values));
}
