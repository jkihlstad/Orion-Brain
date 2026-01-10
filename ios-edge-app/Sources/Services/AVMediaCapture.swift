//
//  AVMediaCapture.swift
//  Neural Intelligence iOS Edge App
//
//  ObservableObject for SwiftUI integration with audio and video capture.
//  Automatically queues captured media to LocalNeuralTaskQueue on stop.
//

import Foundation
import AVFoundation
import Combine
import os.log

// MARK: - Capture State

/// Represents the current state of media capture.
public enum CaptureState: Equatable, Sendable {
    case idle
    case preparing
    case recording
    case stopping
    case error(String)

    public var isRecording: Bool {
        self == .recording
    }

    public var isIdle: Bool {
        self == .idle
    }
}

// MARK: - Media Type

/// Type of media being captured.
public enum MediaType: String, Sendable {
    case audio
    case video
}

// MARK: - Capture Errors

/// Errors that can occur during media capture.
public enum CaptureError: Error, LocalizedError {
    case permissionDenied(MediaType)
    case deviceNotAvailable(MediaType)
    case configurationFailed(String)
    case recordingFailed(underlying: Error)
    case noActiveRecording
    case alreadyRecording
    case outputFileError(String)

    public var errorDescription: String? {
        switch self {
        case .permissionDenied(let type):
            return "\(type.rawValue.capitalized) permission denied"
        case .deviceNotAvailable(let type):
            return "\(type.rawValue.capitalized) device not available"
        case .configurationFailed(let message):
            return "Configuration failed: \(message)"
        case .recordingFailed(let error):
            return "Recording failed: \(error.localizedDescription)"
        case .noActiveRecording:
            return "No active recording to stop"
        case .alreadyRecording:
            return "Already recording"
        case .outputFileError(let message):
            return "Output file error: \(message)"
        }
    }
}

// MARK: - Capture Configuration

/// Configuration for media capture.
public struct CaptureConfiguration: Sendable {
    public let audioQuality: AVAudioQuality
    public let audioSampleRate: Double
    public let audioChannels: Int
    public let videoQuality: String
    public let maxRecordingDuration: TimeInterval
    public let outputDirectory: URL?

    public static let `default` = CaptureConfiguration(
        audioQuality: .high,
        audioSampleRate: 44100.0,
        audioChannels: 1,
        videoQuality: AVCaptureSession.Preset.high.rawValue,
        maxRecordingDuration: 300.0, // 5 minutes
        outputDirectory: nil
    )

    public init(
        audioQuality: AVAudioQuality = .high,
        audioSampleRate: Double = 44100.0,
        audioChannels: Int = 1,
        videoQuality: String = AVCaptureSession.Preset.high.rawValue,
        maxRecordingDuration: TimeInterval = 300.0,
        outputDirectory: URL? = nil
    ) {
        self.audioQuality = audioQuality
        self.audioSampleRate = audioSampleRate
        self.audioChannels = audioChannels
        self.videoQuality = videoQuality
        self.maxRecordingDuration = maxRecordingDuration
        self.outputDirectory = outputDirectory
    }
}

// MARK: - AVMediaCapture

/// Observable object for audio and video capture with SwiftUI integration.
///
/// This class provides a simple interface for recording audio and video content,
/// automatically queuing the captured media to the LocalNeuralTaskQueue for
/// background processing.
///
/// ## Features
/// - SwiftUI integration via ObservableObject
/// - Audio and video recording support
/// - Automatic permission handling
/// - Automatic queuing to LocalNeuralTaskQueue
/// - Recording duration tracking
///
/// ## Usage
/// ```swift
/// struct RecordingView: View {
///     @StateObject private var capture = AVMediaCapture()
///
///     var body: some View {
///         VStack {
///             Text("Duration: \(capture.recordingDuration, specifier: "%.1f")s")
///
///             Button(capture.audioState.isRecording ? "Stop" : "Record") {
///                 if capture.audioState.isRecording {
///                     capture.stopAudioRecording()
///                 } else {
///                     capture.startAudioRecording()
///                 }
///             }
///         }
///     }
/// }
/// ```
@MainActor
public final class AVMediaCapture: NSObject, ObservableObject {

