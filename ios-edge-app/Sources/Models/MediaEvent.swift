//
//  MediaEvent.swift
//  Neural Intelligence iOS Edge App
//
//  Models for representing media events and associated metadata captured
//  by the edge device for neural processing.
//
//  Copyright (c) 2024 Neural Intelligence. All rights reserved.
//

import Foundation

// MARK: - MediaMetadata

/// Contains metadata information about a media file.
///
/// `MediaMetadata` provides detailed information about the technical
/// characteristics of a media file, enabling proper handling and
/// processing by the neural engine.
public struct MediaMetadata: Codable, Equatable, Sendable {

    // MARK: - Properties

    /// Duration of the media in seconds (for audio/video).
    public let duration: TimeInterval?

    /// File format or codec (e.g., "mp4", "h264", "aac").
    public let format: String?

    /// File size in bytes.
    public let size: Int64?

    /// Width in pixels (for image/video).
    public let width: Int?

    /// Height in pixels (for image/video).
    public let height: Int?

    /// Bitrate in bits per second (for audio/video).
    public let bitrate: Int?

    /// Sample rate in Hz (for audio).
    public let sampleRate: Int?

    /// Number of audio channels.
    public let channels: Int?

    /// Frame rate in frames per second (for video).
    public let frameRate: Double?

    /// MIME type of the media.
    public let mimeType: String?

    /// Color space (for image/video, e.g., "sRGB", "P3").
    public let colorSpace: String?

    /// Whether the media has an alpha channel.
    public let hasAlpha: Bool?

    /// Orientation of the media (1-8, following EXIF convention).
    public let orientation: Int?

    /// Creation date of the original media.
    public let creationDate: Date?

    /// Location where the media was captured, if available.
    public let location: MediaLocation?

    /// Device information, if available.
    public let deviceInfo: DeviceInfo?

    /// Additional custom metadata as key-value pairs.
    public let customMetadata: [String: AnyCodable]?

    // MARK: - Initialization

    /// Creates a new media metadata instance.
    ///
    /// - Parameters:
    ///   - duration: Duration in seconds.
    ///   - format: File format or codec.
    ///   - size: File size in bytes.
    ///   - width: Width in pixels.
    ///   - height: Height in pixels.
    ///   - bitrate: Bitrate in bps.
    ///   - sampleRate: Sample rate in Hz.
    ///   - channels: Number of audio channels.
    ///   - frameRate: Frame rate in fps.
    ///   - mimeType: MIME type.
    ///   - colorSpace: Color space.
    ///   - hasAlpha: Whether media has alpha channel.
    ///   - orientation: EXIF orientation value.
    ///   - creationDate: Original creation date.
    ///   - location: Capture location.
    ///   - deviceInfo: Device information.
    ///   - customMetadata: Additional custom metadata.
    public init(
        duration: TimeInterval? = nil,
        format: String? = nil,
        size: Int64? = nil,
        width: Int? = nil,
        height: Int? = nil,
        bitrate: Int? = nil,
        sampleRate: Int? = nil,
        channels: Int? = nil,
        frameRate: Double? = nil,
        mimeType: String? = nil,
        colorSpace: String? = nil,
        hasAlpha: Bool? = nil,
        orientation: Int? = nil,
        creationDate: Date? = nil,
        location: MediaLocation? = nil,
        deviceInfo: DeviceInfo? = nil,
        customMetadata: [String: AnyCodable]? = nil
    ) {
        self.duration = duration
        self.format = format
        self.size = size
        self.width = width
        self.height = height
        self.bitrate = bitrate
        self.sampleRate = sampleRate
        self.channels = channels
        self.frameRate = frameRate
        self.mimeType = mimeType
        self.colorSpace = colorSpace
        self.hasAlpha = hasAlpha
        self.orientation = orientation
        self.creationDate = creationDate
        self.location = location
        self.deviceInfo = deviceInfo
        self.customMetadata = customMetadata
    }

    // MARK: - Coding Keys

    private enum CodingKeys: String, CodingKey {
        case duration
        case format
        case size
        case width
        case height
        case bitrate
        case sampleRate = "sample_rate"
        case channels
        case frameRate = "frame_rate"
        case mimeType = "mime_type"
        case colorSpace = "color_space"
        case hasAlpha = "has_alpha"
        case orientation
        case creationDate = "creation_date"
        case location
        case deviceInfo = "device_info"
        case customMetadata = "custom_metadata"
    }
}

// MARK: - MediaLocation

/// Represents the geographic location where media was captured.
public struct MediaLocation: Codable, Equatable, Sendable {

    /// Latitude in degrees.
    public let latitude: Double

