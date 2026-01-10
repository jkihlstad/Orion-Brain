// swift-tools-version:5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "NeuralEdgeApp",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "NeuralEdgeApp",
            targets: ["NeuralEdgeApp"]
        ),
    ],
    dependencies: [
        // No external dependencies - using native frameworks only
    ],
    targets: [
        .target(
            name: "NeuralEdgeApp",
            dependencies: [],
            path: "Sources"
        ),
        .testTarget(
            name: "NeuralEdgeAppTests",
            dependencies: ["NeuralEdgeApp"],
            path: "Tests"
        ),
    ]
)
