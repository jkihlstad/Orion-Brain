//
//  NeuralQueueStatusView.swift
//  Neural Intelligence Edge App
//
//  SwiftUI view for displaying neural task queue status
//

import SwiftUI
import Combine

// MARK: - Neural Task Model

struct NeuralTask: Identifiable, Equatable {
    let id: UUID
    let type: TaskType
    let filename: String
    let fileSize: Int64
    let createdAt: Date
    var status: TaskStatus
    var uploadProgress: Double

    enum TaskType: String {
        case audio = "Audio"
        case video = "Video"
        case image = "Image"

        var icon: String {
            switch self {
            case .audio: return "waveform"
            case .video: return "video.fill"
            case .image: return "photo.fill"
            }
        }
    }

    enum TaskStatus: String {
        case pending = "Pending"
        case uploading = "Uploading"
        case processing = "Processing"
        case completed = "Completed"
        case failed = "Failed"

        var color: Color {
            switch self {
            case .pending: return .orange
            case .uploading: return .blue
            case .processing: return .purple
            case .completed: return .green
            case .failed: return .red
            }
        }
    }

    var formattedFileSize: String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: fileSize)
    }
}

// MARK: - Queue Status View Model

@MainActor
final class QueueStatusViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published var tasks: [NeuralTask] = []
    @Published var lastSyncTimestamp: Date?
    @Published var isSyncing = false
    @Published var overallProgress: Double = 0
    @Published var errorMessage: String?

    // MARK: - Computed Properties

    var pendingTasksCount: Int {
        tasks.filter { $0.status == .pending || $0.status == .uploading }.count
    }

    var completedTasksCount: Int {
        tasks.filter { $0.status == .completed }.count
    }

    var failedTasksCount: Int {
        tasks.filter { $0.status == .failed }.count
    }

    var formattedLastSync: String {
        guard let timestamp = lastSyncTimestamp else {
            return "Never"
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: timestamp, relativeTo: Date())
    }

    // MARK: - Initialization

    init() {
        loadMockData()
    }

    // MARK: - Actions

    func syncNow() {
        guard !isSyncing else { return }

        isSyncing = true
        overallProgress = 0

        // Simulate sync process
        Task {
            for i in 0...10 {
                try? await Task.sleep(nanoseconds: 200_000_000)
                overallProgress = Double(i) / 10.0
            }

            lastSyncTimestamp = Date()
            isSyncing = false

            // Update task statuses after sync
            updateTaskStatuses()
        }
    }

    func retryFailedTasks() {
        for index in tasks.indices where tasks[index].status == .failed {
            tasks[index].status = .pending
            tasks[index].uploadProgress = 0
        }
    }

    func clearCompletedTasks() {
        tasks.removeAll { $0.status == .completed }
    }

    // MARK: - Private Methods

    private func loadMockData() {
        // Load mock data for demonstration
        tasks = [
            NeuralTask(
                id: UUID(),
                type: .audio,
                filename: "recording_001.m4a",
                fileSize: 2_450_000,
                createdAt: Date().addingTimeInterval(-3600),
                status: .pending,
                uploadProgress: 0
            ),
            NeuralTask(
                id: UUID(),
                type: .video,
                filename: "capture_001.mov",
                fileSize: 45_000_000,
                createdAt: Date().addingTimeInterval(-7200),
                status: .uploading,
                uploadProgress: 0.45
            ),
            NeuralTask(
                id: UUID(),
                type: .audio,
                filename: "recording_002.m4a",
                fileSize: 1_800_000,
                createdAt: Date().addingTimeInterval(-10800),
                status: .processing,
                uploadProgress: 1.0
            ),
            NeuralTask(
                id: UUID(),
                type: .video,
                filename: "capture_002.mov",
                fileSize: 32_000_000,
                createdAt: Date().addingTimeInterval(-14400),
                status: .completed,
                uploadProgress: 1.0
            ),
            NeuralTask(
                id: UUID(),
                type: .audio,
                filename: "recording_003.m4a",
                fileSize: 3_200_000,
                createdAt: Date().addingTimeInterval(-18000),
                status: .failed,
                uploadProgress: 0.2
            )
        ]

        lastSyncTimestamp = Date().addingTimeInterval(-1800)
    }

    private func updateTaskStatuses() {
        // Simulate status updates after sync
        for index in tasks.indices {
            if tasks[index].status == .pending {
                tasks[index].status = .uploading
                tasks[index].uploadProgress = 0.1
            }
        }
    }
}