    // MARK: - Published Properties

    /// Current state of audio recording.
    @Published public private(set) var audioState: CaptureState = .idle

    /// Current state of video recording.
    @Published public private(set) var videoState: CaptureState = .idle

    /// Duration of the current recording in seconds.
    @Published public private(set) var recordingDuration: TimeInterval = 0

    /// Whether audio permission has been granted.
    @Published public private(set) var hasAudioPermission: Bool = false

    /// Whether video permission has been granted.
    @Published public private(set) var hasVideoPermission: Bool = false

    // MARK: - Properties

    private let logger = Logger(subsystem: "com.neuralintelligence.edge", category: "AVMediaCapture")
    private let configuration: CaptureConfiguration

    // Audio recording
    private var audioRecorder: AVAudioRecorder?
    private var audioFileURL: URL?

    // Video recording
    private var captureSession: AVCaptureSession?
    private var videoOutput: AVCaptureMovieFileOutput?
    private var videoFileURL: URL?

    // Timing
    private var recordingStartTime: Date?
    private var durationTimer: Timer?

    // MARK: - Initialization

    /// Initialize with default configuration.
    public override init() {
        self.configuration = .default
        super.init()
        Task { await checkPermissions() }
    }

    /// Initialize with custom configuration.
    ///
    /// - Parameter configuration: The capture configuration to use.
    public init(configuration: CaptureConfiguration) {
        self.configuration = configuration
        super.init()
        Task { await checkPermissions() }
    }

    deinit {
        stopDurationTimer()
    }

    // MARK: - Permissions

    /// Check and update permission status for audio and video.
    public func checkPermissions() async {
        hasAudioPermission = await checkAudioPermission()
        hasVideoPermission = await checkVideoPermission()
    }

    /// Request audio recording permission.
    ///
    /// - Returns: True if permission was granted.
    @discardableResult
    public func requestAudioPermission() async -> Bool {
        let status = AVAudioApplication.shared.recordPermission

        switch status {
        case .granted:
            hasAudioPermission = true
            return true
        case .denied:
            hasAudioPermission = false
            return false
        case .undetermined:
            let granted = await AVAudioApplication.requestRecordPermission()
            hasAudioPermission = granted
            return granted
        @unknown default:
            hasAudioPermission = false
            return false
        }
    }

