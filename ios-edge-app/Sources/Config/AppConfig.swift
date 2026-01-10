import Foundation

/// Application configuration for Neural Edge iOS app.
/// Configure these values for your deployment environment.
enum AppConfig {

    // MARK: - API Endpoints

    /// Base URL for the LangGraph neural processing server
    static let langGraphBaseURL: URL = {
        #if DEBUG
        return URL(string: "http://localhost:3000/v1/brain")!
        #else
        return URL(string: "https://api.your-domain.com/v1/brain")!
        #endif
    }()

    /// Base URL for LanceDB vector storage API
    static let lanceDBBaseURL: URL = {
        #if DEBUG
        return URL(string: "http://localhost:3000/v1/brain/embeddings")!
        #else
        return URL(string: "https://api.your-domain.com/v1/brain/embeddings")!
        #endif
    }()

    /// Base URL for Neo4j graph API
    static let neo4jBaseURL: URL = {
        #if DEBUG
        return URL(string: "http://localhost:3000/v1/brain/graph")!
        #else
        return URL(string: "https://api.your-domain.com/v1/brain/graph")!
        #endif
    }()

    // MARK: - Background Task Identifiers

    /// Background task identifier for neural uploads
    static let neuralUploaderTaskId = "com.orion.neuraledge.neuralUploader"

    /// Background task identifier for embedding sync
    static let embeddingSyncTaskId = "com.orion.neuraledge.embeddingSync"

    // MARK: - Timeouts & Limits

    /// Network request timeout in seconds
    static let networkTimeout: TimeInterval = 30

    /// Maximum retry attempts for failed requests
    static let maxRetryAttempts = 3

    /// Delay between retry attempts in seconds
    static let retryDelay: TimeInterval = 2

    /// Maximum number of queued tasks before forced sync
    static let maxQueuedTasks = 50

    // MARK: - Media Settings

    /// Audio recording sample rate
    static let audioSampleRate: Double = 44_100

    /// Audio recording quality
    static let audioQuality: Int = 127 // AVAudioQuality.max

    /// Video recording quality preset
    static let videoQuality = "high"

    /// Maximum recording duration in seconds (0 = unlimited)
    static let maxRecordingDuration: TimeInterval = 0

    // MARK: - Storage

    /// User defaults suite name for app data
    static let userDefaultsSuite = "com.orion.neuraledge"

    /// Key for storing queued tasks in UserDefaults
    static let queuedTasksKey = "queuedNeuralTasks"

    /// Key for storing last sync timestamp
    static let lastSyncKey = "lastSyncTimestamp"
}
