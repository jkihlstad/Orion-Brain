//
//  NeuralTask.swift
//  Neural Intelligence iOS Edge App
//
//  Core task models for neural processing operations on the edge device.
//  These models represent tasks that can be queued, processed, and completed
//  by the on-device neural engine.
//
//  Copyright (c) 2024 Neural Intelligence. All rights reserved.
//

import Foundation

// MARK: - MediaType

/// Represents the type of media being processed by a neural task.
///
/// Media types determine the appropriate processing pipeline and model
/// to use for inference operations.
public enum MediaType: String, Codable, CaseIterable, Sendable {
    /// Audio content (e.g., speech, music, environmental sounds).
    case audio

    /// Video content (e.g., recorded clips, live streams).
    case video

    /// Static image content (e.g., photos, screenshots).
    case image

    /// Text content (e.g., documents, transcriptions).
    case text

    /// Returns the file extensions commonly associated with this media type.
    public var commonExtensions: [String] {
        switch self {
        case .audio:
            return ["mp3", "wav", "m4a", "aac", "flac", "ogg"]
        case .video:
            return ["mp4", "mov", "m4v", "avi", "mkv", "webm"]
        case .image:
            return ["jpg", "jpeg", "png", "heic", "webp", "gif", "tiff"]
        case .text:
            return ["txt", "json", "xml", "csv", "md"]
        }
    }

    /// Returns the MIME type prefix for this media type.
    public var mimeTypePrefix: String {
        switch self {
        case .audio:
            return "audio/"
        case .video:
            return "video/"
        case .image:
            return "image/"
        case .text:
            return "text/"
        }
    }
}

// MARK: - ProcessingStatus

/// Represents the current processing status of a neural task.
///
/// Tasks transition through these states during their lifecycle:
/// `queued` -> `processing` -> `completed` or `failed`
public enum ProcessingStatus: String, Codable, CaseIterable, Sendable {
    /// Task is waiting in the queue to be processed.
    case queued

    /// Task is currently being processed by the neural engine.
    case processing

    /// Task has been successfully completed.
    case completed

    /// Task processing failed due to an error.
    case failed

    /// Returns `true` if the task is in a terminal state (completed or failed).
    public var isTerminal: Bool {
        self == .completed || self == .failed
    }

    /// Returns `true` if the task is still active (queued or processing).
    public var isActive: Bool {
        !isTerminal
    }
}

// MARK: - NeuralTask

/// Represents a neural processing task to be executed on the edge device.
///
/// A `NeuralTask` encapsulates all information needed to perform a neural
/// inference operation, including the task type, input payload, and any
/// configuration parameters.
///
/// Example usage:
/// ```swift
/// let task = NeuralTask(
///     taskId: UUID().uuidString,
///     taskType: "image_classification",
///     payload: [
///         "modelId": AnyCodable("mobilenet_v3"),
///         "imagePath": AnyCodable("/path/to/image.jpg"),
///         "topK": AnyCodable(5)
///     ]
/// )
/// ```
public struct NeuralTask: Codable, Identifiable, Equatable, Sendable {

    // MARK: - Properties

    /// Unique identifier for this task.
    public let taskId: String

    /// The type of neural processing task to perform.
    ///
    /// Common task types include:
    /// - `image_classification`: Classify images into categories
    /// - `object_detection`: Detect and locate objects in images
    /// - `speech_recognition`: Convert speech to text
    /// - `text_generation`: Generate text based on prompts
    /// - `embedding_generation`: Generate vector embeddings
    public let taskType: String

    /// The input payload containing task-specific parameters.
    ///
    /// The structure of the payload depends on the `taskType`. Use `AnyCodable`
    /// to handle heterogeneous data types in the payload.
    public let payload: [String: AnyCodable]

    /// The current processing status of the task.
    public var status: ProcessingStatus

    /// The media type associated with this task, if applicable.
    public var mediaType: MediaType?

    /// Priority level for task scheduling (higher values = higher priority).
    public var priority: Int

    /// Timestamp when the task was created.
    public let createdAt: Date

    /// Timestamp when processing started, if applicable.
    public var processingStartedAt: Date?

    /// Timestamp when processing completed, if applicable.
    public var completedAt: Date?

    // MARK: - Identifiable

    public var id: String { taskId }

    // MARK: - Initialization

    /// Creates a new neural task.
    ///
    /// - Parameters:
    ///   - taskId: Unique identifier for the task. Defaults to a new UUID.
    ///   - taskType: The type of neural processing task.
    ///   - payload: The input payload with task-specific parameters.
    ///   - status: Initial processing status. Defaults to `.queued`.
    ///   - mediaType: The media type, if applicable. Defaults to `nil`.
    ///   - priority: Task priority level. Defaults to `0`.
    ///   - createdAt: Creation timestamp. Defaults to current date.
    public init(
        taskId: String = UUID().uuidString,
        taskType: String,
        payload: [String: AnyCodable],
        status: ProcessingStatus = .queued,
        mediaType: MediaType? = nil,
        priority: Int = 0,
        createdAt: Date = Date()
    ) {
        self.taskId = taskId
        self.taskType = taskType
        self.payload = payload
        self.status = status
        self.mediaType = mediaType
        self.priority = priority
        self.createdAt = createdAt
    }

