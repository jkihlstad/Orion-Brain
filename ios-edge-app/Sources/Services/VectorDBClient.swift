//
//  VectorDBClient.swift
//  Neural Intelligence iOS Edge App
//
//  Singleton client for LanceDB vector database API communication.
//  Handles embedding storage and similarity search operations.
//

import Foundation

// MARK: - Models

/// Represents a search result from the vector database.
public struct SearchResult: Codable, Identifiable, Sendable {
    public let id: String
    public let userId: String
    public let score: Float
    public let vector: [Float]
    public let metadata: [String: String]
    public let createdAt: Date

    public init(
        id: String,
        userId: String,
        score: Float,
        vector: [Float],
        metadata: [String: String],
        createdAt: Date
    ) {
        self.id = id
        self.userId = userId
        self.score = score
        self.vector = vector
        self.metadata = metadata
        self.createdAt = createdAt
    }
}

/// Represents an embedding record stored in the vector database.
public struct EmbeddingRecord: Codable, Sendable {
    public let id: String
    public let userId: String
    public let vector: [Float]
    public let metadata: [String: String]
    public let createdAt: Date
    public let updatedAt: Date?

    public init(
        id: String = UUID().uuidString,
        userId: String,
        vector: [Float],
        metadata: [String: String],
        createdAt: Date = Date(),
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.userId = userId
        self.vector = vector
        self.metadata = metadata
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

/// Filter options for similarity search.
public struct SearchFilter: Codable, Sendable {
    public let metadataFilters: [String: String]?
    public let minScore: Float?
    public let maxResults: Int?
    public let includeVectors: Bool

    public init(
        metadataFilters: [String: String]? = nil,
        minScore: Float? = nil,
        maxResults: Int? = nil,
        includeVectors: Bool = false
    ) {
        self.metadataFilters = metadataFilters
        self.minScore = minScore
        self.maxResults = maxResults
        self.includeVectors = includeVectors
    }
}

// MARK: - Errors

/// Errors that can occur during vector database operations.
public enum VectorDBError: Error, LocalizedError {
    case invalidURL
    case networkError(underlying: Error)
    case serverError(statusCode: Int, message: String?)
    case decodingError(underlying: Error)
    case encodingError(underlying: Error)
    case embeddingNotFound(id: String)
    case invalidVector(reason: String)
    case unauthorized
    case quotaExceeded
    case databaseUnavailable

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid vector database URL configuration"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message ?? "Unknown error")"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Failed to encode request: \(error.localizedDescription)"
        case .embeddingNotFound(let id):
            return "Embedding not found: \(id)"
        case .invalidVector(let reason):
            return "Invalid vector: \(reason)"
        case .unauthorized:
            return "Unauthorized access to vector database"
        case .quotaExceeded:
            return "Vector database storage quota exceeded"
        case .databaseUnavailable:
            return "Vector database is currently unavailable"
        }
    }
}

// MARK: - Configuration

/// Configuration for the VectorDB client.
public struct VectorDBConfig: Sendable {
    public let baseURL: URL
    public let apiKey: String
    public let tableName: String
    public let timeoutInterval: TimeInterval
    public let maxRetries: Int
    public let enableLogging: Bool

    public static let defaultBaseURL = URL(string: "https://your-lancedb-server.com/v1")!

    public init(
        baseURL: URL = defaultBaseURL,
        apiKey: String = "",
        tableName: String = "neural_embeddings",
        timeoutInterval: TimeInterval = 30.0,
        maxRetries: Int = 3,
        enableLogging: Bool = false
    ) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.tableName = tableName
        self.timeoutInterval = timeoutInterval
        self.maxRetries = maxRetries
        self.enableLogging = enableLogging
    }
}

// MARK: - Request/Response Models

private struct StoreEmbeddingRequest: Codable {
    let userId: String
    let vector: [Float]
    let metadata: [String: String]
}

private struct StoreEmbeddingResponse: Codable {
    let id: String
    let success: Bool
}

private struct SearchRequest: Codable {
    let userId: String
    let queryVector: [Float]
    let topK: Int
    let filter: SearchFilter?
}

private struct SearchResponse: Codable {
    let results: [SearchResult]
    let searchTimeMs: Int
}

private struct BatchStoreRequest: Codable {
    let embeddings: [EmbeddingRecord]
}

private struct BatchStoreResponse: Codable {
    let insertedIds: [String]
    let success: Bool
}

// MARK: - VectorDBClient

