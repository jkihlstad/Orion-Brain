//
//  Neo4jGraphClient.swift
//  Neural Intelligence iOS Edge App
//
//  Singleton client for Neo4j graph database operations.
//  Handles relationship management, node updates, and path queries.
//

import Foundation

// MARK: - Models

/// Represents a path in the graph database.
public struct GraphPath: Codable, Identifiable, Sendable {
    public let id: String
    public let nodes: [GraphNode]
    public let relationships: [GraphRelationship]
    public let totalCost: Double?
    public let length: Int

    public init(
        id: String = UUID().uuidString,
        nodes: [GraphNode],
        relationships: [GraphRelationship],
        totalCost: Double? = nil,
        length: Int
    ) {
        self.id = id
        self.nodes = nodes
        self.relationships = relationships
        self.totalCost = totalCost
        self.length = length
    }
}

/// Represents a node in the graph database.
public struct GraphNode: Codable, Identifiable, Sendable {
    public let id: String
    public let labels: [String]
    public let properties: [String: AnyCodable]
    public let createdAt: Date?
    public let updatedAt: Date?

    public init(
        id: String,
        labels: [String],
        properties: [String: AnyCodable],
        createdAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.labels = labels
        self.properties = properties
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

/// Represents a relationship between nodes in the graph.
public struct GraphRelationship: Codable, Identifiable, Sendable {
    public let id: String
    public let type: String
    public let startNodeId: String
    public let endNodeId: String
    public let properties: [String: AnyCodable]
    public let createdAt: Date?

    public init(
        id: String = UUID().uuidString,
        type: String,
        startNodeId: String,
        endNodeId: String,
        properties: [String: AnyCodable] = [:],
        createdAt: Date? = nil
    ) {
        self.id = id
        self.type = type
        self.startNodeId = startNodeId
        self.endNodeId = endNodeId
        self.properties = properties
        self.createdAt = createdAt
    }
}

/// Type-erased codable wrapper for dynamic property values.
public struct AnyCodable: Codable, Sendable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self.value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            self.value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unable to decode value"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "Unable to encode value of type \(type(of: value))"
                )
            )
        }
    }
}

// MARK: - Errors

/// Errors that can occur during Neo4j graph operations.
public enum Neo4jGraphError: Error, LocalizedError {
    case invalidURL
    case networkError(underlying: Error)
    case serverError(statusCode: Int, message: String?)
    case decodingError(underlying: Error)
    case encodingError(underlying: Error)
    case nodeNotFound(id: String)
    case relationshipNotFound(id: String)
    case pathNotFound(from: String, to: String)
    case constraintViolation(message: String)
    case unauthorized
    case queryError(message: String)
    case transactionFailed(message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid Neo4j server URL configuration"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message ?? "Unknown error")"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Failed to encode request: \(error.localizedDescription)"
        case .nodeNotFound(let id):
            return "Node not found: \(id)"
        case .relationshipNotFound(let id):
            return "Relationship not found: \(id)"
        case .pathNotFound(let from, let to):
            return "No path found from \(from) to \(to)"
        case .constraintViolation(let message):
            return "Constraint violation: \(message)"
        case .unauthorized:
            return "Unauthorized access to Neo4j database"
        case .queryError(let message):
            return "Query error: \(message)"
        case .transactionFailed(let message):
            return "Transaction failed: \(message)"
        }
    }
}

// MARK: - Configuration

/// Configuration for the Neo4j Graph client.
public struct Neo4jGraphConfig: Sendable {
    public let baseURL: URL
    public let username: String
    public let password: String
    public let database: String
    public let timeoutInterval: TimeInterval
    public let maxRetries: Int
    public let enableLogging: Bool

    public static let defaultBaseURL = URL(string: "https://your-neo4j-server.com")!

    public init(
        baseURL: URL = defaultBaseURL,
        username: String = "",
        password: String = "",
        database: String = "neo4j",
        timeoutInterval: TimeInterval = 30.0,
        maxRetries: Int = 3,
        enableLogging: Bool = false
    ) {
        self.baseURL = baseURL
        self.username = username
        self.password = password
        self.database = database
        self.timeoutInterval = timeoutInterval
        self.maxRetries = maxRetries
        self.enableLogging = enableLogging
    }
}

// MARK: - Request/Response Models

private struct CypherRequest: Codable {
    let statements: [CypherStatement]
}

private struct CypherStatement: Codable {
    let statement: String
    let parameters: [String: AnyCodable]?
}

private struct CypherResponse: Codable {
    let results: [CypherResult]
    let errors: [CypherError]
}

private struct CypherResult: Codable {
    let columns: [String]
    let data: [CypherData]
}

private struct CypherData: Codable {
    let row: [AnyCodable]
    let meta: [AnyCodable]?
}