    // MARK: - Coding Keys

    private enum CodingKeys: String, CodingKey {
        case taskId = "task_id"
        case taskType = "task_type"
        case payload
        case status
        case mediaType = "media_type"
        case priority
        case createdAt = "created_at"
        case processingStartedAt = "processing_started_at"
        case completedAt = "completed_at"
    }
}

// MARK: - TaskResult

/// Represents the result of a completed neural task.
///
/// A `TaskResult` contains the output from neural processing, including
/// any computed values, predictions, or error information if the task failed.
///
/// Example usage:
/// ```swift
/// let result = TaskResult(
///     success: true,
///     output: [
///         "predictions": AnyCodable([
///             ["label": "cat", "confidence": 0.95],
///             ["label": "dog", "confidence": 0.03]
///         ]),
///         "processingTimeMs": AnyCodable(42)
///     ]
/// )
/// ```
public struct TaskResult: Codable, Equatable, Sendable {

    // MARK: - Properties

    /// Indicates whether the task completed successfully.
    public let success: Bool

    /// The output payload containing task results.
    ///
    /// This is `nil` if the task failed. The structure of the output
    /// depends on the task type.
    public let output: [String: AnyCodable]?

    /// Error message if the task failed.
    ///
    /// This is `nil` if the task succeeded.
    public let error: String?

    /// Error code for programmatic error handling.
    public let errorCode: String?

    /// The task ID this result corresponds to.
    public let taskId: String?

    /// Processing duration in milliseconds.
    public let processingDurationMs: Int?

    // MARK: - Initialization

    /// Creates a new task result.
    ///
    /// - Parameters:
    ///   - success: Whether the task completed successfully.
    ///   - output: The output payload, if successful.
    ///   - error: Error message, if failed.
    ///   - errorCode: Error code for programmatic handling.
    ///   - taskId: The associated task ID.
    ///   - processingDurationMs: Processing time in milliseconds.
    public init(
        success: Bool,
        output: [String: AnyCodable]? = nil,
        error: String? = nil,
        errorCode: String? = nil,
        taskId: String? = nil,
        processingDurationMs: Int? = nil
    ) {
        self.success = success
        self.output = output
        self.error = error
        self.errorCode = errorCode
        self.taskId = taskId
        self.processingDurationMs = processingDurationMs
    }

    // MARK: - Factory Methods

    /// Creates a successful task result.
    ///
    /// - Parameters:
    ///   - output: The output payload.
    ///   - taskId: The associated task ID.
    ///   - processingDurationMs: Processing time in milliseconds.
    /// - Returns: A successful `TaskResult`.
    public static func success(
        output: [String: AnyCodable],
        taskId: String? = nil,
        processingDurationMs: Int? = nil
    ) -> TaskResult {
        TaskResult(
            success: true,
            output: output,
            taskId: taskId,
            processingDurationMs: processingDurationMs
        )
    }

    /// Creates a failed task result.
    ///
    /// - Parameters:
    ///   - error: The error message.
    ///   - errorCode: The error code.
    ///   - taskId: The associated task ID.
    /// - Returns: A failed `TaskResult`.
    public static func failure(
        error: String,
        errorCode: String? = nil,
        taskId: String? = nil
    ) -> TaskResult {
        TaskResult(
            success: false,
            error: error,
            errorCode: errorCode,
            taskId: taskId
        )
    }

    // MARK: - Coding Keys

    private enum CodingKeys: String, CodingKey {
        case success
        case output
        case error
        case errorCode = "error_code"
        case taskId = "task_id"
        case processingDurationMs = "processing_duration_ms"
    }
}

// MARK: - NeuralTask Extensions

extension NeuralTask {

    /// Returns a copy of the task with updated status.
    ///
    /// - Parameter newStatus: The new processing status.
    /// - Returns: A new `NeuralTask` with the updated status.
    public func withStatus(_ newStatus: ProcessingStatus) -> NeuralTask {
        var task = self
        task.status = newStatus

        switch newStatus {
        case .processing:
            task.processingStartedAt = Date()
        case .completed, .failed:
            task.completedAt = Date()
        default:
            break
        }

        return task
    }

    /// Retrieves a value from the payload.
    ///
    /// - Parameter key: The payload key.
    /// - Returns: The value if present and of the expected type.
    public func payloadValue<T>(forKey key: String) -> T? {
        payload[key]?.value as? T
    }

    /// The elapsed time since the task was created.
    public var elapsedTime: TimeInterval {
        Date().timeIntervalSince(createdAt)
    }

    /// The processing duration, if available.
    public var processingDuration: TimeInterval? {
        guard let startedAt = processingStartedAt else { return nil }
        let endTime = completedAt ?? Date()
        return endTime.timeIntervalSince(startedAt)
    }
}

// MARK: - CustomStringConvertible

extension NeuralTask: CustomStringConvertible {
    public var description: String {
        "NeuralTask(id: \(taskId), type: \(taskType), status: \(status.rawValue))"
    }
}

extension TaskResult: CustomStringConvertible {
    public var description: String {
        if success {
            return "TaskResult(success: true, outputKeys: \(output?.keys.sorted() ?? []))"
        } else {
            return "TaskResult(success: false, error: \(error ?? "unknown"))"
        }
    }
}
