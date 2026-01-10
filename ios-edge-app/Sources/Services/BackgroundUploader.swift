//
//  BackgroundUploader.swift
//  Neural Intelligence iOS Edge App
//
//  Background task scheduler integration for uploading neural tasks.
//  Uses BGTaskScheduler for processing queued tasks when app is in background.
//

import Foundation
import BackgroundTasks
import os.log

// MARK: - Constants

/// Task identifiers for background processing.
public enum BackgroundTaskIdentifiers {
    /// Identifier for the neural task upload processing task.
    public static let neuralTaskUpload = "com.neuralintelligence.edge.neural-task-upload"

    /// Identifier for the periodic sync task.
    public static let periodicSync = "com.neuralintelligence.edge.periodic-sync"
}

// MARK: - Errors

/// Errors that can occur during background upload operations.
public enum BackgroundUploaderError: Error, LocalizedError {
    case schedulingFailed(underlying: Error)
    case taskQueueUnavailable
    case uploadFailed(taskId: UUID, underlying: Error)
    case backgroundTaskExpired
    case noTasksToProcess
    case configurationError(message: String)

    public var errorDescription: String? {
        switch self {
        case .schedulingFailed(let error):
            return "Failed to schedule background task: \(error.localizedDescription)"
        case .taskQueueUnavailable:
            return "Local neural task queue is unavailable"
        case .uploadFailed(let taskId, let error):
            return "Failed to upload task \(taskId): \(error.localizedDescription)"
        case .backgroundTaskExpired:
            return "Background task expired before completion"
        case .noTasksToProcess:
            return "No tasks available for processing"
        case .configurationError(let message):
            return "Configuration error: \(message)"
        }
    }
}

// MARK: - Upload Result

/// Result of processing a neural task upload.
public struct UploadResult: Sendable {
    public let taskId: UUID
    public let success: Bool
    public let error: Error?
    public let uploadedAt: Date?

    public init(taskId: UUID, success: Bool, error: Error? = nil, uploadedAt: Date? = nil) {
        self.taskId = taskId
        self.success = success
        self.error = error
        self.uploadedAt = uploadedAt
    }
}

// MARK: - BackgroundUploader

/// Manages background upload operations for neural tasks.
///
/// This class integrates with iOS BGTaskScheduler to process queued neural tasks
/// when the app is in the background, ensuring reliable delivery even when the
/// app is not active.
///
/// ## Setup
/// 1. Register the background task identifier in Info.plist under `BGTaskSchedulerPermittedIdentifiers`
/// 2. Call `registerBackgroundTasks()` in your AppDelegate's `application(_:didFinishLaunchingWithOptions:)`
/// 3. Use `scheduleUpload()` to queue background processing
///
/// ## Usage
/// ```swift
/// // In AppDelegate
/// BackgroundUploader.shared.registerBackgroundTasks()
///
/// // Schedule an upload when tasks are queued
/// BackgroundUploader.shared.scheduleUpload()
/// ```
@MainActor
public final class BackgroundUploader: Sendable {

    // MARK: - Singleton

    /// Shared singleton instance.
    public static let shared = BackgroundUploader()

    // MARK: - Properties

    private let logger = Logger(subsystem: "com.neuralintelligence.edge", category: "BackgroundUploader")
    private var isProcessing = false
    private var lastScheduledDate: Date?

    /// Minimum interval between scheduled background tasks (in seconds).
    public let minimumScheduleInterval: TimeInterval = 15 * 60 // 15 minutes

    /// Maximum number of tasks to process in a single background session.
    public let maxTasksPerSession: Int = 50

    // MARK: - Initialization

    private init() {}

    // MARK: - Task Registration

    /// Register background task handlers with the system.
    ///
    /// Call this method in your AppDelegate's `application(_:didFinishLaunchingWithOptions:)`
    /// before the app finishes launching.
    public func registerBackgroundTasks() {
        // Register the neural task upload handler
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: BackgroundTaskIdentifiers.neuralTaskUpload,
            using: nil
        ) { [weak self] task in
            guard let processingTask = task as? BGProcessingTask else { return }
            Task { @MainActor in
                self?.handleUploadTask(task: processingTask)
            }
        }

