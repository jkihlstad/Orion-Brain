//
//  LocalNeuralTaskQueue.swift
//  Neural Intelligence iOS Edge App
//
//  Thread-safe queue for pending neural tasks with persistent storage.
//  Ensures tasks survive app restarts using file-based persistence.
//

import Foundation
import os.log

// MARK: - Queue Statistics

/// Statistics about the neural task queue.
public struct QueueStatistics: Sendable {
    public let totalCount: Int
    public let byType: [NeuralTask.TaskType: Int]
    public let byPriority: [NeuralTask.TaskPriority: Int]
    public let oldestTaskDate: Date?
    public let newestTaskDate: Date?
    public let estimatedSizeBytes: Int

    public init(
        totalCount: Int,
        byType: [NeuralTask.TaskType: Int],
        byPriority: [NeuralTask.TaskPriority: Int],
        oldestTaskDate: Date?,
        newestTaskDate: Date?,
        estimatedSizeBytes: Int
    ) {
        self.totalCount = totalCount
        self.byType = byType
        self.byPriority = byPriority
        self.oldestTaskDate = oldestTaskDate
        self.newestTaskDate = newestTaskDate
        self.estimatedSizeBytes = estimatedSizeBytes
    }
}

// MARK: - Queue Errors

/// Errors that can occur during queue operations.
public enum QueueError: Error, LocalizedError {
    case persistenceError(underlying: Error)
    case encodingError(underlying: Error)
    case decodingError(underlying: Error)
    case queueFull(maxCapacity: Int)
    case taskNotFound(id: UUID)

    public var errorDescription: String? {
        switch self {
        case .persistenceError(let error):
            return "Failed to persist queue: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Failed to encode task: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Failed to decode task: \(error.localizedDescription)"
        case .queueFull(let max):
            return "Queue is full (max capacity: \(max))"
        case .taskNotFound(let id):
            return "Task not found: \(id)"
        }
    }
}

// MARK: - LocalNeuralTaskQueue

/// Thread-safe queue for pending neural tasks with persistent storage.
///
/// This class provides a reliable queue for neural tasks that need to be processed.
/// Tasks are persisted to disk to survive app restarts and are processed in
/// priority order (higher priority first, then by creation date).
///
/// ## Features
/// - Thread-safe operations using Swift actors
/// - File-based persistence for app restart survival
/// - Priority-based ordering
/// - Automatic cleanup of old tasks
/// - Queue statistics and monitoring
///
/// ## Usage
/// ```swift
/// let queue = LocalNeuralTaskQueue.shared
///
/// // Add a task
/// queue.enqueue(task: myNeuralTask)
///
/// // Get all tasks for processing
/// let tasks = queue.dequeueAll()
///
/// // Check queue status
/// let count = queue.count
/// ```
@MainActor
public final class LocalNeuralTaskQueue: Sendable {

    // MARK: - Singleton

    /// Shared singleton instance.
    public static let shared = LocalNeuralTaskQueue()

    // MARK: - Properties

    private let logger = Logger(subsystem: "com.neuralintelligence.edge", category: "TaskQueue")
    private var tasks: [NeuralTask] = []
    private let lock = NSLock()
    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    /// Maximum number of tasks allowed in the queue.
    public let maxCapacity: Int = 1000

    /// Maximum age for tasks before automatic cleanup (7 days).
    public let maxTaskAge: TimeInterval = 7 * 24 * 60 * 60

    // MARK: - Initialization

    private init() {
        // Set up file storage
        let fileManager = FileManager.default
        let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let queueDirectory = documentsPath.appendingPathComponent("NeuralTaskQueue", isDirectory: true)

        // Create directory if needed
        if !fileManager.fileExists(atPath: queueDirectory.path) {
            try? fileManager.createDirectory(at: queueDirectory, withIntermediateDirectories: true)
        }

        self.fileURL = queueDirectory.appendingPathComponent("pending_tasks.json")

        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        // Load existing tasks
        loadFromDisk()

        // Clean up old tasks
        cleanupOldTasks()

        logger.info("LocalNeuralTaskQueue initialized with \(self.tasks.count) tasks")
    }

    // MARK: - Queue Operations

    /// Add a task to the queue.
    ///
    /// - Parameter task: The neural task to enqueue.
    /// - Note: Tasks are automatically sorted by priority and creation date.
    public func enqueue(task: NeuralTask) {
        lock.lock()
        defer { lock.unlock() }

        // Check capacity
        guard tasks.count < maxCapacity else {
            logger.warning("Queue is full - cannot enqueue task \(task.id)")
            // Remove lowest priority oldest task to make room
            if let indexToRemove = tasks.indices.last {
                let removed = tasks.remove(at: indexToRemove)
                logger.info("Removed oldest low-priority task \(removed.id) to make room")
            }
        }

        // Check for duplicate
        if tasks.contains(where: { $0.id == task.id }) {
            logger.debug("Task \(task.id) already in queue - skipping")
            return
        }

        tasks.append(task)
        sortTasks()
        saveToDisk()

        logger.info("Enqueued task \(task.id) (type: \(task.type.rawValue), priority: \(task.priority.rawValue))")
    }

