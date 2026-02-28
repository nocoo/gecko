import SwiftUI

/// Debug view showing the most recent focus sessions from the database.
///
/// Displays a live-updating table with app name, window title, URL, timestamps,
/// and duration for each session. Active sessions are highlighted.
struct SessionListView: View {
    @ObservedObject var viewModel: SessionListViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            headerSection
            Divider()

            if viewModel.recentSessions.isEmpty {
                emptyState
            } else {
                sessionList
            }
        }
        .onAppear {
            viewModel.refresh()
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack {
            Label("Focus Sessions", systemImage: "clock.arrow.circlepath")
                .font(.headline)

            Spacer()

            Text("\(viewModel.sessionCount) records")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                viewModel.refresh()
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .help("Refresh")
        }
        .padding()
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(.quaternary)
            Text("No sessions recorded yet.")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
            Text("Start tracking to see focus sessions here.")
                .font(.caption)
                .foregroundStyle(.quaternary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Session List

    private var sessionList: some View {
        ScrollViewReader { proxy in
            List(viewModel.recentSessions) { session in
                SessionRowView(session: session)
                    .id(session.id)
            }
            .listStyle(.inset(alternatesRowBackgrounds: true))
            .onChange(of: viewModel.recentSessions.first?.id) {
                if let firstID = viewModel.recentSessions.first?.id {
                    proxy.scrollTo(firstID, anchor: .top)
                }
            }
        }
    }
}

// MARK: - Session Row

/// A single row in the session list.
struct SessionRowView: View {
    let session: FocusSession

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Active indicator
            Circle()
                .fill(session.isActive ? Color.green : Color.clear)
                .frame(width: 8, height: 8)
                .padding(.top, 5)

            VStack(alignment: .leading, spacing: 3) {
                // App name + window title
                HStack(spacing: 6) {
                    Text(session.appName)
                        .font(.body.weight(.semibold))
                    if session.isActive {
                        Text("ACTIVE")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.green, in: RoundedRectangle(cornerRadius: 3))
                    }
                }

                Text(session.windowTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)

                // URL (if browser)
                if let url = session.url, !url.isEmpty {
                    Text(url)
                        .font(.caption2)
                        .foregroundStyle(.blue)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Spacer()

            // Timing info
            VStack(alignment: .trailing, spacing: 3) {
                Text(formatTime(session.startTime))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)

                if session.duration > 0 {
                    Text(formatDuration(session.duration))
                        .font(.caption.weight(.medium).monospacedDigit())
                        .foregroundStyle(.primary)
                } else if session.isActive {
                    Text("ongoing")
                        .font(.caption.italic())
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Formatting

    private func formatTime(_ timestamp: Double) -> String {
        SessionFormatter.formatTime(timestamp)
    }

    private func formatDuration(_ seconds: Double) -> String {
        SessionFormatter.formatDuration(seconds)
    }
}