        // Register periodic sync handler
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: BackgroundTaskIdentifiers.periodicSync,
            using: nil
        ) { [weak self] task in
            guard let refreshTask = task as? BGAppRefreshTask else { return }
            Task { @MainActor in
                self?.handlePeriodicSyncTask(task: refreshTask)
            }
        }

        logger.info("Background tasks registered successfully")
    }

    // MARK: - Scheduling

    /// Schedule a background upload task.
    ///
    /// This method schedules a background processing task to upload queued neural tasks.
    /// The system will run this task at an appropriate time when the device has sufficient
    /// battery and network connectivity.
    ///
    /// - Parameter earliestBeginDate: The earliest date the task should run. Defaults to 15 minutes from now.
    /// - Throws: `BackgroundUploaderError.schedulingFailed` if scheduling fails.
    public func scheduleUpload(earliestBeginDate: Date? = nil) throws {
        // Prevent scheduling too frequently
        if let lastDate = lastScheduledDate,
           Date().timeIntervalSince(lastDate) < minimumScheduleInterval {
            logger.debug("Skipping schedule - too soon since last schedule")
            return
        }

        let request = BGProcessingTaskRequest(identifier: BackgroundTaskIdentifiers.neuralTaskUpload)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = earliestBeginDate ?? Date(timeIntervalSinceNow: minimumScheduleInterval)

        do {
            try BGTaskScheduler.shared.submit(request)
            lastScheduledDate = Date()
            logger.info("Scheduled background upload task for \(request.earliestBeginDate?.description ?? "unspecified")")
        } catch {
            logger.error("Failed to schedule background upload: \(error.localizedDescription)")
            throw BackgroundUploaderError.schedulingFailed(underlying: error)
        }
    }

    /// Schedule a periodic sync task.
    ///
    /// This method schedules an app refresh task for periodic synchronization.
    ///
    /// - Throws: `BackgroundUploaderError.schedulingFailed` if scheduling fails.
    public func schedulePeriodicSync() throws {
        let request = BGAppRefreshTaskRequest(identifier: BackgroundTaskIdentifiers.periodicSync)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // 1 hour

        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Scheduled periodic sync task")
        } catch {
            logger.error("Failed to schedule periodic sync: \(error.localizedDescription)")
            throw BackgroundUploaderError.schedulingFailed(underlying: error)
        }
    }

    /// Cancel all pending background tasks.
    public func cancelAllPendingTasks() {
        BGTaskScheduler.shared.cancelAllTaskRequests()
        logger.info("Cancelled all pending background tasks")
    }

    /// Cancel a specific background task.
    ///
    /// - Parameter identifier: The task identifier to cancel.
    public func cancelTask(withIdentifier identifier: String) {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
        logger.info("Cancelled background task: \(identifier)")
    }

    // MARK: - Task Handling

    /// Handle a background processing task for uploading neural tasks.
    ///
    /// This method is called by the system when it's time to process the background task.
    /// It retrieves queued neural tasks and uploads them to the server.
    ///
    /// - Parameter task: The background processing task to handle.
    public func handleUploadTask(task: BGProcessingTask) {
        logger.info("Starting background upload task")

        guard !isProcessing else {
            logger.warning("Already processing - completing task immediately")
            task.setTaskCompleted(success: true)
            return
        }

        isProcessing = true

        // Create a Task to handle the async work
        let uploadTask = Task { @MainActor [weak self] in
            await self?.processQueuedTasks()
        }

        // Handle task expiration
        task.expirationHandler = { [weak self] in
            self?.logger.warning("Background task expired - cancelling upload")
            uploadTask.cancel()
            Task { @MainActor in
                self?.isProcessing = false
            }
        }

        // Wait for completion
        Task { @MainActor [weak self] in
            _ = await uploadTask.result
            self?.isProcessing = false

            // Schedule next upload if there are remaining tasks
            let remainingTasks = LocalNeuralTaskQueue.shared.count
            if remainingTasks > 0 {
                try? self?.scheduleUpload()
            }

            task.setTaskCompleted(success: true)
            self?.logger.info("Background upload task completed")
        }
    }

    /// Handle a periodic sync task.
    ///
    /// - Parameter task: The app refresh task to handle.
    private func handlePeriodicSyncTask(task: BGAppRefreshTask) {
        logger.info("Starting periodic sync task")

        // Schedule the next sync
        try? schedulePeriodicSync()

        // Check if there are tasks to upload
        let taskQueue = LocalNeuralTaskQueue.shared
        let pendingCount = taskQueue.count

        if pendingCount > 0 {
            logger.info("Found \(pendingCount) pending tasks during sync - scheduling upload")
            try? scheduleUpload(earliestBeginDate: Date(timeIntervalSinceNow: 60))
        }

        task.setTaskCompleted(success: true)
    }

    // MARK: - Processing

    /// Process all queued neural tasks.
    ///
    /// - Returns: Array of upload results for each processed task.
    @discardableResult
    public func processQueuedTasks() async -> [UploadResult] {
        let taskQueue = LocalNeuralTaskQueue.shared
        let tasks = taskQueue.dequeueAll()

        guard !tasks.isEmpty else {
            logger.info("No tasks to process")
            return []
        }

        logger.info("Processing \(tasks.count) queued tasks")

        var results: [UploadResult] = []
        let orchestrationAgent = LLMOrchestrationAgent.shared

        // Process tasks with concurrency limit
        let limitedTasks = Array(tasks.prefix(maxTasksPerSession))

        for neuralTask in limitedTasks {
            // Check if task is cancelled
            if Task.isCancelled {
                logger.warning("Processing cancelled - re-queuing remaining tasks")
                // Re-queue unprocessed tasks
                let remainingTasks = tasks.filter { task in
                    !results.contains { $0.taskId == task.id }
                }
                for remaining in remainingTasks {
                    taskQueue.enqueue(task: remaining)
                }
                break
            }

            do {
                let _ = try await orchestrationAgent.sendTask(task: neuralTask)
                let result = UploadResult(
                    taskId: neuralTask.id,
                    success: true,
                    uploadedAt: Date()
                )
                results.append(result)
                logger.info("Successfully uploaded task: \(neuralTask.id)")
            } catch {
                let result = UploadResult(
                    taskId: neuralTask.id,
                    success: false,
                    error: error
                )
                results.append(result)
                logger.error("Failed to upload task \(neuralTask.id): \(error.localizedDescription)")

                // Re-queue failed tasks for retry
                taskQueue.enqueue(task: neuralTask)
            }
        }

        // Re-queue tasks that exceeded the session limit
        if tasks.count > maxTasksPerSession {
            let remainingTasks = Array(tasks.dropFirst(maxTasksPerSession))
            for task in remainingTasks {
                taskQueue.enqueue(task: task)
            }
            logger.info("Re-queued \(remainingTasks.count) tasks for next session")
        }

        let successCount = results.filter { $0.success }.count
        logger.info("Processing complete: \(successCount)/\(results.count) successful")

        return results
    }

    /// Process a single neural task immediately (foreground).
    ///
    /// - Parameter task: The neural task to process.
    /// - Returns: The upload result.
    public func processTaskImmediately(task: NeuralTask) async -> UploadResult {
        logger.info("Processing task immediately: \(task.id)")

        do {
            let orchestrationAgent = LLMOrchestrationAgent.shared
            let _ = try await orchestrationAgent.sendTask(task: task)
            return UploadResult(
                taskId: task.id,
                success: true,
                uploadedAt: Date()
            )
        } catch {
            logger.error("Immediate processing failed: \(error.localizedDescription)")
            // Queue for later retry
            LocalNeuralTaskQueue.shared.enqueue(task: task)
            try? scheduleUpload()
            return UploadResult(
                taskId: task.id,
                success: false,
                error: error
            )
        }
    }

    // MARK: - Status

    /// Check if background task is currently processing.
    public var isCurrentlyProcessing: Bool {
        isProcessing
    }

    /// Get the date of the last scheduled background task.
    public var lastScheduled: Date? {
        lastScheduledDate
    }

    /// Get pending background task requests.
    ///
    /// - Returns: Array of pending task request identifiers.
    public func getPendingTaskRequests() async -> [String] {
        let requests = await BGTaskScheduler.shared.pendingTaskRequests()
        return requests.map { $0.identifier }
    }
}

// MARK: - Debug Helpers

#if DEBUG
extension BackgroundUploader {
    /// Simulate a background task for testing.
    ///
    /// This method can be used during development to test background task handling.
    public func simulateBackgroundTask() async {
        logger.info("Simulating background task execution")
        await processQueuedTasks()
    }

    /// Print debug information about pending tasks.
    public func printDebugInfo() async {
        let pending = await getPendingTaskRequests()
        print("[BackgroundUploader Debug]")
        print("  Processing: \(isProcessing)")
        print("  Last Scheduled: \(lastScheduledDate?.description ?? "never")")
        print("  Pending Tasks: \(pending)")
        print("  Queue Count: \(LocalNeuralTaskQueue.shared.count)")
    }
}
#endif