    /// Add multiple tasks to the queue.
    ///
    /// - Parameter newTasks: Array of neural tasks to enqueue.
    public func enqueue(tasks newTasks: [NeuralTask]) {
        lock.lock()
        defer { lock.unlock() }

        for task in newTasks {
            if !tasks.contains(where: { $0.id == task.id }) {
                tasks.append(task)
            }
        }

        // Trim if over capacity
        while tasks.count > maxCapacity {
            tasks.removeLast()
        }

        sortTasks()
        saveToDisk()

        logger.info("Enqueued \(newTasks.count) tasks")
    }

    /// Remove and return all tasks from the queue.
    ///
    /// - Returns: Array of all queued tasks, sorted by priority.
    public func dequeueAll() -> [NeuralTask] {
        lock.lock()
        defer { lock.unlock() }

        let allTasks = tasks
        tasks.removeAll()
        saveToDisk()

        logger.info("Dequeued all \(allTasks.count) tasks")
        return allTasks
    }

    /// Remove and return the highest priority task.
    ///
    /// - Returns: The highest priority task, or nil if queue is empty.
    public func dequeueNext() -> NeuralTask? {
        lock.lock()
        defer { lock.unlock() }

        guard !tasks.isEmpty else { return nil }

        let task = tasks.removeFirst()
        saveToDisk()

        logger.info("Dequeued task \(task.id)")
        return task
    }

    /// Remove and return up to N tasks.
    ///
    /// - Parameter count: Maximum number of tasks to dequeue.
    /// - Returns: Array of dequeued tasks.
    public func dequeue(count: Int) -> [NeuralTask] {
        lock.lock()
        defer { lock.unlock() }

        let dequeueCount = min(count, tasks.count)
        let dequeuedTasks = Array(tasks.prefix(dequeueCount))
        tasks.removeFirst(dequeueCount)
        saveToDisk()

        logger.info("Dequeued \(dequeuedTasks.count) tasks")
        return dequeuedTasks
    }

    /// Peek at tasks without removing them.
    ///
    /// - Parameter count: Maximum number of tasks to peek.
    /// - Returns: Array of tasks (not removed from queue).
    public func peek(count: Int = 1) -> [NeuralTask] {
        lock.lock()
        defer { lock.unlock() }

        return Array(tasks.prefix(count))
    }

    /// Remove a specific task from the queue.
    ///
    /// - Parameter taskId: The ID of the task to remove.
    /// - Returns: The removed task, or nil if not found.
    @discardableResult
    public func remove(taskId: UUID) -> NeuralTask? {
        lock.lock()
        defer { lock.unlock() }

        guard let index = tasks.firstIndex(where: { $0.id == taskId }) else {
            return nil
        }

        let task = tasks.remove(at: index)
        saveToDisk()

        logger.info("Removed task \(taskId)")
        return task
    }

