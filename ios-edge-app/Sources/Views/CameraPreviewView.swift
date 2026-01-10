//
//  CameraPreviewView.swift
//  Neural Intelligence Edge App
//
//  UIViewRepresentable wrapper for AVCaptureVideoPreviewLayer
//

import SwiftUI
import AVFoundation

/// A SwiftUI wrapper for displaying camera preview using AVCaptureVideoPreviewLayer
struct CameraPreviewView: UIViewRepresentable {

    // MARK: - Properties

    /// The capture session to display
    let session: AVCaptureSession

    /// The desired camera position (front or back)
    var cameraPosition: AVCaptureDevice.Position = .back

    /// Video gravity for the preview layer
    var videoGravity: AVLayerVideoGravity = .resizeAspectFill

    // MARK: - UIViewRepresentable

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.backgroundColor = .black
        view.videoPreviewLayer.session = session
        view.videoPreviewLayer.videoGravity = videoGravity
        view.videoPreviewLayer.connection?.videoRotationAngle = 90
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {
        uiView.videoPreviewLayer.session = session
        uiView.videoPreviewLayer.videoGravity = videoGravity

        // Update video orientation based on device orientation
        if let connection = uiView.videoPreviewLayer.connection {
            if connection.isVideoRotationAngleSupported(90) {
                connection.videoRotationAngle = 90
            }
        }
    }

    static func dismantleUIView(_ uiView: CameraPreviewUIView, coordinator: ()) {
        // Cleanup if needed
    }
}

// MARK: - CameraPreviewUIView

/// Custom UIView that hosts the AVCaptureVideoPreviewLayer
class CameraPreviewUIView: UIView {

    // MARK: - Properties

    /// The preview layer for displaying camera feed
    var videoPreviewLayer: AVCaptureVideoPreviewLayer {
        guard let layer = layer as? AVCaptureVideoPreviewLayer else {
            fatalError("Expected AVCaptureVideoPreviewLayer but got \(type(of: layer))")
        }
        return layer
    }

    // MARK: - Layer Class

    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        videoPreviewLayer.frame = bounds
    }
}

// MARK: - Preview Provider

#if DEBUG
struct CameraPreviewView_Previews: PreviewProvider {
    static var previews: some View {
        CameraPreviewView(session: AVCaptureSession())
            .frame(height: 400)
            .cornerRadius(12)
            .padding()
    }
}
#endif
