//
//  LLMOrchestrationAgent.swift
//  Neural Intelligence iOS Edge App
//
//  Singleton class for communicating with the LangGraph server.
//  Handles task submission, result retrieval, and retry logic.
//

import Foundation

// MARK: - Models

/// Represents a neural task to be processed by the LangGraph server.
public struct NeuralTask: Codable, Identifiable, Sendable {
    public let id: UUID
    public let type: TaskType
    public let payload: Data
    public let metadata: [String: String]
    public let createdAt: Date
    public let priority: TaskPriority

    public enum TaskType: String, Codable, Sendable {
        case audioTranscription
        case videoAnalysis
        case textGeneration
        case embeddingGeneration
        case graphUpdate
        case multiModal
    }

    public enum TaskPriority: Int, Codable, Sendable, Comparable {
        case low = 0
        case normal = 1
        case high = 2
        case critical = 3

        public static func < (lhs: TaskPriority, rhs: TaskPriority) -> Bool {
            lhs.rawValue < rhs.rawValue
        }
    }

    public init(
        id: UUID = UUID(),
        type: TaskType,
        payload: Data,
        metadata: [String: String] = [:],
        createdAt: Date = Date(),
        priority: TaskPriority = .normal
    ) {
        self.id = id
        self.type = type
        self.payload = payload
        self.metadata = metadata
        self.createdAt = createdAt
        self.priority = priority
    }
}

/// Represents the result of a processed neural task.
public struct TaskResult: Codable, Sendable {
    public let taskId: UUID
    public let status: ResultStatus
    public let data: Data?
    public let message: String?
    public let processedAt: Date
    public let metrics: ProcessingMetrics?

    public enum ResultStatus: String, Codable, Sendable {
        case success
        case partialSuccess
        case failed
        case timeout
        case cancelled
    }

    public struct ProcessingMetrics: Codable, Sendable {
        public let processingTimeMs: Int
        public let tokensUsed: Int?
        public let modelVersion: String?
    }
}

// MARK: - Errors

/// Errors that can occur during LLM orchestration operations.
public enum LLMOrchestrationError: Error, LocalizedError {
    case invalidURL
    case networkError(underlying: Error)
    case serverError(statusCode: Int, message: String?)
    case decodingError(underlying: Error)
    case encodingError(underlying: Error)
    case timeout
    case maxRetriesExceeded
    case unauthorized
    case rateLimited(retryAfter: TimeInterval?)
    case taskNotFound
    case invalidResponse

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL configuration"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message ?? "Unknown error")"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Failed to encode request: \(error.localizedDescription)"
        case .timeout:
            return "Request timed out"
        case .maxRetriesExceeded:
            return "Maximum retry attempts exceeded"
        case .unauthorized:
            return "Unauthorized access - check API credentials"
        case .rateLimited(let retryAfter):
            if let seconds = retryAfter {
                return "Rate limited - retry after \(Int(seconds)) seconds"
            }
            return "Rate limited - please try again later"
        case .taskNotFound:
            return "Task not found on server"
        case .invalidResponse:
            return "Invalid response from server"
        }
    }
}

// MARK: - Configuration

/// Configuration for the LLM Orchestration Agent.
public struct LLMOrchestrationConfig: Sendable {
    public let baseURL: URL
    public let apiKey: String
    public let timeoutInterval: TimeInterval
    public let maxRetries: Int
    public let retryDelayBase: TimeInterval
    public let enableLogging: Bool

    public static let defaultBaseURL = URL(string: "https://your-langgraph-server.com/v1/brain")!

    public init(
        baseURL: URL = defaultBaseURL,
        apiKey: String = "",
        timeoutInterval: TimeInterval = 30.0,
        maxRetries: Int = 3,
        retryDelayBase: TimeInterval = 1.0,
        enableLogging: Bool = false
    ) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.timeoutInterval = timeoutInterval
        self.maxRetries = maxRetries
        self.retryDelayBase = retryDelayBase
        self.enableLogging = enableLogging
    }
}

// MARK: - LLMOrchestrationAgent

/// Singleton class for communicating with the LangGraph server.
///
/// This agent handles all communication with the LangGraph-based LLM orchestration
/// server, including task submission, result retrieval, and automatic retry logic.
///
/// ## Usage
/// ```swift
/// let agent = LLMOrchestrationAgent.shared
/// agent.configure(with: LLMOrchestrationConfig(apiKey: "your-api-key"))
///
/// let task = NeuralTask(type: .textGeneration, payload: myData)
/// let result = try await agent.sendTask(task: task)
/// ```
@MainActor
public final class LLMOrchestrationAgent: Sendable {

    // MARK: - Singleton

    /// Shared singleton instance.
    public static let shared = LLMOrchestrationAgent()

    // MARK: - Properties

    private let session: URLSession
    private var config: LLMOrchestrationConfig
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    // MARK: - Initialization