    /// Check if a task exists in the queue.
    ///
    /// - Parameter taskId: The ID of the task to check.
    /// - Returns: True if the task exists in the queue.
    public func contains(taskId: UUID) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        return tasks.contains { $0.id == taskId }
    }

    /// Clear all tasks from the queue.
    public func clear() {
        lock.lock()
        defer { lock.unlock() }

        let count = tasks.count
        tasks.removeAll()
        saveToDisk()

        logger.info("Cleared \(count) tasks from queue")
    }

    // MARK: - Properties

    /// Number of tasks in the queue.
    public var count: Int {
        lock.lock()
        defer { lock.unlock() }

        return tasks.count
    }

    /// Whether the queue is empty.
    public var isEmpty: Bool {
        lock.lock()
        defer { lock.unlock() }

        return tasks.isEmpty
    }

    /// Whether the queue is at capacity.
    public var isFull: Bool {
        lock.lock()
        defer { lock.unlock() }

        return tasks.count >= maxCapacity
    }

    // MARK: - Statistics

    /// Get statistics about the queue.
    ///
    /// - Returns: Queue statistics including counts by type and priority.
    public func getStatistics() -> QueueStatistics {
        lock.lock()
        defer { lock.unlock() }

        var byType: [NeuralTask.TaskType: Int] = [:]
        var byPriority: [NeuralTask.TaskPriority: Int] = [:]

        for task in tasks {
            byType[task.type, default: 0] += 1
            byPriority[task.priority, default: 0] += 1
        }

        let oldestDate = tasks.map { $0.createdAt }.min()
        let newestDate = tasks.map { $0.createdAt }.max()

        // Estimate size
        let estimatedSize = tasks.reduce(0) { $0 + $1.payload.count + 256 }

        return QueueStatistics(
            totalCount: tasks.count,
            byType: byType,
            byPriority: byPriority,
            oldestTaskDate: oldestDate,
            newestTaskDate: newestDate,
            estimatedSizeBytes: estimatedSize
        )
    }

    /// Get tasks filtered by type.
    ///
    /// - Parameter type: The task type to filter by.
    /// - Returns: Array of tasks matching the type.
    public func tasks(ofType type: NeuralTask.TaskType) -> [NeuralTask] {
        lock.lock()
        defer { lock.unlock() }

        return tasks.filter { $0.type == type }
    }

    /// Get tasks filtered by priority.
    ///
    /// - Parameter priority: The priority to filter by.
    /// - Returns: Array of tasks matching the priority.
    public func tasks(withPriority priority: NeuralTask.TaskPriority) -> [NeuralTask] {
        lock.lock()
        defer { lock.unlock() }

        return tasks.filter { $0.priority == priority }
    }

    // MARK: - Persistence

    /// Force save the queue to disk.
    public func forceSave() {
        lock.lock()
        defer { lock.unlock() }

        saveToDisk()
    }

    /// Force reload the queue from disk.
    public func forceReload() {
        lock.lock()
        defer { lock.unlock() }

        loadFromDisk()
    }

    private func saveToDisk() {
        do {
            let data = try encoder.encode(tasks)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            logger.debug("Saved \(self.tasks.count) tasks to disk")
        } catch {
            logger.error("Failed to save queue to disk: \(error.localizedDescription)")
        }
    }

    private func loadFromDisk() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            logger.debug("No existing queue file found")
            return
        }

        do {
            let data = try Data(contentsOf: fileURL)
            tasks = try decoder.decode([NeuralTask].self, from: data)
            sortTasks()
            logger.info("Loaded \(self.tasks.count) tasks from disk")
        } catch {
            logger.error("Failed to load queue from disk: \(error.localizedDescription)")
            // Backup corrupted file
            let backupURL = fileURL.deletingLastPathComponent()
                .appendingPathComponent("pending_tasks_backup_\(Date().timeIntervalSince1970).json")
            try? FileManager.default.moveItem(at: fileURL, to: backupURL)
        }
    }

    // MARK: - Maintenance

    /// Remove tasks older than maxTaskAge.
    public func cleanupOldTasks() {
        lock.lock()
        defer { lock.unlock() }

        let cutoffDate = Date().addingTimeInterval(-maxTaskAge)
        let originalCount = tasks.count

        tasks.removeAll { $0.createdAt < cutoffDate }

        let removedCount = originalCount - tasks.count
        if removedCount > 0 {
            saveToDisk()
            logger.info("Cleaned up \(removedCount) old tasks")
        }
    }

    /// Sort tasks by priority (descending) and creation date (ascending).
    private func sortTasks() {
        tasks.sort { first, second in
            if first.priority != second.priority {
                return first.priority > second.priority
            }
            return first.createdAt < second.createdAt
        }
    }

    // MARK: - Migration

    /// Migrate tasks from UserDefaults (if using legacy storage).
    ///
    /// Call this method once during app upgrade to migrate from UserDefaults to file storage.
    public func migrateFromUserDefaults() {
        let userDefaultsKey = "com.neuralintelligence.edge.pendingTasks"
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey) else {
            return
        }

        do {
            let legacyTasks = try decoder.decode([NeuralTask].self, from: data)
            enqueue(tasks: legacyTasks)
            UserDefaults.standard.removeObject(forKey: userDefaultsKey)
            logger.info("Migrated \(legacyTasks.count) tasks from UserDefaults")
        } catch {
            logger.error("Failed to migrate from UserDefaults: \(error.localizedDescription)")
        }
    }
}

// MARK: - Debug Helpers

#if DEBUG
extension LocalNeuralTaskQueue {
    /// Print debug information about the queue.
    public func printDebugInfo() {
        let stats = getStatistics()
        print("[LocalNeuralTaskQueue Debug]")
        print("  Total Count: \(stats.totalCount)")
        print("  By Type: \(stats.byType)")
        print("  By Priority: \(stats.byPriority)")
        print("  Oldest Task: \(stats.oldestTaskDate?.description ?? "none")")
        print("  Newest Task: \(stats.newestTaskDate?.description ?? "none")")
        print("  Estimated Size: \(stats.estimatedSizeBytes) bytes")
        print("  Storage Path: \(fileURL.path)")
    }

    /// Add a sample task for testing.
    public func addSampleTask() {
        let sampleTask = NeuralTask(
            type: .textGeneration,
            payload: "Sample payload for testing".data(using: .utf8)!,
            metadata: ["source": "debug"],
            priority: .normal
        )
        enqueue(task: sampleTask)
    }
}
#endif