private struct CypherError: Codable {
    let code: String
    let message: String
}

private struct RelationshipRequest: Codable {
    let fromNodeId: String
    let toNodeId: String
    let type: String
    let properties: [String: AnyCodable]?
}

private struct RelationshipResponse: Codable {
    let relationship: GraphRelationship
}

private struct NodeUpdateRequest: Codable {
    let nodeId: String
    let properties: [String: AnyCodable]
}

private struct NodeUpdateResponse: Codable {
    let node: GraphNode
}

private struct PathQueryRequest: Codable {
    let startNodeId: String
    let endNodeId: String
    let maxDepth: Int?
    let relationshipTypes: [String]?
}

private struct PathQueryResponse: Codable {
    let paths: [GraphPath]
}

// MARK: - Neo4jGraphClient

/// Singleton client for Neo4j graph database operations.
///
/// This client handles all graph database operations including node management,
/// relationship creation, and path queries using the Neo4j HTTP API.
///
/// ## Usage
/// ```swift
/// let client = Neo4jGraphClient.shared
/// client.configure(with: Neo4jGraphConfig(
///     username: "neo4j",
///     password: "password"
/// ))
///
/// // Add a relationship
/// try await client.addRelationship(
///     fromUserId: "user1",
///     toUserId: "user2",
///     type: "KNOWS"
/// )
///
/// // Query paths
/// let paths = try await client.queryPath(
///     startNodeId: "user1",
///     endNodeId: "user3"
/// )
/// ```
@MainActor
public final class Neo4jGraphClient: Sendable {

    // MARK: - Singleton

    /// Shared singleton instance.
    public static let shared = Neo4jGraphClient()

    // MARK: - Properties

    private let session: URLSession
    private var config: Neo4jGraphConfig
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    // MARK: - Initialization