// MARK: - Neural Queue Status View

struct NeuralQueueStatusView: View {

    @StateObject private var viewModel = QueueStatusViewModel()

    var body: some View {
        NavigationStack {
            List {
                // Status summary section
                Section {
                    statusSummaryView
                }

                // Sync status section
                Section {
                    syncStatusView
                }

                // Tasks section
                Section {
                    if viewModel.tasks.isEmpty {
                        emptyStateView
                    } else {
                        ForEach(viewModel.tasks) { task in
                            TaskRowView(task: task)
                        }
                    }
                } header: {
                    HStack {
                        Text("Tasks")
                        Spacer()
                        if viewModel.completedTasksCount > 0 {
                            Button("Clear Completed") {
                                withAnimation {
                                    viewModel.clearCompletedTasks()
                                }
                            }
                            .font(.caption)
                        }
                    }
                }

                // Error section
                if let error = viewModel.errorMessage {
                    Section {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.yellow)
                            Text(error)
                                .font(.subheadline)
                        }
                    }
                }
            }
            .navigationTitle("Queue Status")
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                viewModel.syncNow()
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if viewModel.failedTasksCount > 0 {
                        Button("Retry Failed") {
                            viewModel.retryFailedTasks()
                        }
                    }
                }
            }
        }
    }

    // MARK: - Status Summary View

    private var statusSummaryView: some View {
        HStack(spacing: 20) {
            StatusBadge(
                title: "Pending",
                count: viewModel.pendingTasksCount,
                color: .orange,
                icon: "clock.fill"
            )

            StatusBadge(
                title: "Completed",
                count: viewModel.completedTasksCount,
                color: .green,
                icon: "checkmark.circle.fill"
            )

            StatusBadge(
                title: "Failed",
                count: viewModel.failedTasksCount,
                color: .red,
                icon: "xmark.circle.fill"
            )
        }
        .padding(.vertical, 8)
    }

    // MARK: - Sync Status View

    private var syncStatusView: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Last Sync")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    Text(viewModel.formattedLastSync)
                        .font(.headline)
                }

                Spacer()

                Button(action: viewModel.syncNow) {
                    if viewModel.isSyncing {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle())
                    } else {
                        Label("Sync Now", systemImage: "arrow.triangle.2.circlepath")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSyncing)
            }

            if viewModel.isSyncing {
                VStack(alignment: .leading, spacing: 4) {
                    ProgressView(value: viewModel.overallProgress)
                        .progressViewStyle(LinearProgressViewStyle())

                    Text("Syncing... \(Int(viewModel.overallProgress * 100))%")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Last sync \(viewModel.formattedLastSync). \(viewModel.isSyncing ? "Syncing" : "Ready to sync")")
    }

    // MARK: - Empty State View

    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("No Tasks")
                .font(.headline)

            Text("Captured audio and video will appear here for upload.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let title: String
    let count: Int
    let color: Color
    let icon: String

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text("\(count)")
                    .font(.title2.bold())
            }
            .foregroundColor(color)

            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(count) \(title) tasks")
    }
}

// MARK: - Task Row View

struct TaskRowView: View {
    let task: NeuralTask

    var body: some View {
        HStack(spacing: 12) {
            // Type icon
            Image(systemName: task.type.icon)
                .font(.title2)
                .foregroundColor(.blue)
                .frame(width: 40)

            // Task info
            VStack(alignment: .leading, spacing: 4) {
                Text(task.filename)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Text(task.formattedFileSize)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text("•")
                        .foregroundColor(.secondary)

                    Text(task.createdAt, style: .relative)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Status indicator
            VStack(alignment: .trailing, spacing: 4) {
                Text(task.status.rawValue)
                    .font(.caption.weight(.medium))
                    .foregroundColor(task.status.color)

                if task.status == .uploading {
                    ProgressView(value: task.uploadProgress)
                        .progressViewStyle(LinearProgressViewStyle())
                        .frame(width: 60)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(task.type.rawValue) file \(task.filename), \(task.formattedFileSize), status: \(task.status.rawValue)")
    }
}

// MARK: - Preview

#if DEBUG
struct NeuralQueueStatusView_Previews: PreviewProvider {
    static var previews: some View {
        NeuralQueueStatusView()
    }
}
#endif
