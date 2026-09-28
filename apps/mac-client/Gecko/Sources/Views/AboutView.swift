import SwiftUI

struct AboutView: View {
    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.12.1"
    }

    private var buildNumber: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GeckoTheme.sectionGap) {
                GeckoPageHeader(
                    title: "About Gecko", subtitle: "A little perspective on your screen time.",
                    symbol: "info.circle", color: GeckoTheme.violet
                )
                GeckoCard {
                    HStack(spacing: 24) {
                        Image("GeckoLogo").resizable().scaledToFit().frame(width: 128, height: 128)
                            .accessibilityLabel("Gecko logo")
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Gecko").font(.system(size: 34, weight: .semibold, design: .rounded))
                            Text("Screen Time & Focus Tracker")
                                .font(GeckoTheme.heading).foregroundStyle(GeckoTheme.secondary)
                            GeckoBadge(title: "Version \(appVersion) · Build \(buildNumber)", symbol: "shippingbox")
                        }
                        Spacer(minLength: 0)
                    }
                    Divider().overlay(GeckoTheme.line)
                    Text("A personal macOS app that records the apps and windows you focus on, with a synced web dashboard.")
                        .font(GeckoTheme.body).foregroundStyle(GeckoTheme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(alignment: .top, spacing: 12) {
                    feature("Stay aware", detail: "App and window context", symbol: "scope", color: GeckoTheme.accent)
                    feature("Keep your history", detail: "Sessions saved locally", symbol: "internaldrive", color: GeckoTheme.amber)
                    feature("See the bigger picture", detail: "Your synced dashboard", symbol: "chart.xyaxis.line", color: GeckoTheme.blue)
                }
                Label("Built with SwiftUI. Made for macOS.", systemImage: "swift")
                    .font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
                    .padding(.top, 4)
            }
            .padding(GeckoTheme.pageInset)
            .frame(maxWidth: 960, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private func feature(_ title: String, detail: String, symbol: String, color: Color) -> some View {
        GeckoCard {
            GeckoSymbol(symbol: symbol, color: color)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(GeckoTheme.body.weight(.semibold))
                Text(detail).font(GeckoTheme.detail).foregroundStyle(GeckoTheme.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 50, alignment: .topLeading)
        }
    }
}