    /// Longitude in degrees.
    public let longitude: Double

    /// Altitude in meters, if available.
    public let altitude: Double?

    /// Horizontal accuracy in meters.
    public let horizontalAccuracy: Double?

    /// Vertical accuracy in meters.
    public let verticalAccuracy: Double?

    /// Creates a new media location.
    ///
    /// - Parameters:
    ///   - latitude: Latitude in degrees.
    ///   - longitude: Longitude in degrees.
    ///   - altitude: Altitude in meters.
    ///   - horizontalAccuracy: Horizontal accuracy in meters.
    ///   - verticalAccuracy: Vertical accuracy in meters.
    public init(
        latitude: Double,
        longitude: Double,
        altitude: Double? = nil,
        horizontalAccuracy: Double? = nil,
        verticalAccuracy: Double? = nil
    ) {
        self.latitude = latitude
        self.longitude = longitude
        self.altitude = altitude
        self.horizontalAccuracy = horizontalAccuracy
        self.verticalAccuracy = verticalAccuracy
    }

    private enum CodingKeys: String, CodingKey {
        case latitude
        case longitude
        case altitude
        case horizontalAccuracy = "horizontal_accuracy"
        case verticalAccuracy = "vertical_accuracy"
    }
}

// MARK: - DeviceInfo

/// Information about the device that captured the media.
public struct DeviceInfo: Codable, Equatable, Sendable {

    /// Device manufacturer (e.g., "Apple").
    public let manufacturer: String?

    /// Device model (e.g., "iPhone 15 Pro").
    public let model: String?

    /// Operating system version.
    public let osVersion: String?

    /// Application version that captured the media.
    public let appVersion: String?

    /// Creates device information.
    ///
    /// - Parameters:
    ///   - manufacturer: Device manufacturer.
    ///   - model: Device model.
    ///   - osVersion: OS version.
    ///   - appVersion: App version.
    public init(
        manufacturer: String? = nil,
        model: String? = nil,
        osVersion: String? = nil,
        appVersion: String? = nil
    ) {
        self.manufacturer = manufacturer
        self.model = model
        self.osVersion = osVersion
        self.appVersion = appVersion
    }

    private enum CodingKeys: String, CodingKey {
        case manufacturer
        case model
        case osVersion = "os_version"
        case appVersion = "app_version"
    }
}

// MARK: - MediaEvent

/// Represents a media capture or processing event.
///
/// A `MediaEvent` encapsulates information about a media file that has been
/// captured or imported for neural processing. It includes the file location,
/// type information, and associated metadata.
///
/// Example usage:
/// ```swift
/// let event = MediaEvent(
///     id: UUID().uuidString,
///     mediaType: .image,
///     filePath: "/path/to/image.jpg",
///     metadata: MediaMetadata(
///         format: "jpeg",
///         size: 1024000,
///         width: 1920,
///         height: 1080
///     )
/// )
/// ```
public struct MediaEvent: Codable, Identifiable, Equatable, Sendable {

    // MARK: - Properties

    /// Unique identifier for this media event.
    public let id: String

    /// The type of media (audio, video, image, or text).
    public let mediaType: MediaType

    /// Absolute file path to the media file.
    public let filePath: String

    /// Timestamp when the event was created.
    public let timestamp: Date

    /// Detailed metadata about the media file.
    public let metadata: MediaMetadata?

    /// Source of the media (e.g., "camera", "microphone", "import").
    public let source: MediaSource?

    /// Tags associated with this media event.
    public let tags: [String]?

    /// Reference to a parent event, if this is derived from another event.
    public let parentEventId: String?

    /// Processing state of the media event.
    public var processingStatus: ProcessingStatus

    /// Associated task ID if this event is being processed.
    public var associatedTaskId: String?

    // MARK: - Initialization

    /// Creates a new media event.
    ///
    /// - Parameters:
    ///   - id: Unique identifier. Defaults to a new UUID.
    ///   - mediaType: The type of media.
    ///   - filePath: Path to the media file.
    ///   - timestamp: Event timestamp. Defaults to current date.
    ///   - metadata: Media metadata.
    ///   - source: Source of the media.
    ///   - tags: Associated tags.
    ///   - parentEventId: Parent event ID if derived.
    ///   - processingStatus: Initial processing status. Defaults to `.queued`.
    ///   - associatedTaskId: Associated task ID.
    public init(
        id: String = UUID().uuidString,
        mediaType: MediaType,
        filePath: String,
        timestamp: Date = Date(),
        metadata: MediaMetadata? = nil,
        source: MediaSource? = nil,
        tags: [String]? = nil,
        parentEventId: String? = nil,
        processingStatus: ProcessingStatus = .queued,
        associatedTaskId: String? = nil
    ) {
        self.id = id
        self.mediaType = mediaType
        self.filePath = filePath
        self.timestamp = timestamp
        self.metadata = metadata
        self.source = source
        self.tags = tags
        self.parentEventId = parentEventId
        self.processingStatus = processingStatus
        self.associatedTaskId = associatedTaskId
    }

