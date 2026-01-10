//
//  AppRoot.swift
//  Neural Intelligence Edge App
//
//  Main app entry point with scene configuration
//

import SwiftUI
import AVFoundation
import BackgroundTasks

// MARK: - App Entry Point

@main
struct NeuralIntelligenceApp: App {

    // MARK: - App Delegate

    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    // MARK: - State

    @StateObject private var appState = AppState()
    @Environment(\.scenePhase) private var scenePhase

    // MARK: - Body

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onAppear {
                    setupApp()
                }
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    handleScenePhaseChange(from: oldPhase, to: newPhase)
                }
        }
    }

    // MARK: - Setup

    private func setupApp() {
        // Configure audio session for recording
        configureAudioSession()

        // Initialize background uploader
        BackgroundUploader.shared.initialize()

        // Register background tasks
        registerBackgroundTasks()
    }

    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        } catch {
            print("Failed to configure audio session: \(error.localizedDescription)")
        }
    }

    private func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.neuralintelligence.upload",
            using: nil
        ) { task in
            self.handleBackgroundUpload(task: task as! BGProcessingTask)
        }
    }

    // MARK: - Scene Phase Handling

    private func handleScenePhaseChange(from oldPhase: ScenePhase, to newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            // App became active
            appState.isActive = true
            BackgroundUploader.shared.resumeUploads()

        case .inactive:
            // App is transitioning
            appState.isActive = false

        case .background:
            // App entered background
            appState.isActive = false
            scheduleBackgroundUpload()

        @unknown default:
            break
        }
    }

    // MARK: - Background Tasks

    private func scheduleBackgroundUpload() {
        let request = BGProcessingTaskRequest(identifier: "com.neuralintelligence.upload")
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Failed to schedule background upload: \(error.localizedDescription)")
        }
    }

    private func handleBackgroundUpload(task: BGProcessingTask) {
        // Schedule the next background task
        scheduleBackgroundUpload()

        // Create a task for uploading
        let uploadTask = Task {
            await BackgroundUploader.shared.performBackgroundUpload()
        }

        // Handle task expiration
        task.expirationHandler = {
            uploadTask.cancel()
        }

        // Complete the task when upload finishes
        Task {
            _ = await uploadTask.result
            task.setTaskCompleted(success: true)
        }
    }
}

// MARK: - App State

@MainActor
final class AppState: ObservableObject {

    @Published var isActive = false
    @Published var uploadQueueCount = 0
    @Published var lastSyncDate: Date?
    @Published var isUploading = false

    init() {
        // Initialize state
    }

    func updateQueueCount(_ count: Int) {
        uploadQueueCount = count
    }

    func markSynced() {
        lastSyncDate = Date()
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {

        // Configure appearance
        configureAppearance()

        return true
    }

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        // Handle background URL session events
        BackgroundUploader.shared.handleBackgroundSessionEvents(
            identifier: identifier,
            completionHandler: completionHandler
        )
    }

    private func configureAppearance() {
        // Configure navigation bar appearance
        let navigationAppearance = UINavigationBarAppearance()
        navigationAppearance.configureWithDefaultBackground()

        UINavigationBar.appearance().standardAppearance = navigationAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationAppearance
        UINavigationBar.appearance().compactAppearance = navigationAppearance
    }
}

// MARK: - Background Uploader

actor BackgroundUploader {

    static let shared = BackgroundUploader()

    private var backgroundSession: URLSession?
    private var backgroundCompletionHandler: (() -> Void)?
    private var isInitialized = false

    // MARK: - Initialization

    func initialize() {
        guard !isInitialized else { return }

        let configuration = URLSessionConfiguration.background(
            withIdentifier: "com.neuralintelligence.backgroundUpload"
        )
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        configuration.allowsCellularAccess = true

        backgroundSession = URLSession(
            configuration: configuration,
            delegate: nil,
            delegateQueue: nil
        )

        isInitialized = true
    }

    // MARK: - Upload Management

    func resumeUploads() {
        // Resume any pending uploads when app becomes active
        backgroundSession?.getAllTasks { tasks in
            for task in tasks {
                if task.state == .suspended {
                    task.resume()
                }
            }
        }
    }

    func performBackgroundUpload() async {
        // Perform background upload logic
        // This would upload pending neural tasks to the backend

        // Simulate upload work
        try? await Task.sleep(nanoseconds: 5_000_000_000)
    }

    func handleBackgroundSessionEvents(
        identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        backgroundCompletionHandler = completionHandler
    }

    func completeBackgroundEvents() {
        backgroundCompletionHandler?()
        backgroundCompletionHandler = nil
    }
}

// MARK: - Preview

#if DEBUG
struct AppRoot_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(AppState())
    }
}
#endif
