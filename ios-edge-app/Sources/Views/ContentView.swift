//
//  ContentView.swift
//  Neural Intelligence Edge App
//
//  Main content view with tab navigation
//

import SwiftUI

// MARK: - Tab Selection

enum AppTab: Int, CaseIterable, Identifiable {
    case audio
    case video
    case queue

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .audio: return "Audio"
        case .video: return "Video"
        case .queue: return "Queue"
        }
    }

    var icon: String {
        switch self {
        case .audio: return "waveform"
        case .video: return "video.fill"
        case .queue: return "list.bullet.rectangle"
        }
    }

    var selectedIcon: String {
        switch self {
        case .audio: return "waveform.circle.fill"
        case .video: return "video.fill"
        case .queue: return "list.bullet.rectangle.fill"
        }
    }
}

// MARK: - Content View

struct ContentView: View {

    // MARK: - State

    @State private var selectedTab: AppTab = .audio
    @StateObject private var queueViewModel = QueueStatusViewModel()

    // MARK: - Body

    var body: some View {
        TabView(selection: $selectedTab) {
            // Audio Capture Tab
            AudioCaptureView()
                .tabItem {
                    Label {
                        Text(AppTab.audio.title)
                    } icon: {
                        Image(systemName: selectedTab == .audio ? AppTab.audio.selectedIcon : AppTab.audio.icon)
                    }
                }
                .tag(AppTab.audio)

            // Video Capture Tab
            VideoCaptureView()
                .tabItem {
                    Label {
                        Text(AppTab.video.title)
                    } icon: {
                        Image(systemName: selectedTab == .video ? AppTab.video.selectedIcon : AppTab.video.icon)
                    }
                }
                .tag(AppTab.video)

            // Queue Status Tab
            NeuralQueueStatusView()
                .tabItem {
                    Label {
                        Text(AppTab.queue.title)
                    } icon: {
                        Image(systemName: selectedTab == .queue ? AppTab.queue.selectedIcon : AppTab.queue.icon)
                    }
                }
                .tag(AppTab.queue)
                .badge(queueViewModel.pendingTasksCount > 0 ? queueViewModel.pendingTasksCount : 0)
        }
        .tint(.blue)
        .onAppear {
            configureTabBarAppearance()
        }
    }

    // MARK: - Tab Bar Configuration

    private func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()

        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}

// MARK: - Preview

#if DEBUG
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
#endif
