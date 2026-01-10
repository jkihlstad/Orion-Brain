/**
 * Neural Intelligence Platform - Math Utilities Tests
 *
 * Unit tests for vector operations, similarity functions, and clustering algorithms.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  dotProduct,
  magnitude,
  normalize,
  cosineSimilarity,
  euclideanDistance,
  vectorAdd,
  vectorSubtract,
  vectorScale,
  vectorMean,
  IncrementalClusterer,
  generateId,
  chunk,
  variance,
  standardDeviation,
} from '../math';

// =============================================================================
// VECTOR OPERATIONS TESTS
// =============================================================================

describe('dotProduct', () => {
  it('should calculate dot product of two vectors correctly', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    expect(dotProduct(a, b)).toBe(32);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(dotProduct(a, b)).toBe(0);
  });

  it('should handle zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(dotProduct(a, b)).toBe(0);
  });

  it('should throw error for dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [4, 5];
    expect(() => dotProduct(a, b)).toThrow('Vector dimension mismatch');
  });

  it('should handle negative values', () => {
    const a = [-1, 2, -3];
    const b = [4, -5, 6];
    // -1*4 + 2*(-5) + (-3)*6 = -4 - 10 - 18 = -32
    expect(dotProduct(a, b)).toBe(-32);
  });
});

describe('magnitude', () => {
  it('should calculate magnitude correctly', () => {
    const vector = [3, 4];
    // sqrt(9 + 16) = 5
    expect(magnitude(vector)).toBe(5);
  });

  it('should return 0 for zero vector', () => {
    const vector = [0, 0, 0];
    expect(magnitude(vector)).toBe(0);
  });

  it('should handle unit vectors', () => {
    const vector = [1, 0, 0];
    expect(magnitude(vector)).toBe(1);
  });

  it('should handle 3D vectors', () => {
    const vector = [1, 2, 2];
    // sqrt(1 + 4 + 4) = 3
    expect(magnitude(vector)).toBe(3);
  });
});

describe('normalize', () => {
  it('should normalize a vector to unit length', () => {
    const vector = [3, 4];
    const normalized = normalize(vector);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
    expect(magnitude(normalized)).toBeCloseTo(1);
  });

  it('should return zero vector for zero input', () => {
    const vector = [0, 0, 0];
    const normalized = normalize(vector);
    expect(normalized).toEqual([0, 0, 0]);
  });

  it('should preserve direction', () => {
    const vector = [2, 2, 2];
    const normalized = normalize(vector);
    // All components should be equal
    expect(normalized[0]).toEqual(normalized[1]);
    expect(normalized[1]).toEqual(normalized[2]);
  });

  it('should produce unit vector', () => {
    const vector = [10, 20, 30];
    const normalized = normalize(vector);
    expect(magnitude(normalized)).toBeCloseTo(1);
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('should return 0 when one vector is zero', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('should throw error for dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [4, 5];
    expect(() => cosineSimilarity(a, b)).toThrow('Vector dimension mismatch');
  });

  it('should be scale invariant', () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // Same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });
});

describe('euclideanDistance', () => {
  it('should calculate distance correctly', () => {
    const a = [0, 0];
    const b = [3, 4];
    expect(euclideanDistance(a, b)).toBe(5);
  });

  it('should return 0 for identical vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(euclideanDistance(a, b)).toBe(0);
  });

  it('should be symmetric', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(euclideanDistance(a, b)).toBeCloseTo(euclideanDistance(b, a));
  });

  it('should throw error for dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [4, 5];
    expect(() => euclideanDistance(a, b)).toThrow('Vector dimension mismatch');
  });
});

describe('vectorAdd', () => {
  it('should add vectors element-wise', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(vectorAdd(a, b)).toEqual([5, 7, 9]);
  });

  it('should handle negative values', () => {
    const a = [1, -2, 3];
    const b = [-4, 5, -6];
    expect(vectorAdd(a, b)).toEqual([-3, 3, -3]);
  });

  it('should handle zero vectors', () => {
    const a = [1, 2, 3];
    const b = [0, 0, 0];
    expect(vectorAdd(a, b)).toEqual([1, 2, 3]);
  });

  it('should throw error for dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [4, 5];
    expect(() => vectorAdd(a, b)).toThrow('Vector dimension mismatch');
  });
});

describe('vectorSubtract', () => {
  it('should subtract vectors element-wise', () => {
    const a = [5, 7, 9];
    const b = [1, 2, 3];
    expect(vectorSubtract(a, b)).toEqual([4, 5, 6]);
  });

  it('should return zero for identical vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(vectorSubtract(a, b)).toEqual([0, 0, 0]);
  });

  it('should throw error for dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [4, 5];
    expect(() => vectorSubtract(a, b)).toThrow('Vector dimension mismatch');
  });
});

describe('vectorScale', () => {
  it('should scale vector by scalar', () => {
    const vector = [1, 2, 3];
    expect(vectorScale(vector, 2)).toEqual([2, 4, 6]);
  });

  it('should handle zero scalar', () => {
    const vector = [1, 2, 3];
    expect(vectorScale(vector, 0)).toEqual([0, 0, 0]);
  });

  it('should handle negative scalar', () => {
    const vector = [1, 2, 3];
    expect(vectorScale(vector, -1)).toEqual([-1, -2, -3]);
  });

  it('should handle fractional scalar', () => {
    const vector = [2, 4, 6];
    expect(vectorScale(vector, 0.5)).toEqual([1, 2, 3]);
  });
});

describe('vectorMean', () => {
  it('should calculate mean of vectors', () => {
    const vectors = [
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 7],
    ];
    expect(vectorMean(vectors)).toEqual([3, 4, 5]);
  });

  it('should return same vector for single input', () => {
    const vectors = [[1, 2, 3]];
    expect(vectorMean(vectors)).toEqual([1, 2, 3]);
  });

  it('should throw error for empty array', () => {
    expect(() => vectorMean([])).toThrow('Cannot calculate mean of empty vector array');
  });

  it('should throw error for dimension mismatch', () => {
    const vectors = [
      [1, 2, 3],
      [4, 5], // Different dimension
    ];
    expect(() => vectorMean(vectors)).toThrow('Vector dimension mismatch');
  });
});

// =============================================================================
// INCREMENTAL CLUSTERER TESTS
// =============================================================================

describe('IncrementalClusterer', () => {
  interface TestItem {
    id: string;
    embedding: number[];
  }

  let clusterer: IncrementalClusterer<TestItem>;

  beforeEach(() => {
    clusterer = new IncrementalClusterer<TestItem>(
      0.85, // similarityThreshold
      (item) => item.embedding, // getEmbedding
      1 // minClusterSize
    );
  });

  describe('addItem', () => {
    it('should create a new cluster for first item', () => {
      const item: TestItem = { id: '1', embedding: [1, 0, 0] };
      const result = clusterer.addItem(item);

      expect(result.isNewCluster).toBe(true);
      expect(result.clusterId).toBe('cluster_0');
      expect(result.update.action).toBe('create');
      expect(result.update.memberCount).toBe(1);
    });

    it('should add similar items to same cluster', () => {
      const item1: TestItem = { id: '1', embedding: [1, 0, 0] };
      const item2: TestItem = { id: '2', embedding: [0.99, 0.01, 0] }; // Very similar

      const result1 = clusterer.addItem(item1);
      const result2 = clusterer.addItem(item2);

      expect(result1.isNewCluster).toBe(true);
      expect(result2.isNewCluster).toBe(false);
      expect(result2.clusterId).toBe(result1.clusterId);
      expect(result2.update.action).toBe('update');
      expect(result2.update.memberCount).toBe(2);
    });

    it('should create new cluster for dissimilar items', () => {
      const item1: TestItem = { id: '1', embedding: [1, 0, 0] };
      const item2: TestItem = { id: '2', embedding: [0, 1, 0] }; // Orthogonal

      const result1 = clusterer.addItem(item1);
      const result2 = clusterer.addItem(item2);

      expect(result1.isNewCluster).toBe(true);
      expect(result2.isNewCluster).toBe(true);
      expect(result1.clusterId).not.toBe(result2.clusterId);
    });
  });

  describe('getCluster', () => {
    it('should return null for non-existent cluster', () => {
      expect(clusterer.getCluster('nonexistent')).toBeNull();
    });

    it('should return cluster with members', () => {
      const item: TestItem = { id: '1', embedding: [1, 0, 0] };
      const result = clusterer.addItem(item);

      const cluster = clusterer.getCluster(result.clusterId);
      expect(cluster).not.toBeNull();
      expect(cluster!.members).toHaveLength(1);
      expect(cluster!.members[0]).toEqual(item);
    });
  });

  describe('getAllClusters', () => {
    it('should return empty array initially', () => {
      expect(clusterer.getAllClusters()).toHaveLength(0);
    });

    it('should return all clusters', () => {
      const item1: TestItem = { id: '1', embedding: [1, 0, 0] };
      const item2: TestItem = { id: '2', embedding: [0, 1, 0] };

      clusterer.addItem(item1);
      clusterer.addItem(item2);

      const clusters = clusterer.getAllClusters();
      expect(clusters).toHaveLength(2);
    });
  });

  describe('findMostSimilarCluster', () => {
    it('should return null when no clusters exist', () => {
      const result = clusterer.findMostSimilarCluster([1, 0, 0]);
      expect(result).toBeNull();
    });

    it('should find most similar cluster', () => {
      const item1: TestItem = { id: '1', embedding: [1, 0, 0] };
      const item2: TestItem = { id: '2', embedding: [0, 1, 0] };

      clusterer.addItem(item1);
      clusterer.addItem(item2);

      const result = clusterer.findMostSimilarCluster([0.9, 0.1, 0]);
      expect(result).not.toBeNull();
      expect(result!.clusterId).toBe('cluster_0');
      expect(result!.similarity).toBeGreaterThan(0.9);
    });
  });

  describe('mergeClusters', () => {
    it('should return null for non-existent clusters', () => {
      const result = clusterer.mergeClusters('cluster_0', 'cluster_1');
      expect(result).toBeNull();
    });

    it('should merge two clusters', () => {
      const item1: TestItem = { id: '1', embedding: [1, 0, 0] };
      const item2: TestItem = { id: '2', embedding: [0, 1, 0] };

      const result1 = clusterer.addItem(item1);
      const result2 = clusterer.addItem(item2);

      const mergeResult = clusterer.mergeClusters(result1.clusterId, result2.clusterId);

      expect(mergeResult).not.toBeNull();
      expect(mergeResult!.action).toBe('merge');
      expect(mergeResult!.memberCount).toBe(2);
      expect(clusterer.clusterCount).toBe(1);
    });
  });

  describe('importCluster', () => {
    it('should import existing cluster', () => {
      const items: TestItem[] = [
        { id: '1', embedding: [1, 0, 0] },
        { id: '2', embedding: [0.99, 0.01, 0] },
      ];

      clusterer.importCluster('cluster_5', [1, 0, 0], items);

      const cluster = clusterer.getCluster('cluster_5');
      expect(cluster).not.toBeNull();
      expect(cluster!.members).toHaveLength(2);
      expect(clusterer.clusterCount).toBe(1);
    });

    it('should update nextClusterId to avoid collisions', () => {
      clusterer.importCluster('cluster_10', [1, 0, 0], []);

      // Next added item should get cluster_11 if dissimilar
      const item: TestItem = { id: '1', embedding: [0, 1, 0] };
      const result = clusterer.addItem(item);

      expect(result.clusterId).toBe('cluster_11');
    });
  });

  describe('clusterCount', () => {
    it('should return 0 initially', () => {
      expect(clusterer.clusterCount).toBe(0);
    });

    it('should track cluster count correctly', () => {
      const item1: TestItem = { id: '1', embedding: [1, 0, 0] };
      const item2: TestItem = { id: '2', embedding: [0, 1, 0] };

      clusterer.addItem(item1);
      expect(clusterer.clusterCount).toBe(1);

      clusterer.addItem(item2);
      expect(clusterer.clusterCount).toBe(2);
    });
  });
});

// =============================================================================
// UTILITY FUNCTIONS TESTS
// =============================================================================

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should include prefix when provided', () => {
    const id = generateId('test');
    expect(id.startsWith('test_')).toBe(true);
  });

  it('should generate valid string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('chunk', () => {
  it('should chunk array into smaller arrays', () => {
    const array = [1, 2, 3, 4, 5, 6];
    const chunks = chunk(array, 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('should handle uneven chunks', () => {
    const array = [1, 2, 3, 4, 5];
    const chunks = chunk(array, 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should handle empty array', () => {
    const chunks = chunk([], 2);
    expect(chunks).toEqual([]);
  });

  it('should handle chunk size larger than array', () => {
    const array = [1, 2, 3];
    const chunks = chunk(array, 10);
    expect(chunks).toEqual([[1, 2, 3]]);
  });
});

describe('variance', () => {
  it('should calculate variance correctly', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    // Mean = 5, variance = 4
    expect(variance(values)).toBe(4);
  });

  it('should return 0 for empty array', () => {
    expect(variance([])).toBe(0);
  });

  it('should return 0 for single value', () => {
    expect(variance([5])).toBe(0);
  });

  it('should return 0 for identical values', () => {
    expect(variance([3, 3, 3, 3])).toBe(0);
  });
});

describe('standardDeviation', () => {
  it('should calculate standard deviation correctly', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    // Variance = 4, stdDev = 2
    expect(standardDeviation(values)).toBe(2);
  });

  it('should return 0 for empty array', () => {
    expect(standardDeviation([])).toBe(0);
  });

  it('should return 0 for identical values', () => {
    expect(standardDeviation([5, 5, 5])).toBe(0);
  });
});