/// Singleton client for LanceDB vector database API communication.
///
/// This client handles all vector database operations including storing embeddings,
/// similarity search, and batch operations.
///
/// ## Usage
/// ```swift
/// let client = VectorDBClient.shared
/// client.configure(with: VectorDBConfig(apiKey: "your-api-key"))
///
/// // Store an embedding
/// try await client.storeEmbedding(userId: "user123", vector: myVector, metadata: ["type": "audio"])
///
/// // Search for similar vectors
/// let results = try await client.searchSimilar(userId: "user123", queryVector: queryVector, topK: 10)
/// ```
@MainActor
public final class VectorDBClient: Sendable {

    // MARK: - Singleton

    /// Shared singleton instance.
    public static let shared = VectorDBClient()

    // MARK: - Properties

    private let session: URLSession
    private var config: VectorDBConfig
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    // MARK: - Initialization

    private init() {
        self.config = VectorDBConfig()

        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = config.timeoutInterval
        sessionConfig.waitsForConnectivity = true
        self.session = URLSession(configuration: sessionConfig)

        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.keyEncodingStrategy = .convertToSnakeCase

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    // MARK: - Configuration

    /// Configure the client with custom settings.
    /// - Parameter config: The configuration to apply.
    public func configure(with config: VectorDBConfig) {
        self.config = config
    }

    // MARK: - Public Methods

    /// Store an embedding in the vector database.
    ///
    /// - Parameters:
    ///   - userId: The user ID associated with this embedding.
    ///   - vector: The embedding vector (array of floats).
    ///   - metadata: Additional metadata to store with the embedding.
    /// - Returns: The ID of the stored embedding.
    /// - Throws: `VectorDBError` if the operation fails.
    @discardableResult
    public func storeEmbedding(
        userId: String,
        vector: [Float],
        metadata: [String: String]
    ) async throws -> String {
        // Validate vector
        guard !vector.isEmpty else {
            throw VectorDBError.invalidVector(reason: "Vector cannot be empty")
        }

        guard vector.allSatisfy({ $0.isFinite }) else {
            throw VectorDBError.invalidVector(reason: "Vector contains non-finite values")
        }

        let endpoint = config.baseURL
            .appendingPathComponent("tables")
            .appendingPathComponent(config.tableName)
            .appendingPathComponent("embeddings")

        let requestBody = StoreEmbeddingRequest(
            userId: userId,
            vector: vector,
            metadata: metadata
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw VectorDBError.encodingError(underlying: error)
        }

        let response: StoreEmbeddingResponse = try await executeRequest(request: request)
        log("Stored embedding with ID: \(response.id)")
        return response.id
    }

    /// Search for similar vectors in the database.
    ///
    /// - Parameters:
    ///   - userId: The user ID to filter results (optional namespace).
    ///   - queryVector: The query vector to find similarities for.
    ///   - topK: Maximum number of results to return.
    ///   - filter: Optional filter for the search.
    /// - Returns: Array of search results sorted by similarity score.
    /// - Throws: `VectorDBError` if the operation fails.
    public func searchSimilar(
        userId: String,
        queryVector: [Float],
        topK: Int,
        filter: SearchFilter? = nil
    ) async throws -> [SearchResult] {
        // Validate inputs
        guard !queryVector.isEmpty else {
            throw VectorDBError.invalidVector(reason: "Query vector cannot be empty")
        }

        guard queryVector.allSatisfy({ $0.isFinite }) else {
            throw VectorDBError.invalidVector(reason: "Query vector contains non-finite values")
        }

        guard topK > 0 else {
            throw VectorDBError.invalidVector(reason: "topK must be positive")
        }

        let endpoint = config.baseURL
            .appendingPathComponent("tables")
            .appendingPathComponent(config.tableName)
            .appendingPathComponent("search")

        let requestBody = SearchRequest(
            userId: userId,
            queryVector: queryVector,
            topK: topK,
            filter: filter
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw VectorDBError.encodingError(underlying: error)
        }

        let response: SearchResponse = try await executeRequest(request: request)
        log("Search completed in \(response.searchTimeMs)ms, found \(response.results.count) results")
        return response.results
    }

    /// Store multiple embeddings in a batch operation.
    ///
    /// - Parameter embeddings: Array of embedding records to store.
    /// - Returns: Array of IDs for the stored embeddings.
    /// - Throws: `VectorDBError` if the operation fails.
    @discardableResult
    public func storeBatch(embeddings: [EmbeddingRecord]) async throws -> [String] {
        guard !embeddings.isEmpty else { return [] }

        // Validate all vectors
        for embedding in embeddings {
            guard !embedding.vector.isEmpty else {
                throw VectorDBError.invalidVector(reason: "Embedding vector cannot be empty")
            }
            guard embedding.vector.allSatisfy({ $0.isFinite }) else {
                throw VectorDBError.invalidVector(reason: "Embedding contains non-finite values")
            }
        }

        let endpoint = config.baseURL
            .appendingPathComponent("tables")
            .appendingPathComponent(config.tableName)
            .appendingPathComponent("embeddings/batch")

        let requestBody = BatchStoreRequest(embeddings: embeddings)

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw VectorDBError.encodingError(underlying: error)
        }

        let response: BatchStoreResponse = try await executeRequest(request: request)
        log("Batch stored \(response.insertedIds.count) embeddings")
        return response.insertedIds
    }