    // MARK: - Coding Keys

    private enum CodingKeys: String, CodingKey {
        case id
        case mediaType = "media_type"
        case filePath = "file_path"
        case timestamp
        case metadata
        case source
        case tags
        case parentEventId = "parent_event_id"
        case processingStatus = "processing_status"
        case associatedTaskId = "associated_task_id"
    }
}

// MARK: - MediaSource

/// Represents the source of a media event.
public enum MediaSource: String, Codable, CaseIterable, Sendable {
    /// Captured from the device camera.
    case camera

    /// Recorded from the device microphone.
    case microphone

    /// Screen recording or screenshot.
    case screen

    /// Imported from the photo library.
    case photoLibrary

    /// Imported from the file system.
    case fileImport

    /// Received from an external source (e.g., AirDrop, share sheet).
    case external

    /// Generated by the application (e.g., synthesized audio).
    case generated

    /// Source is unknown or not specified.
    case unknown
}

// MARK: - MediaEvent Extensions

extension MediaEvent {

    /// Returns the file name from the file path.
    public var fileName: String {
        (filePath as NSString).lastPathComponent
    }

    /// Returns the file extension from the file path.
    public var fileExtension: String {
        (filePath as NSString).pathExtension.lowercased()
    }

    /// Returns the directory containing the file.
    public var directoryPath: String {
        (filePath as NSString).deletingLastPathComponent
    }

    /// Returns `true` if the file exists at the specified path.
    public var fileExists: Bool {
        FileManager.default.fileExists(atPath: filePath)
    }

    /// Returns the file size, if available from metadata or file system.
    public var fileSize: Int64? {
        if let size = metadata?.size {
            return size
        }

        guard let attributes = try? FileManager.default.attributesOfItem(atPath: filePath),
              let size = attributes[.size] as? Int64 else {
            return nil
        }

        return size
    }

    /// Creates a copy of the event with updated processing status.
    ///
    /// - Parameter newStatus: The new processing status.
    /// - Returns: A new `MediaEvent` with the updated status.
    public func withStatus(_ newStatus: ProcessingStatus) -> MediaEvent {
        var event = self
        event.processingStatus = newStatus
        return event
    }

    /// Creates a copy of the event with an associated task ID.
    ///
    /// - Parameter taskId: The task ID to associate.
    /// - Returns: A new `MediaEvent` with the associated task ID.
    public func withAssociatedTask(_ taskId: String) -> MediaEvent {
        var event = self
        event.associatedTaskId = taskId
        return event
    }
}

// MARK: - MediaMetadata Extensions

extension MediaMetadata {

    /// Returns the aspect ratio (width / height), if dimensions are available.
    public var aspectRatio: Double? {
        guard let width = width, let height = height, height > 0 else {
            return nil
        }
        return Double(width) / Double(height)
    }

    /// Returns a human-readable file size string.
    public var formattedSize: String? {
        guard let size = size else { return nil }
        return ByteCountFormatter.string(fromByteCount: size, countStyle: .file)
    }

    /// Returns a human-readable duration string (HH:MM:SS).
    public var formattedDuration: String? {
        guard let duration = duration else { return nil }

        let hours = Int(duration) / 3600
        let minutes = (Int(duration) % 3600) / 60
        let seconds = Int(duration) % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }

    /// Returns the resolution as a formatted string (e.g., "1920x1080").
    public var resolution: String? {
        guard let width = width, let height = height else { return nil }
        return "\(width)x\(height)"
    }
}

// MARK: - CustomStringConvertible

extension MediaEvent: CustomStringConvertible {
    public var description: String {
        "MediaEvent(id: \(id), type: \(mediaType.rawValue), file: \(fileName), status: \(processingStatus.rawValue))"
    }
}

extension MediaMetadata: CustomStringConvertible {
    public var description: String {
        var components: [String] = []

        if let resolution = resolution {
            components.append(resolution)
        }
        if let format = format {
            components.append(format)
        }
        if let formattedSize = formattedSize {
            components.append(formattedSize)
        }
        if let formattedDuration = formattedDuration {
            components.append(formattedDuration)
        }

        return "MediaMetadata(\(components.joined(separator: ", ")))"
    }
}
