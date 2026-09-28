import SwiftUI

struct SessionListView: View {
    @ObservedObject var viewModel: SessionListViewModel
    @State private var selectedID: FocusSession.ID?

    private var selectedSession: FocusSession? {
        viewModel.recentSessions.first { $0.id == selectedID } ?? viewModel.recentSessions.first
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                GeckoPageHeader(
                    title: "Sessions", subtitle: "Your latest 50 focus sessions, newest first.",
                    symbol: "clock.arrow.circlepath", color: GeckoTheme.blue
                )
                Button {
                    viewModel.refresh()
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .help("Reload recent sessions")
            }
            .padding(GeckoTheme.pageInset)
            if viewModel.recentSessions.isEmpty {
                ContentUnavailableView(
                    "Your timeline starts here", systemImage: "clock.badge.checkmark",
                    description: Text("Start tracking to see your apps, windows and browser pages here.")
                )
                .foregroundStyle(GeckoTheme.secondary)
                .frame(maxHeight: .infinity)
            } else {
                HSplitView {
                    sessionList.frame(minWidth: 260, idealWidth: 310)
                    if let session = selectedSession {
                        SessionDetailView(session: session)
                            .frame(minWidth: 300, maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            HStack(spacing: 6) {
                Image(systemName: "internaldrive")
                Text("\(viewModel.sessionCount) recent records")
                Spacer()
                Text("Stored on this Mac")
            }
            .font(GeckoTheme.caption).foregroundStyle(GeckoTheme.secondary)
            .padding(.horizontal, GeckoTheme.pageInset).padding(.vertical, 10)
            .background(GeckoTheme.surface)
        }
        .onAppear { viewModel.refresh() }
        .onChange(of: viewModel.recentSessions.map(\.id), initial: true) {
            if !viewModel.recentSessions.contains(where: { $0.id == selectedID }) {
                selectedID = viewModel.recentSessions.first?.id
            }
        }
    }

    private var sessionList: some View {
        ScrollViewReader { proxy in
            List(selection: $selectedID) {
                ForEach(viewModel.recentSessions) { session in
                    SessionRowView(session: session).tag(session.id)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 7, leading: 10, bottom: 7, trailing: 10))
                }
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
            .background(GeckoTheme.surface)
            .onChange(of: viewModel.shouldScrollToTop) {
                guard viewModel.shouldScrollToTop, let firstID = viewModel.recentSessions.first?.id else { return }
                proxy.scrollTo(firstID, anchor: .top)
                viewModel.shouldScrollToTop = false
            }
        }
    }
}

struct SessionRowView: View {
    let session: FocusSession

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            GeckoAppGlyph(bundleID: session.bundleId, size: 32)
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(session.appName).font(GeckoTheme.body.weight(.semibold)).lineLimit(1)
                    Spacer(minLength: 2)
                    if session.isActive {
                        Image(systemName: "record.circle.fill").foregroundStyle(GeckoTheme.accent)
                            .accessibilityLabel("Active session")
                    }
                }
                Text(session.windowTitle.isEmpty ? "Untitled window" : session.windowTitle)
                    .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
                    .lineLimit(1).truncationMode(.middle)
                HStack {
                    Text(Date(timeIntervalSince1970: session.startTime), format: .dateTime.month(.abbreviated).day().hour().minute())
                    Spacer(minLength: 4)
                    Text(session.isActive ? "Ongoing" : SessionFormatter.formatDuration(session.duration))
                }
                .font(GeckoTheme.caption).monospacedDigit().foregroundStyle(GeckoTheme.secondary)
            }
        }
        .padding(.vertical, 3)
        .help(session.windowTitle)
    }
}

struct SessionDetailView: View {
    let session: FocusSession

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GeckoTheme.sectionGap) {
                HStack(spacing: 12) {
                    GeckoAppGlyph(bundleID: session.bundleId, size: 52)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(session.appName).font(GeckoTheme.heading)
                        GeckoBadge(
                            title: session.isActive ? "Active session" : "Recorded",
                            symbol: session.isActive ? "record.circle" : "checkmark.circle",
                            color: session.isActive ? GeckoTheme.accent : GeckoTheme.blue
                        )
                    }
                }
                GeckoCard {
                    Label("Window", systemImage: "macwindow").font(GeckoTheme.detail.weight(.semibold))
                        .foregroundStyle(GeckoTheme.secondary)
                    Text(session.windowTitle.isEmpty ? "No window title available" : session.windowTitle)
                        .font(GeckoTheme.body).textSelection(.enabled)
                    if let url = session.url, !url.isEmpty { SessionURLView(value: url) }
                }
                VStack(spacing: 16) {
                    detailRow("Started", symbol: "clock", value: Date(timeIntervalSince1970: session.startTime).formatted())
                    detailRow("Duration", symbol: "hourglass", value: session.isActive
                              ? "Ongoing" : SessionFormatter.formatDuration(session.duration))
                    if let bundleID = session.bundleId {
                        detailRow("Application", symbol: "app.badge", value: bundleID)
                    }
                    if let document = session.documentPath, !document.isEmpty {
                        detailRow("Document", symbol: "doc", value: document)
                    }
                    if let count = session.tabCount {
                        detailRow("Browser tabs", symbol: "square.on.square", value: count.formatted())
                    }
                }
            }
            .padding(GeckoTheme.pageInset)
        }
        .background(GeckoTheme.canvas)
    }

    private func detailRow(_ title: String, symbol: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: symbol).font(GeckoTheme.caption.weight(.medium))
                .foregroundStyle(GeckoTheme.secondary)
            Text(value).font(GeckoTheme.detail).textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
