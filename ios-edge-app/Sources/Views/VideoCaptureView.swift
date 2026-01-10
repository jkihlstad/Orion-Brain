//
//  VideoCaptureView.swift
//  Neural Intelligence Edge App
//
//  SwiftUI view for video capture with camera preview
//

import SwiftUI
import AVFoundation
import Combine

// MARK: - Video Capture View Model

@MainActor
final class VideoCaptureViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var cameraPosition: AVCaptureDevice.Position = .back
    @Published var cameraPermissionGranted = false
    @Published var microphonePermissionGranted = false
    @Published var permissionDenied = false
    @Published var errorMessage: String?
    @Published var isSessionRunning = false

    // MARK: - Capture Session

    let captureSession = AVCaptureSession()

    // MARK: - Private Properties

    private var videoOutput: AVCaptureMovieFileOutput?
    private var currentVideoDevice: AVCaptureDeviceInput?
    private var audioDevice: AVCaptureDeviceInput?
    private var recordingTimer: Timer?
    private var recordingStartTime: Date?
    private let sessionQueue = DispatchQueue(label: "com.neuralintelligence.sessionQueue")

    // MARK: - Initialization

    init() {
        checkPermissions()
    }

    deinit {
        stopSession()
    }

    // MARK: - Permission Handling

    func checkPermissions() {
        // Check camera permission
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            cameraPermissionGranted = true
        case .denied, .restricted:
            permissionDenied = true
        case .notDetermined:
            break
        @unknown default:
            break
        }

        // Check microphone permission
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            microphonePermissionGranted = true
        case .denied:
            permissionDenied = true
        case .undetermined:
            break
        @unknown default:
            break
        }
    }

    func requestPermissions() {
        Task {
            // Request camera permission
            let cameraGranted = await AVCaptureDevice.requestAccess(for: .video)

            // Request microphone permission
            let micGranted = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }

            await MainActor.run {
                self.cameraPermissionGranted = cameraGranted
                self.microphonePermissionGranted = micGranted
                self.permissionDenied = !cameraGranted || !micGranted

                if cameraGranted && micGranted {
                    self.setupSession()
                }
            }
        }
    }

    // MARK: - Session Setup

    func setupSession() {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            self.captureSession.beginConfiguration()
            self.captureSession.sessionPreset = .high

            // Add video input
            do {
                guard let videoDevice = self.getCamera(for: self.cameraPosition) else {
                    Task { @MainActor in
                        self.errorMessage = "No camera available"
                    }
                    return
                }

                let videoInput = try AVCaptureDeviceInput(device: videoDevice)
                if self.captureSession.canAddInput(videoInput) {
                    self.captureSession.addInput(videoInput)
                    self.currentVideoDevice = videoInput
                }

                // Add audio input
                if let audioDevice = AVCaptureDevice.default(for: .audio) {
                    let audioInput = try AVCaptureDeviceInput(device: audioDevice)
                    if self.captureSession.canAddInput(audioInput) {
                        self.captureSession.addInput(audioInput)
                        self.audioDevice = audioInput
                    }
                }

                // Add movie file output
                let movieOutput = AVCaptureMovieFileOutput()
                if self.captureSession.canAddOutput(movieOutput) {
                    self.captureSession.addOutput(movieOutput)
                    self.videoOutput = movieOutput
                }

            } catch {
                Task { @MainActor in
                    self.errorMessage = "Failed to setup camera: \(error.localizedDescription)"
                }
            }

            self.captureSession.commitConfiguration()
            self.startSession()
        }
    }

    private func getCamera(for position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInDualCamera, .builtInTripleCamera],
            mediaType: .video,
            position: position
        )
        return discoverySession.devices.first
    }

    func startSession() {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if !self.captureSession.isRunning {
                self.captureSession.startRunning()
                Task { @MainActor in
                    self.isSessionRunning = true
                }
            }
        }
    }

    func stopSession() {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if self.captureSession.isRunning {
                self.captureSession.stopRunning()
                Task { @MainActor in
                    self.isSessionRunning = false
                }
            }
        }
    }

    // MARK: - Camera Toggle

    func toggleCamera() {
        guard !isRecording else { return }

        let newPosition: AVCaptureDevice.Position = cameraPosition == .back ? .front : .back

        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            self.captureSession.beginConfiguration()

            // Remove current video input
            if let currentInput = self.currentVideoDevice {
                self.captureSession.removeInput(currentInput)
            }

            // Add new video input
            guard let newDevice = self.getCamera(for: newPosition) else {
                self.captureSession.commitConfiguration()
                return
            }

            do {
                let newInput = try AVCaptureDeviceInput(device: newDevice)
                if self.captureSession.canAddInput(newInput) {
                    self.captureSession.addInput(newInput)
                    self.currentVideoDevice = newInput

                    Task { @MainActor in
                        self.cameraPosition = newPosition
                    }
                }
            } catch {
                Task { @MainActor in
                    self.errorMessage = "Failed to switch camera: \(error.localizedDescription)"
                }
            }

            self.captureSession.commitConfiguration()
        }
    }

    // MARK: - Recording Control

    func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        guard let output = videoOutput else {
            errorMessage = "Video output not configured"
            return
        }

        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let videoFilename = documentsPath.appendingPathComponent("neural_video_\(Date().timeIntervalSince1970).mov")

        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            output.startRecording(to: videoFilename, recordingDelegate: RecordingDelegate.shared)

            Task { @MainActor in
                self.isRecording = true
                self.recordingStartTime = Date()
                self.startRecordingTimer()
            }
        }
    }

    private func stopRecording() {
        sessionQueue.async { [weak self] in
            self?.videoOutput?.stopRecording()

            Task { @MainActor in
                self?.isRecording = false
                self?.stopRecordingTimer()
                self?.recordingDuration = 0
            }
        }
    }

    // MARK: - Timer Management

    private func startRecordingTimer() {
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self, let startTime = self.recordingStartTime else { return }
                self.recordingDuration = Date().timeIntervalSince(startTime)
            }
        }
    }

    private func stopRecordingTimer() {
        recordingTimer?.invalidate()
        recordingTimer = nil
    }

    // MARK: - Formatting

    var formattedDuration: String {
        let minutes = Int(recordingDuration) / 60
        let seconds = Int(recordingDuration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - Recording Delegate

class RecordingDelegate: NSObject, AVCaptureFileOutputRecordingDelegate {
    static let shared = RecordingDelegate()

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error = error {
            print("Recording error: \(error.localizedDescription)")
        } else {
            print("Video saved to: \(outputFileURL)")
            // Here you would queue the video for upload to the neural processing backend
        }
    }
}

// MARK: - Video Capture View

struct VideoCaptureView: View {

    @StateObject private var viewModel = VideoCaptureViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                if viewModel.permissionDenied {
                    permissionDeniedView
                } else if !viewModel.cameraPermissionGranted || !viewModel.microphonePermissionGranted {
                    permissionRequestView
                } else {
                    cameraInterface
                }
            }
            .navigationTitle("Video Capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .onAppear {
                if viewModel.cameraPermissionGranted && viewModel.microphonePermissionGranted {
                    viewModel.setupSession()
                }
            }
            .onDisappear {
                viewModel.stopSession()
            }
        }
    }

    // MARK: - Camera Interface

    private var cameraInterface: some View {
        ZStack {
            // Camera preview
            CameraPreviewView(
                session: viewModel.captureSession,
                cameraPosition: viewModel.cameraPosition
            )
            .ignoresSafeArea()

            // Recording indicator overlay
            if viewModel.isRecording {
                recordingOverlay
            }

            // Controls overlay
            VStack {
                Spacer()
                controlsBar
            }
        }
    }

    private var recordingOverlay: some View {
        VStack {
            HStack {
                // Recording indicator
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 12, height: 12)
                        .modifier(PulsingModifier())

                    Text("REC")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    Text(viewModel.formattedDuration)
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.6))
                .cornerRadius(20)

                Spacer()
            }
            .padding()

            Spacer()
        }
    }

    private var controlsBar: some View {
        HStack(spacing: 40) {
            // Camera toggle button
            Button(action: viewModel.toggleCamera) {
                Image(systemName: "camera.rotate.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white)
                    .frame(width: 50, height: 50)
                    .background(Color.white.opacity(0.2))
                    .clipShape(Circle())
            }
            .disabled(viewModel.isRecording)
            .opacity(viewModel.isRecording ? 0.5 : 1)
            .accessibilityLabel("Switch camera")

            // Record button
            Button(action: viewModel.toggleRecording) {
                ZStack {
                    Circle()
                        .stroke(Color.white, lineWidth: 4)
                        .frame(width: 80, height: 80)

                    if viewModel.isRecording {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.red)
                            .frame(width: 32, height: 32)
                    } else {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 64, height: 64)
                    }
                }
            }
            .accessibilityLabel(viewModel.isRecording ? "Stop recording" : "Start recording")

            // Placeholder for symmetry
            Color.clear
                .frame(width: 50, height: 50)
        }
        .padding(.horizontal, 40)
        .padding(.bottom, 40)
    }

    // MARK: - Permission Views

    private var permissionRequestView: some View {
        VStack(spacing: 16) {
            Image(systemName: "video.fill")
                .font(.system(size: 60))
                .foregroundColor(.blue)

            Text("Camera & Microphone Access Required")
                .font(.headline)
                .foregroundColor(.white)

            Text("Neural Intelligence needs access to your camera and microphone to capture video for processing.")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)

            Button("Grant Access") {
                viewModel.requestPermissions()
            }
            .buttonStyle(.borderedProminent)
            .padding(.top)
        }
        .padding()
    }

    private var permissionDeniedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "video.slash.fill")
                .font(.system(size: 60))
                .foregroundColor(.red)

            Text("Camera Access Denied")
                .font(.headline)
                .foregroundColor(.white)

            Text("Please enable camera and microphone access in Settings to use video capture.")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)

            Button("Open Settings") {
                if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(settingsUrl)
                }
            }
            .buttonStyle(.borderedProminent)
            .padding(.top)
        }
        .padding()
    }
}

// MARK: - Pulsing Modifier

struct PulsingModifier: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(isPulsing ? 0.3 : 1.0)
            .animation(
                .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear {
                isPulsing = true
            }
    }
}

// MARK: - Preview

#if DEBUG
struct VideoCaptureView_Previews: PreviewProvider {
    static var previews: some View {
        VideoCaptureView()
    }
}
#endif
