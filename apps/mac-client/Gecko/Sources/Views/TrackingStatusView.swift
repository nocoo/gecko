import SwiftUI

struct TrackingStatusView: View {
    @ObservedObject var viewModel: TrackingViewModel

    var body: some View {
        TrackingContent(
            isTracking: viewModel.isTracking,
            session: viewModel.currentSession,
            accessibilityGranted: viewModel.isAccessibilityGranted,
            automationGranted: viewModel.isAutomationGranted,
            onToggle: viewModel.toggleTracking,
            onRequestAccessibility: viewModel.resetAndRequestAccessibility,
            onOpenAccessibility: viewModel.openAccessibilitySettings,
            onRequestAutomation: viewModel.testAutomation,
            onOpenAutomation: viewModel.openAutomationSettings
        )
    }
}

struct TrackingContent: View {
    let isTracking: Bool
    let session: FocusSession?
    let accessibilityGranted: Bool
    let automationGranted: Bool
    let onToggle: () -> Void
    let onRequestAccessibility: () -> Void
    let onOpenAccessibility: () -> Void
    let onRequestAutomation: () -> Void
    let onOpenAutomation: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GeckoTheme.sectionGap) {
                GeckoPageHeader(
                    title: "Tracking", subtitle: "A live view of where your attention goes.", symbol: "eye"
                )
                focusCard
                HStack(spacing: 12) {
                    contextNote("On this Mac", detail: "Saved locally", symbol: "internaldrive", color: GeckoTheme.blue)
                    contextNote("At your pace", detail: "Pauses when idle", symbol: "moon.zzz", color: GeckoTheme.violet)
                    contextNote("Your context", detail: "Apps & windows", symbol: "macwindow", color: GeckoTheme.amber)
                }
                permissions
            }
            .padding(GeckoTheme.pageInset)
            .frame(maxWidth: 1080, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private var focusCard: some View {
        GeckoCard {
            HStack {
                Label("CURRENT FOCUS", systemImage: "scope")
                    .font(GeckoTheme.caption.weight(.semibold)).tracking(1)
                    .foregroundStyle(GeckoTheme.secondary)
                Spacer()
                GeckoBadge(
                    title: isTracking ? "Live" : "Paused",
                    symbol: isTracking ? "waveform.path" : "pause.fill",
                    color: isTracking ? GeckoTheme.accent : GeckoTheme.amber
                )
            }
            if isTracking, let session {
                HStack(alignment: .top, spacing: 16) {
                    GeckoAppGlyph(bundleID: session.bundleId, size: 56)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(session.appName).font(.system(size: 23, weight: .semibold))
                        Text(session.windowTitle.isEmpty ? "No window title available" : session.windowTitle)
                            .font(GeckoTheme.body).foregroundStyle(GeckoTheme.secondary)
                            .lineLimit(3).textSelection(.enabled)
                        if let url = session.url, !url.isEmpty {
                            SessionURLView(value: url)
                        }
                    }
                    Spacer(minLength: 0)
                }
                Divider().overlay(GeckoTheme.line)
                Label {
                    Text("Session started \(Date(timeIntervalSince1970: session.startTime), style: .time)")
                } icon: {
                    Image(systemName: "clock")
                }
                .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
            } else {
                HStack(spacing: 18) {
                    GeckoSymbol(symbol: isTracking ? "scope" : "leaf", size: 64)
                    VStack(alignment: .leading, spacing: 7) {
                        Text(isTracking ? "Ready for your next window" : "A moment off the clock")
                            .font(.system(size: 22, weight: .semibold, design: .rounded))
                        Text(isTracking
                             ? "Your next focused app will appear here."
                             : "Start tracking to record the apps and windows you use.")
                            .font(GeckoTheme.body).foregroundStyle(GeckoTheme.secondary)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 8)
                if !isTracking {
                    GeckoTrackingButton(isTracking: false, action: onToggle)
                }
            }
        }
    }

    private var permissions: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Permissions", systemImage: "checkmark.shield")
                    .font(GeckoTheme.heading)
                Spacer()
                Text(accessibilityGranted && automationGranted ? "All set" : "Setup needed")
                    .font(GeckoTheme.detail)
                    .foregroundStyle(accessibilityGranted && automationGranted ? GeckoTheme.accent : GeckoTheme.amber)
            }
            HStack(alignment: .top, spacing: 12) {
                PermissionCard(
                    title: "Accessibility", subtitle: "Read the title of your focused window.",
                    symbol: "accessibility", color: GeckoTheme.blue, isGranted: accessibilityGranted,
                    requestTitle: "Reset & Request", onRequest: onRequestAccessibility, onOpenSettings: onOpenAccessibility
                )
                PermissionCard(
                    title: "Automation", subtitle: "Include page URLs from your browser.",
                    symbol: "safari", color: GeckoTheme.violet, isGranted: automationGranted,
                    requestTitle: "Request", onRequest: onRequestAutomation, onOpenSettings: onOpenAutomation
                )
            }
        }
    }

    private func contextNote(_ title: String, detail: String, symbol: String, color: Color) -> some View {
        HStack(spacing: 10) {
            GeckoSymbol(symbol: symbol, color: color, size: 32)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(GeckoTheme.detail.weight(.medium))
                Text(detail).font(GeckoTheme.caption).foregroundStyle(GeckoTheme.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GeckoTheme.inset, in: RoundedRectangle(cornerRadius: GeckoTheme.controlRadius))
    }
}

private struct PermissionCard: View {
    let title: String
    let subtitle: String
    let symbol: String
    let color: Color
    let isGranted: Bool
    let requestTitle: String
    let onRequest: () -> Void
    let onOpenSettings: () -> Void

    var body: some View {
        GeckoCard {
            HStack(spacing: 10) {
                GeckoSymbol(symbol: symbol, color: color, size: 32)
                Text(title).font(GeckoTheme.body.weight(.semibold))
                Spacer(minLength: 0)
                Image(systemName: isGranted ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    .foregroundStyle(isGranted ? GeckoTheme.accent : GeckoTheme.amber)
                    .accessibilityLabel(isGranted ? "Granted" : "Permission required")
            }
            Text(subtitle).font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
                .frame(minHeight: 30, alignment: .topLeading)
            if isGranted {
                Label("Permission granted", systemImage: "checkmark")
                    .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.accent)
            } else {
                HStack(spacing: 8) {
                    Button(requestTitle, action: onRequest).buttonStyle(.borderedProminent).tint(GeckoTheme.action)
                    Button("Settings", action: onOpenSettings).buttonStyle(.bordered)
                        .accessibilityLabel("Open \(title) settings")
                }
                .controlSize(.small)
            }
        }
    }
}

struct SessionURLView: View {
    let value: String

    var body: some View {
        Group {
            if let url = URL(string: value) {
                Link(destination: url) { Label(value, systemImage: "link") }
            } else {
                Label(value, systemImage: "link").textSelection(.enabled)
            }
        }
        .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.blue)
        .lineLimit(2).truncationMode(.middle)
        .help(value)
    }
}