    private init() {
        self.config = LLMOrchestrationConfig()

        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = config.timeoutInterval
        sessionConfig.timeoutIntervalForResource = config.timeoutInterval * 2
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

    /// Configure the agent with custom settings.
    /// - Parameter config: The configuration to apply.
    public func configure(with config: LLMOrchestrationConfig) {
        self.config = config
    }

    /// Update the API key.
    /// - Parameter apiKey: The new API key to use.
    public func updateAPIKey(_ apiKey: String) {
        self.config = LLMOrchestrationConfig(
            baseURL: config.baseURL,
            apiKey: apiKey,
            timeoutInterval: config.timeoutInterval,
            maxRetries: config.maxRetries,
            retryDelayBase: config.retryDelayBase,
            enableLogging: config.enableLogging
        )
    }

    // MARK: - Public Methods

    /// Send a neural task to the LangGraph server for processing.
    ///
    /// This method handles automatic retries with exponential backoff for transient failures.
    ///
    /// - Parameter task: The neural task to process.
    /// - Returns: The result of the task processing.
    /// - Throws: `LLMOrchestrationError` if the request fails after all retries.
    public func sendTask(task: NeuralTask) async throws -> TaskResult {
        let endpoint = config.baseURL.appendingPathComponent("tasks")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(task.id.uuidString, forHTTPHeaderField: "X-Request-ID")

        do {
            request.httpBody = try encoder.encode(task)
        } catch {
            throw LLMOrchestrationError.encodingError(underlying: error)
        }

        return try await executeWithRetry(request: request)
    }

    /// Check the status of a previously submitted task.
    ///
    /// - Parameter taskId: The ID of the task to check.
    /// - Returns: The current result/status of the task.
    /// - Throws: `LLMOrchestrationError` if the request fails.
    public func checkTaskStatus(taskId: UUID) async throws -> TaskResult {
        let endpoint = config.baseURL.appendingPathComponent("tasks/\(taskId.uuidString)")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        return try await executeWithRetry(request: request)
    }

    /// Cancel a pending or in-progress task.
    ///
    /// - Parameter taskId: The ID of the task to cancel.
    /// - Throws: `LLMOrchestrationError` if the request fails.
    public func cancelTask(taskId: UUID) async throws {
        let endpoint = config.baseURL.appendingPathComponent("tasks/\(taskId.uuidString)/cancel")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        let _: TaskResult = try await executeWithRetry(request: request)
    }

    /// Send multiple tasks in a batch for efficient processing.
    ///
    /// - Parameter tasks: Array of neural tasks to process.
    /// - Returns: Array of task results in the same order as input.
    /// - Throws: `LLMOrchestrationError` if the request fails.
    public func sendBatchTasks(tasks: [NeuralTask]) async throws -> [TaskResult] {
        let endpoint = config.baseURL.appendingPathComponent("tasks/batch")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try encoder.encode(tasks)
        } catch {
            throw LLMOrchestrationError.encodingError(underlying: error)
        }

        return try await executeWithRetry(request: request)
    }

    /// Check if the server is healthy and accepting requests.
    ///
    /// - Returns: `true` if the server is healthy, `false` otherwise.
    public func healthCheck() async -> Bool {
        let endpoint = config.baseURL.appendingPathComponent("health")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        request.timeoutInterval = 5.0

        do {
            let (_, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else { return false }
            return httpResponse.statusCode == 200
        } catch {
            log("Health check failed: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Private Methods

    /// Execute a request with automatic retry logic.
    private func executeWithRetry<T: Decodable>(request: URLRequest) async throws -> T {
        var lastError: Error?

        for attempt in 0..<config.maxRetries {
            do {
                return try await executeRequest(request: request)
            } catch let error as LLMOrchestrationError {
                lastError = error

                // Don't retry certain errors
                switch error {
                case .unauthorized, .invalidURL, .encodingError, .taskNotFound:
                    throw error
                case .rateLimited(let retryAfter):
                    if let delay = retryAfter {
                        log("Rate limited, waiting \(delay) seconds...")
                        try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    } else {
                        try await exponentialBackoff(attempt: attempt)
                    }
                default:
                    try await exponentialBackoff(attempt: attempt)
                }

                log("Retry attempt \(attempt + 1) of \(config.maxRetries)")
            } catch {
                lastError = error
                try await exponentialBackoff(attempt: attempt)
                log("Retry attempt \(attempt + 1) of \(config.maxRetries)")
            }
        }

        throw LLMOrchestrationError.maxRetriesExceeded
    }

    /// Execute a single request.
    private func executeRequest<T: Decodable>(request: URLRequest) async throws -> T {
        log("Executing request to: \(request.url?.absoluteString ?? "unknown")")

        let (data, response): (Data, URLResponse)

        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            if error.code == .timedOut {
                throw LLMOrchestrationError.timeout
            }
            throw LLMOrchestrationError.networkError(underlying: error)
        } catch {
            throw LLMOrchestrationError.networkError(underlying: error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw LLMOrchestrationError.invalidResponse
        }

        log("Received response with status code: \(httpResponse.statusCode)")

        switch httpResponse.statusCode {
        case 200...299:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw LLMOrchestrationError.decodingError(underlying: error)
            }
        case 401:
            throw LLMOrchestrationError.unauthorized
        case 404:
            throw LLMOrchestrationError.taskNotFound
        case 429:
            let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After")
                .flatMap { Double($0) }
            throw LLMOrchestrationError.rateLimited(retryAfter: retryAfter)
        default:
            let message = String(data: data, encoding: .utf8)
            throw LLMOrchestrationError.serverError(statusCode: httpResponse.statusCode, message: message)
        }
    }

    /// Calculate exponential backoff delay and wait.
    private func exponentialBackoff(attempt: Int) async throws {
        let delay = config.retryDelayBase * pow(2.0, Double(attempt))
        let jitter = Double.random(in: 0...0.5) * delay
        let totalDelay = delay + jitter

        log("Backing off for \(totalDelay) seconds")
        try await Task.sleep(nanoseconds: UInt64(totalDelay * 1_000_000_000))
    }

    /// Log a message if logging is enabled.
    private func log(_ message: String) {
        guard config.enableLogging else { return }
        print("[LLMOrchestrationAgent] \(message)")
    }
}