    /// Delete an embedding by ID.
    ///
    /// - Parameter id: The ID of the embedding to delete.
    /// - Throws: `VectorDBError` if the operation fails.
    public func deleteEmbedding(id: String) async throws {
        let endpoint = config.baseURL
            .appendingPathComponent("tables")
            .appendingPathComponent(config.tableName)
            .appendingPathComponent("embeddings")
            .appendingPathComponent(id)

        var request = URLRequest(url: endpoint)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        let _: EmptyResponse = try await executeRequest(request: request)
        log("Deleted embedding: \(id)")
    }

    /// Delete all embeddings for a specific user.
    ///
    /// - Parameter userId: The user ID whose embeddings should be deleted.
    /// - Returns: Number of embeddings deleted.
    /// - Throws: `VectorDBError` if the operation fails.
    @discardableResult
    public func deleteUserEmbeddings(userId: String) async throws -> Int {
        let endpoint = config.baseURL
            .appendingPathComponent("tables")
            .appendingPathComponent(config.tableName)
            .appendingPathComponent("embeddings")

        var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: true)
        components?.queryItems = [URLQueryItem(name: "user_id", value: userId)]

        guard let url = components?.url else {
            throw VectorDBError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        let response: DeleteResponse = try await executeRequest(request: request)
        log("Deleted \(response.deletedCount) embeddings for user: \(userId)")
        return response.deletedCount
    }

    /// Get statistics about the vector database table.
    ///
    /// - Returns: Table statistics including row count and dimensions.
    public func getTableStats() async throws -> TableStats {
        let endpoint = config.baseURL
            .appendingPathComponent("tables")
            .appendingPathComponent(config.tableName)
            .appendingPathComponent("stats")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        return try await executeRequest(request: request)
    }

    // MARK: - Private Methods

    /// Execute a request with retry logic.
    private func executeRequest<T: Decodable>(request: URLRequest) async throws -> T {
        var lastError: Error?

        for attempt in 0..<config.maxRetries {
            do {
                return try await performRequest(request: request)
            } catch let error as VectorDBError {
                lastError = error

                switch error {
                case .unauthorized, .invalidURL, .encodingError, .invalidVector:
                    throw error
                default:
                    if attempt < config.maxRetries - 1 {
                        let delay = pow(2.0, Double(attempt))
                        log("Retry attempt \(attempt + 1), waiting \(delay) seconds")
                        try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    }
                }
            } catch {
                lastError = error
                if attempt < config.maxRetries - 1 {
                    let delay = pow(2.0, Double(attempt))
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }

        throw lastError ?? VectorDBError.databaseUnavailable
    }

    /// Perform a single request.
    private func performRequest<T: Decodable>(request: URLRequest) async throws -> T {
        log("Executing request to: \(request.url?.absoluteString ?? "unknown")")

        let (data, response): (Data, URLResponse)

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw VectorDBError.networkError(underlying: error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw VectorDBError.serverError(statusCode: 0, message: "Invalid response type")
        }

        log("Received response with status code: \(httpResponse.statusCode)")

        switch httpResponse.statusCode {
        case 200...299:
            // Handle empty response for DELETE operations
            if data.isEmpty, T.self == EmptyResponse.self {
                return EmptyResponse() as! T
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw VectorDBError.decodingError(underlying: error)
            }
        case 401:
            throw VectorDBError.unauthorized
        case 404:
            let message = String(data: data, encoding: .utf8)
            throw VectorDBError.embeddingNotFound(id: message ?? "unknown")
        case 429:
            throw VectorDBError.quotaExceeded
        case 503:
            throw VectorDBError.databaseUnavailable
        default:
            let message = String(data: data, encoding: .utf8)
            throw VectorDBError.serverError(statusCode: httpResponse.statusCode, message: message)
        }
    }

    /// Log a message if logging is enabled.
    private func log(_ message: String) {
        guard config.enableLogging else { return }
        print("[VectorDBClient] \(message)")
    }
}

// MARK: - Helper Types

private struct EmptyResponse: Codable {
    init() {}
}

private struct DeleteResponse: Codable {
    let deletedCount: Int
}

/// Statistics about a vector database table.
public struct TableStats: Codable, Sendable {
    public let tableName: String
    public let rowCount: Int
    public let vectorDimensions: Int
    public let indexType: String
    public let storageSizeBytes: Int64
    public let lastUpdated: Date
}
