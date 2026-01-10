//
//  AudioCaptureView.swift
//  Neural Intelligence Edge App
//
//  SwiftUI view for audio capture with waveform visualization
//

import SwiftUI
import AVFoundation
import Combine

// MARK: - Audio Capture View Model

@MainActor
final class AudioCaptureViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var audioLevels: [CGFloat] = Array(repeating: 0.1, count: 30)
    @Published var permissionGranted = false
    @Published var permissionDenied = false
    @Published var errorMessage: String?

    // MARK: - Private Properties

    private var audioRecorder: AVAudioRecorder?
    private var recordingTimer: Timer?
    private var levelTimer: Timer?
    private var recordingStartTime: Date?

    // MARK: - Initialization

    init() {
        checkPermission()
    }

    // MARK: - Permission Handling

    func checkPermission() {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            permissionGranted = true
            permissionDenied = false
        case .denied:
            permissionGranted = false
            permissionDenied = true
        case .undetermined:
            permissionGranted = false
            permissionDenied = false
        @unknown default:
            permissionGranted = false
            permissionDenied = false
        }
    }

    func requestPermission() {
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor in
                self?.permissionGranted = granted
                self?.permissionDenied = !granted
            }
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
        guard permissionGranted else {
            requestPermission()
            return
        }

        let audioSession = AVAudioSession.sharedInstance()

        do {
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try audioSession.setActive(true)

            let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let audioFilename = documentsPath.appendingPathComponent("neural_audio_\(Date().timeIntervalSince1970).m4a")

            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 44100.0,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]

            audioRecorder = try AVAudioRecorder(url: audioFilename, settings: settings)
            audioRecorder?.isMeteringEnabled = true
            audioRecorder?.record()

            isRecording = true
            recordingStartTime = Date()
            startTimers()

        } catch {
            errorMessage = "Failed to start recording: \(error.localizedDescription)"
        }
    }

    private func stopRecording() {
        audioRecorder?.stop()
        audioRecorder = nil
        isRecording = false
        stopTimers()
        recordingDuration = 0
        audioLevels = Array(repeating: 0.1, count: 30)
    }

    // MARK: - Timer Management

    private func startTimers() {
        // Duration timer
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self, let startTime = self.recordingStartTime else { return }
                self.recordingDuration = Date().timeIntervalSince(startTime)
            }
        }

        // Level meter timer
        levelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateAudioLevels()
            }
        }
    }

    private func stopTimers() {
        recordingTimer?.invalidate()
        recordingTimer = nil
        levelTimer?.invalidate()
        levelTimer = nil
    }

    private func updateAudioLevels() {
        guard let recorder = audioRecorder, isRecording else { return }

        recorder.updateMeters()
        let level = recorder.averagePower(forChannel: 0)
        let normalizedLevel = max(0.1, CGFloat((level + 60) / 60))

        var newLevels = audioLevels
        newLevels.removeFirst()
        newLevels.append(normalizedLevel)
        audioLevels = newLevels
    }

    // MARK: - Formatting

    var formattedDuration: String {
        let minutes = Int(recordingDuration) / 60
        let seconds = Int(recordingDuration) % 60
        let milliseconds = Int((recordingDuration.truncatingRemainder(dividingBy: 1)) * 10)
        return String(format: "%02d:%02d.%d", minutes, seconds, milliseconds)
    }
}

// MARK: - Audio Capture View

struct AudioCaptureView: View {

    @StateObject private var viewModel = AudioCaptureViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Permission handling
                if viewModel.permissionDenied {
                    permissionDeniedView
                } else if !viewModel.permissionGranted {
                    permissionRequestView
                } else {
                    recordingInterface
                }

                Spacer()

                // Error message
                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding()
                }
            }
            .padding()
            .navigationTitle("Audio Capture")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Recording Interface

    private var recordingInterface: some View {
        VStack(spacing: 32) {
            // Waveform visualization
            AudioWaveformView(levels: viewModel.audioLevels, isRecording: viewModel.isRecording)
                .frame(height: 120)
                .padding(.horizontal)

            // Duration display
            Text(viewModel.formattedDuration)
                .font(.system(size: 48, weight: .light, design: .monospaced))
                .foregroundColor(viewModel.isRecording ? .red : .primary)
                .animation(.easeInOut(duration: 0.3), value: viewModel.isRecording)

            // Recording button
            recordButton
        }
    }

    private var recordButton: some View {
        Button(action: {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                viewModel.toggleRecording()
            }
        }) {
            ZStack {
                // Outer ring
                Circle()
                    .stroke(viewModel.isRecording ? Color.red : Color.gray.opacity(0.3), lineWidth: 4)
                    .frame(width: 80, height: 80)

                // Pulsing ring when recording
                if viewModel.isRecording {
                    Circle()
                        .stroke(Color.red.opacity(0.3), lineWidth: 2)
                        .frame(width: 100, height: 100)
                        .scaleEffect(viewModel.isRecording ? 1.2 : 1.0)
                        .opacity(viewModel.isRecording ? 0 : 1)
                        .animation(
                            .easeOut(duration: 1.0).repeatForever(autoreverses: false),
                            value: viewModel.isRecording
                        )
                }

                // Inner button
                Group {
                    if viewModel.isRecording {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.red)
                            .frame(width: 32, height: 32)
                    } else {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 60, height: 60)
                    }
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: viewModel.isRecording)
            }
        }
        .accessibilityLabel(viewModel.isRecording ? "Stop recording" : "Start recording")
        .accessibilityHint(viewModel.isRecording ? "Double tap to stop audio recording" : "Double tap to start audio recording")
    }

    // MARK: - Permission Views

    private var permissionRequestView: some View {
        VStack(spacing: 16) {
            Image(systemName: "mic.fill")
                .font(.system(size: 60))
                .foregroundColor(.blue)

            Text("Microphone Access Required")
                .font(.headline)

            Text("Neural Intelligence needs access to your microphone to capture audio for processing.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button("Grant Access") {
                viewModel.requestPermission()
            }
            .buttonStyle(.borderedProminent)
            .padding(.top)
        }
        .padding()
    }

    private var permissionDeniedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "mic.slash.fill")
                .font(.system(size: 60))
                .foregroundColor(.red)

            Text("Microphone Access Denied")
                .font(.headline)

            Text("Please enable microphone access in Settings to use audio capture.")
                .font(.subheadline)
                .foregroundColor(.secondary)
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

// MARK: - Audio Waveform View

struct AudioWaveformView: View {
    let levels: [CGFloat]
    let isRecording: Bool

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 4) {
                ForEach(0..<levels.count, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(isRecording ? Color.red : Color.gray.opacity(0.3))
                        .frame(
                            width: (geometry.size.width - CGFloat(levels.count - 1) * 4) / CGFloat(levels.count),
                            height: geometry.size.height * levels[index]
                        )
                        .animation(.easeOut(duration: 0.05), value: levels[index])
                }
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Preview

#if DEBUG
struct AudioCaptureView_Previews: PreviewProvider {
    static var previews: some View {
        AudioCaptureView()
    }
}
#endif
