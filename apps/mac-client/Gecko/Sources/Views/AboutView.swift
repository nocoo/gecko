import SwiftUI

/// About window displaying the Gecko logo, version info, and credits.
struct AboutView: View {
    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
    }

    private var buildNumber: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    }

    var body: some View {
        VStack(spacing: 16) {
            Image("GeckoLogo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .shadow(color: .black.opacity(0.15), radius: 6, y: 3)

            VStack(spacing: 4) {
                Text("Gecko")
                    .font(.title.bold())
                Text("Screen Time & Focus Tracker")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Text("Version \(appVersion) (\(buildNumber))")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Divider()
                .frame(width: 180)

            Text("A personal macOS app that tracks\nwhich app and window you focus on.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
        }
        .padding(32)
        .frame(width: 300, height: 320)
    }
}