    /// Request video recording permission.
    ///
    /// - Returns: True if permission was granted.
    @discardableResult
    public func requestVideoPermission() async -> Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .video)

        switch status {
        case .authorized:
            hasVideoPermission = true
            return true
        case .denied, .restricted:
            hasVideoPermission = false
            return false
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            hasVideoPermission = granted
            return granted
        @unknown default:
            hasVideoPermission = false
            return false
        }
    }

    private func checkAudioPermission() async -> Bool {
        AVAudioApplication.shared.recordPermission == .granted
    }

    private func checkVideoPermission() async -> Bool {
        AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    }

    // MARK: - Audio Recording

    /// Start audio recording.
    ///
    /// This method requests permission if needed and starts recording audio.
    /// The recording will be automatically queued to LocalNeuralTaskQueue when stopped.
    public func startAudioRecording() {
        guard audioState.isIdle else {
            logger.warning("Cannot start audio recording - not idle")
            return
        }

        audioState = .preparing

        Task {
            do {
                // Check permission
                guard await requestAudioPermission() else {
                    throw CaptureError.permissionDenied(.audio)
                }

                // Configure audio session
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playAndRecord, mode: .default)
                try audioSession.setActive(true)

                // Create output file
                audioFileURL = createOutputFileURL(for: .audio)
                guard let fileURL = audioFileURL else {
                    throw CaptureError.outputFileError("Failed to create audio file URL")
                }

                // Configure recorder
                let settings: [String: Any] = [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: configuration.audioSampleRate,
                    AVNumberOfChannelsKey: configuration.audioChannels,
                    AVEncoderAudioQualityKey: configuration.audioQuality.rawValue
                ]

                audioRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
                audioRecorder?.delegate = self
                audioRecorder?.record()

                recordingStartTime = Date()
                startDurationTimer()
                audioState = .recording

                logger.info("Started audio recording to: \(fileURL.path)")
            } catch {
                logger.error("Failed to start audio recording: \(error.localizedDescription)")
                audioState = .error(error.localizedDescription)
            }
        }
    }

    /// Stop audio recording and queue for processing.
    ///
    /// The recorded audio file will be automatically queued to LocalNeuralTaskQueue.
    public func stopAudioRecording() {
        guard audioState.isRecording else {
            logger.warning("Cannot stop audio recording - not recording")
            return
        }

        audioState = .stopping
        audioRecorder?.stop()
        stopDurationTimer()

        // Queue the recording
        if let fileURL = audioFileURL {
            queueMediaForProcessing(fileURL: fileURL, type: .audio)
        }

        audioState = .idle
        recordingDuration = 0
        logger.info("Stopped audio recording")
    }

    // MARK: - Video Recording

    /// Start video recording.
    ///
    /// This method requests permission if needed and starts recording video.
    /// The recording will be automatically queued to LocalNeuralTaskQueue when stopped.
    public func startVideoRecording() {
        guard videoState.isIdle else {
            logger.warning("Cannot start video recording - not idle")
            return
        }

        videoState = .preparing

        Task {
            do {
                // Check permissions
                guard await requestAudioPermission() else {
                    throw CaptureError.permissionDenied(.audio)
                }
                guard await requestVideoPermission() else {
                    throw CaptureError.permissionDenied(.video)
                }

                // Setup capture session
                try await setupVideoCaptureSession()

                // Create output file
                videoFileURL = createOutputFileURL(for: .video)
                guard let fileURL = videoFileURL else {
                    throw CaptureError.outputFileError("Failed to create video file URL")
                }

                // Start recording
                videoOutput?.startRecording(to: fileURL, recordingDelegate: self)

                recordingStartTime = Date()
                startDurationTimer()
                videoState = .recording

                logger.info("Started video recording to: \(fileURL.path)")
            } catch {
                logger.error("Failed to start video recording: \(error.localizedDescription)")
                videoState = .error(error.localizedDescription)
            }
        }
    }

    /// Stop video recording and queue for processing.
    ///
    /// The recorded video file will be automatically queued to LocalNeuralTaskQueue.
    public func stopVideoRecording() {
        guard videoState.isRecording else {
            logger.warning("Cannot stop video recording - not recording")
            return
        }

        videoState = .stopping
        videoOutput?.stopRecording()
        stopDurationTimer()

        logger.info("Stopping video recording")
    }

    private func setupVideoCaptureSession() async throws {
        let session = AVCaptureSession()
        session.sessionPreset = AVCaptureSession.Preset(rawValue: configuration.videoQuality)

        // Add video input
        guard let videoDevice = AVCaptureDevice.default(for: .video) else {
            throw CaptureError.deviceNotAvailable(.video)
        }

        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
        guard session.canAddInput(videoInput) else {
            throw CaptureError.configurationFailed("Cannot add video input")
        }
        session.addInput(videoInput)

        // Add audio input
        if let audioDevice = AVCaptureDevice.default(for: .audio) {
            let audioInput = try AVCaptureDeviceInput(device: audioDevice)
            if session.canAddInput(audioInput) {
                session.addInput(audioInput)
            }
        }

        // Add movie output
        let movieOutput = AVCaptureMovieFileOutput()
        movieOutput.maxRecordedDuration = CMTime(seconds: configuration.maxRecordingDuration, preferredTimescale: 1)

        guard session.canAddOutput(movieOutput) else {
            throw CaptureError.configurationFailed("Cannot add movie output")
        }
        session.addOutput(movieOutput)

        captureSession = session
        videoOutput = movieOutput

        // Start session on background queue
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                session.startRunning()
                continuation.resume()
            }
        }
    }

    // MARK: - Helper Methods

    private func createOutputFileURL(for type: MediaType) -> URL? {
        let fileManager = FileManager.default
        let directory: URL

        if let customDirectory = configuration.outputDirectory {
            directory = customDirectory
        } else {
            directory = fileManager.temporaryDirectory
        }

        let filename: String
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyyMMdd_HHmmss"
        let timestamp = dateFormatter.string(from: Date())

        switch type {
        case .audio:
            filename = "audio_\(timestamp).m4a"
        case .video:
            filename = "video_\(timestamp).mov"
        }

        return directory.appendingPathComponent(filename)
    }

    private func queueMediaForProcessing(fileURL: URL, type: MediaType) {
        Task {
            do {
                let data = try Data(contentsOf: fileURL)

                let taskType: NeuralTask.TaskType
                switch type {
                case .audio:
                    taskType = .audioTranscription
                case .video:
                    taskType = .videoAnalysis
                }

                let task = NeuralTask(
                    type: taskType,
                    payload: data,
                    metadata: [
                        "source": "AVMediaCapture",
                        "mediaType": type.rawValue,
                        "duration": String(format: "%.2f", recordingDuration),
                        "filename": fileURL.lastPathComponent
                    ],
                    priority: .normal
                )

                LocalNeuralTaskQueue.shared.enqueue(task: task)
                logger.info("Queued \(type.rawValue) recording for processing: \(task.id)")

                // Schedule background upload
                try? BackgroundUploader.shared.scheduleUpload()

                // Clean up temporary file
                try? FileManager.default.removeItem(at: fileURL)
            } catch {
                logger.error("Failed to queue media for processing: \(error.localizedDescription)")
            }
        }
    }

    private func startDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self,
                      let startTime = self.recordingStartTime else { return }
                self.recordingDuration = Date().timeIntervalSince(startTime)
            }
        }
    }

    private func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
        recordingStartTime = nil
    }

    // MARK: - Cleanup

    /// Stop all active recordings and release resources.
    public func cleanup() {
        if audioState.isRecording {
            stopAudioRecording()
        }
        if videoState.isRecording {
            stopVideoRecording()
        }

        captureSession?.stopRunning()
        captureSession = nil
        videoOutput = nil
        audioRecorder = nil

        logger.info("AVMediaCapture cleaned up")
    }
}