    private init() {
        self.config = Neo4jGraphConfig()

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
    public func configure(with config: Neo4jGraphConfig) {
        self.config = config
    }

    // MARK: - Public Methods

    /// Add a relationship between two nodes.
    ///
    /// - Parameters:
    ///   - fromUserId: The ID of the source node.
    ///   - toUserId: The ID of the target node.
    ///   - type: The relationship type (e.g., "KNOWS", "FOLLOWS", "INTERACTED_WITH").
    ///   - properties: Optional properties to attach to the relationship.
    /// - Returns: The created relationship.
    /// - Throws: `Neo4jGraphError` if the operation fails.
    @discardableResult
    public func addRelationship(
        fromUserId: String,
        toUserId: String,
        type: String,
        properties: [String: Any] = [:]
    ) async throws -> GraphRelationship {
        let endpoint = config.baseURL
            .appendingPathComponent("db")
            .appendingPathComponent(config.database)
            .appendingPathComponent("tx/commit")

        // Build Cypher query to create relationship
        let cypher = """
            MATCH (a:User {id: $fromId}), (b:User {id: $toId})
            MERGE (a)-[r:\(type)]->(b)
            SET r += $props, r.createdAt = coalesce(r.createdAt, datetime())
            RETURN r, a.id as startNodeId, b.id as endNodeId
            """

        let parameters: [String: AnyCodable] = [
            "fromId": AnyCodable(fromUserId),
            "toId": AnyCodable(toUserId),
            "props": AnyCodable(properties)
        ]

        let requestBody = CypherRequest(
            statements: [CypherStatement(statement: cypher, parameters: parameters)]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorizationHeader(), forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw Neo4jGraphError.encodingError(underlying: error)
        }

        let response: CypherResponse = try await executeRequest(request: request)

        if !response.errors.isEmpty {
            let errorMessage = response.errors.map { $0.message }.joined(separator: "; ")
            throw Neo4jGraphError.queryError(message: errorMessage)
        }

        // Parse the relationship from the response
        guard let result = response.results.first,
              let data = result.data.first else {
            throw Neo4jGraphError.relationshipNotFound(id: "\(fromUserId)->\(toUserId)")
        }

        log("Created relationship: \(fromUserId) -[\(type)]-> \(toUserId)")

        return GraphRelationship(
            type: type,
            startNodeId: fromUserId,
            endNodeId: toUserId,
            properties: properties.mapValues { AnyCodable($0) }
        )
    }

    /// Update properties on an existing node.
    ///
    /// - Parameters:
    ///   - nodeId: The ID of the node to update.
    ///   - properties: The properties to set or update.
    /// - Returns: The updated node.
    /// - Throws: `Neo4jGraphError` if the operation fails.
    @discardableResult
    public func updateNode(
        nodeId: String,
        properties: [String: Any]
    ) async throws -> GraphNode {
        let endpoint = config.baseURL
            .appendingPathComponent("db")
            .appendingPathComponent(config.database)
            .appendingPathComponent("tx/commit")

        // Build Cypher query to update node
        let cypher = """
            MATCH (n {id: $nodeId})
            SET n += $props, n.updatedAt = datetime()
            RETURN n, labels(n) as labels
            """

        let parameters: [String: AnyCodable] = [
            "nodeId": AnyCodable(nodeId),
            "props": AnyCodable(properties)
        ]

        let requestBody = CypherRequest(
            statements: [CypherStatement(statement: cypher, parameters: parameters)]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorizationHeader(), forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw Neo4jGraphError.encodingError(underlying: error)
        }

        let response: CypherResponse = try await executeRequest(request: request)

        if !response.errors.isEmpty {
            let errorMessage = response.errors.map { $0.message }.joined(separator: "; ")
            if errorMessage.lowercased().contains("not found") {
                throw Neo4jGraphError.nodeNotFound(id: nodeId)
            }
            throw Neo4jGraphError.queryError(message: errorMessage)
        }

        guard let result = response.results.first,
              let data = result.data.first,
              data.row.count >= 2 else {
            throw Neo4jGraphError.nodeNotFound(id: nodeId)
        }

        log("Updated node: \(nodeId)")

        // Parse labels from response
        var labels: [String] = []
        if let labelsValue = data.row[1].value as? [Any] {
            labels = labelsValue.compactMap { $0 as? String }
        }

        return GraphNode(
            id: nodeId,
            labels: labels,
            properties: properties.mapValues { AnyCodable($0) },
            updatedAt: Date()
        )
    }

    /// Query for paths between two nodes.
    ///
    /// - Parameters:
    ///   - startNodeId: The ID of the starting node.
    ///   - endNodeId: The ID of the ending node.
    ///   - maxDepth: Maximum path depth to search (default: 5).
    ///   - relationshipTypes: Optional filter for specific relationship types.
    /// - Returns: Array of paths from start to end node.
    /// - Throws: `Neo4jGraphError` if the operation fails.
    public func queryPath(
        startNodeId: String,
        endNodeId: String,
        maxDepth: Int = 5,
        relationshipTypes: [String]? = nil
    ) async throws -> [GraphPath] {
        let endpoint = config.baseURL
            .appendingPathComponent("db")
            .appendingPathComponent(config.database)
            .appendingPathComponent("tx/commit")

        // Build relationship pattern
        let relPattern: String
        if let types = relationshipTypes, !types.isEmpty {
            relPattern = ":\(types.joined(separator: "|"))"
        } else {
            relPattern = ""
        }

        // Build Cypher query for shortest paths
        let cypher = """
            MATCH (start {id: $startId}), (end {id: $endId})
            MATCH path = allShortestPaths((start)-[\(relPattern)*1..\(maxDepth)]->(end))
            RETURN path, length(path) as pathLength
            ORDER BY pathLength
            LIMIT 10
            """

        let parameters: [String: AnyCodable] = [
            "startId": AnyCodable(startNodeId),
            "endId": AnyCodable(endNodeId)
        ]

        let requestBody = CypherRequest(
            statements: [CypherStatement(statement: cypher, parameters: parameters)]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorizationHeader(), forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw Neo4jGraphError.encodingError(underlying: error)
        }

        let response: CypherResponse = try await executeRequest(request: request)

        if !response.errors.isEmpty {
            let errorMessage = response.errors.map { $0.message }.joined(separator: "; ")
            throw Neo4jGraphError.queryError(message: errorMessage)
        }

        guard let result = response.results.first else {
            return []
        }

        // Parse paths from response
        var paths: [GraphPath] = []
        for data in result.data {
            if let pathLength = data.row.last?.value as? Int {
                paths.append(GraphPath(
                    nodes: [],
                    relationships: [],
                    length: pathLength
                ))
            }
        }

        if paths.isEmpty {
            log("No paths found from \(startNodeId) to \(endNodeId)")
        } else {
            log("Found \(paths.count) paths from \(startNodeId) to \(endNodeId)")
        }

        return paths
    }

    /// Create a new node in the graph.
    ///
    /// - Parameters:
    ///   - id: The unique identifier for the node.
    ///   - labels: The labels to apply to the node.
    ///   - properties: The properties to set on the node.
    /// - Returns: The created node.
    /// - Throws: `Neo4jGraphError` if the operation fails.
    @discardableResult
    public func createNode(
        id: String,
        labels: [String],
        properties: [String: Any]
    ) async throws -> GraphNode {
        let endpoint = config.baseURL
            .appendingPathComponent("db")
            .appendingPathComponent(config.database)
            .appendingPathComponent("tx/commit")

        let labelString = labels.joined(separator: ":")
        let cypher = """
            CREATE (n:\(labelString) {id: $nodeId})
            SET n += $props, n.createdAt = datetime()
            RETURN n
            """

        let parameters: [String: AnyCodable] = [
            "nodeId": AnyCodable(id),
            "props": AnyCodable(properties)
        ]

        let requestBody = CypherRequest(
            statements: [CypherStatement(statement: cypher, parameters: parameters)]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorizationHeader(), forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw Neo4jGraphError.encodingError(underlying: error)
        }

        let response: CypherResponse = try await executeRequest(request: request)

        if !response.errors.isEmpty {
            let errorMessage = response.errors.map { $0.message }.joined(separator: "; ")
            if errorMessage.lowercased().contains("constraint") {
                throw Neo4jGraphError.constraintViolation(message: errorMessage)
            }
            throw Neo4jGraphError.queryError(message: errorMessage)
        }

        log("Created node: \(id) with labels: \(labels)")

        return GraphNode(
            id: id,
            labels: labels,
            properties: properties.mapValues { AnyCodable($0) },
            createdAt: Date()
        )
    }

    /// Delete a node and its relationships.
    ///
    /// - Parameter nodeId: The ID of the node to delete.
    /// - Throws: `Neo4jGraphError` if the operation fails.
    public func deleteNode(nodeId: String) async throws {
        let endpoint = config.baseURL
            .appendingPathComponent("db")
            .appendingPathComponent(config.database)
            .appendingPathComponent("tx/commit")

        let cypher = """
            MATCH (n {id: $nodeId})
            DETACH DELETE n
            """

        let parameters: [String: AnyCodable] = [
            "nodeId": AnyCodable(nodeId)
        ]

        let requestBody = CypherRequest(
            statements: [CypherStatement(statement: cypher, parameters: parameters)]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorizationHeader(), forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw Neo4jGraphError.encodingError(underlying: error)
        }

        let response: CypherResponse = try await executeRequest(request: request)

        if !response.errors.isEmpty {
            let errorMessage = response.errors.map { $0.message }.joined(separator: "; ")
            throw Neo4jGraphError.queryError(message: errorMessage)
        }

        log("Deleted node: \(nodeId)")
    }

    /// Execute a custom Cypher query.
    ///
    /// - Parameters:
    ///   - cypher: The Cypher query to execute.
    ///   - parameters: Query parameters.
    /// - Returns: The raw Cypher response.
    /// - Throws: `Neo4jGraphError` if the operation fails.
    public func executeQuery(
        cypher: String,
        parameters: [String: Any] = [:]
    ) async throws -> CypherResponse {
        let endpoint = config.baseURL
            .appendingPathComponent("db")
            .appendingPathComponent(config.database)
            .appendingPathComponent("tx/commit")

        let requestBody = CypherRequest(
            statements: [CypherStatement(
                statement: cypher,
                parameters: parameters.mapValues { AnyCodable($0) }
            )]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(authorizationHeader(), forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(requestBody)
        } catch {
            throw Neo4jGraphError.encodingError(underlying: error)
        }

        return try await executeRequest(request: request)
    }

    // MARK: - Private Methods

    /// Generate the Basic Auth authorization header.
    private func authorizationHeader() -> String {
        let credentials = "\(config.username):\(config.password)"
        let data = credentials.data(using: .utf8)!
        return "Basic \(data.base64EncodedString())"
    }

    /// Execute a request with retry logic.
    private func executeRequest<T: Decodable>(request: URLRequest) async throws -> T {
        var lastError: Error?

        for attempt in 0..<config.maxRetries {
            do {
                return try await performRequest(request: request)
            } catch let error as Neo4jGraphError {
                lastError = error

                switch error {
                case .unauthorized, .invalidURL, .encodingError, .constraintViolation:
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

        throw lastError ?? Neo4jGraphError.serverError(statusCode: 0, message: "Unknown error")
    }

    /// Perform a single request.
    private func performRequest<T: Decodable>(request: URLRequest) async throws -> T {
        log("Executing request to: \(request.url?.absoluteString ?? "unknown")")

        let (data, response): (Data, URLResponse)

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Neo4jGraphError.networkError(underlying: error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw Neo4jGraphError.serverError(statusCode: 0, message: "Invalid response type")
        }

        log("Received response with status code: \(httpResponse.statusCode)")

        switch httpResponse.statusCode {
        case 200...299:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw Neo4jGraphError.decodingError(underlying: error)
            }
        case 401:
            throw Neo4jGraphError.unauthorized
        default:
            let message = String(data: data, encoding: .utf8)
            throw Neo4jGraphError.serverError(statusCode: httpResponse.statusCode, message: message)
        }
    }

    /// Log a message if logging is enabled.
    private func log(_ message: String) {
        guard config.enableLogging else { return }
        print("[Neo4jGraphClient] \(message)")
    }
}
