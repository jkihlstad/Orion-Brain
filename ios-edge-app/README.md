# Neural Edge iOS App

iOS Edge application for the Neural Intelligence Platform. Captures audio/video events, generates embeddings, and syncs with the LangGraph neural processing backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        iOS Edge App                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   SwiftUI   │  │ AVFoundation│  │   BackgroundTasks       │  │
│  │    Views    │──│   Capture   │──│   (BGTaskScheduler)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                      │                │
│         ▼                ▼                      ▼                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              LocalNeuralTaskQueue                         │   │
│  │              (Persistent Task Storage)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
└──────────────────────────────│───────────────────────────────────┘
                               │ HTTPS
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Neural Brain Server                           │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │   LangGraph    │  │    LanceDB     │  │      Neo4j         │  │
│  │ Orchestration  │  │ Vector Storage │  │   Graph Store      │  │
│  └────────────────┘  └────────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Features

- **Audio Capture**: Record audio with automatic neural ingestion
- **Video Capture**: Record video with frame analysis
- **Background Sync**: BGTaskScheduler for offline-first operation
- **Vector Storage**: Embeddings stored in LanceDB
- **Graph Updates**: Social relationships in Neo4j

## Project Structure

```
ios-edge-app/
├── Sources/
│   ├── Config/
│   │   └── AppConfig.swift          # Configuration constants
│   ├── Models/
│   │   ├── NeuralTask.swift         # Task & result models
│   │   ├── AnyCodable.swift         # JSON encoding helper
│   │   └── MediaEvent.swift         # Media event model
│   ├── Services/
│   │   ├── LLMOrchestrationAgent.swift  # LangGraph client
│   │   ├── VectorDBClient.swift         # LanceDB client
│   │   ├── Neo4jGraphClient.swift       # Neo4j client
│   │   ├── BackgroundUploader.swift     # BGTask handler
│   │   ├── LocalNeuralTaskQueue.swift   # Task persistence
│   │   └── AVMediaCapture.swift         # Audio/Video capture
│   └── Views/
│       ├── AppRoot.swift            # @main entry point
│       ├── ContentView.swift        # Main tab view
│       ├── AudioCaptureView.swift   # Audio recording UI
│       ├── VideoCaptureView.swift   # Video recording UI
│       ├── CameraPreviewView.swift  # Camera preview wrapper
│       └── NeuralQueueStatusView.swift  # Sync status UI
├── Tests/
│   └── ...
├── Package.swift                    # Swift Package Manager
├── Info.plist                       # App permissions
└── README.md
```

## Requirements

- iOS 16.0+
- Xcode 15.0+
- Swift 5.9+

## Setup

1. **Clone the repository**
   ```bash
   cd ios-edge-app
   ```

2. **Configure API endpoints**
   Edit `Sources/Config/AppConfig.swift`:
   ```swift
   static let langGraphBaseURL = URL(string: "https://your-api.com/v1/brain")!
   ```

3. **Open in Xcode**
   ```bash
   open Package.swift
   ```
   Or create a new Xcode project and add the package as a local dependency.

4. **Configure signing**
   - Set your Team in Xcode project settings
   - Update Bundle Identifier

5. **Build and run**
   Select your device/simulator and press ⌘R

## Permissions

The app requires the following permissions (configured in `Info.plist`):

| Permission | Usage |
|------------|-------|
| Microphone | Audio recording for neural analysis |
| Camera | Video recording for neural analysis |
| Photo Library | Saving captured media |
| Background Processing | Offline sync of neural tasks |

## Background Processing

The app uses `BGTaskScheduler` for background uploads:

```swift
// Schedule upload when app enters background
BackgroundUploader.shared.scheduleUpload()
```

Tasks are persisted locally and uploaded when:
- App returns to foreground
- BGTaskScheduler triggers (iOS determines timing)
- Manual sync is triggered

## API Integration

### LangGraph Orchestration
```swift
let task = NeuralTask(taskId: UUID().uuidString,
                      taskType: "media_ingestion",
                      payload: ["mediaType": "audio", ...])

let result = try await LLMOrchestrationAgent.shared.sendTask(task)
```

### Vector Storage
```swift
try await VectorDBClient.shared.storeEmbedding(
    userId: "user123",
    vector: embeddings,
    metadata: ["source": "audio"]
)
```

### Graph Updates
```swift
try await Neo4jGraphClient.shared.addRelationship(
    fromUserId: "user123",
    toUserId: "user456",
    type: "MENTIONED_IN"
)
```

## Testing

```bash
swift test
```

## License

Proprietary - Orion Team