// MARK: - AVAudioRecorderDelegate

extension AVMediaCapture: AVAudioRecorderDelegate {
    nonisolated public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in
            if flag {
                logger.info("Audio recording finished successfully")
            } else {
                logger.error("Audio recording finished with error")
                audioState = .error("Recording failed")
            }
        }
    }

    nonisolated public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor in
            logger.error("Audio encoder error: \(error?.localizedDescription ?? "unknown")")
            audioState = .error(error?.localizedDescription ?? "Encoding error")
        }
    }
}

// MARK: - AVCaptureFileOutputRecordingDelegate

extension AVMediaCapture: AVCaptureFileOutputRecordingDelegate {
    nonisolated public func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        Task { @MainActor in
            logger.info("Video recording started to: \(fileURL.path)")
        }
    }

    nonisolated public func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        Task { @MainActor in
            if let error = error {
                logger.error("Video recording finished with error: \(error.localizedDescription)")
                videoState = .error(error.localizedDescription)
            } else {
                logger.info("Video recording finished successfully")
                queueMediaForProcessing(fileURL: outputFileURL, type: .video)
            }

            videoState = .idle
            recordingDuration = 0

            // Stop the capture session
            captureSession?.stopRunning()
        }
    }
}

// MARK: - Preview Provider Support

#if DEBUG
extension AVMediaCapture {
    /// Create a preview instance for SwiftUI previews.
    public static var preview: AVMediaCapture {
        let capture = AVMediaCapture()
        return capture
    }

    /// Simulate recording state for previews.
    public func simulateRecording() {
        audioState = .recording
        recordingDuration = 12.5
    }
}
#endif
