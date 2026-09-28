import AppKit
import SwiftUI

enum GeckoTheme {
    static let canvas = adaptive("canvas", light: 0xF6F7F2, dark: 0x171D19)
    static let sidebar = adaptive("sidebar", light: 0xEDF1E7, dark: 0x1D2820)
    static let surface = adaptive("surface", light: 0xFFFFFF, dark: 0x222C25)
    static let inset = adaptive("inset", light: 0xF0F3EC, dark: 0x19231D)
    static let ink = adaptive("ink", light: 0x263C30, dark: 0xECF2E9)
    static let secondary = adaptive("secondary", light: 0x627065, dark: 0xACBCAC)
    static let accent = adaptive("accent", light: 0x35704C, dark: 0x9AD5A8)
    static let action = adaptive("action", light: 0x35704C, dark: 0x356E49)
    static let accentWash = adaptive("accentWash", light: 0xE1EEDD, dark: 0x2C4230)
    static let blue = adaptive("blue", light: 0x316A92, dark: 0x8CC6E6)
    static let amber = adaptive("amber", light: 0x906322, dark: 0xE5BD76)
    static let violet = adaptive("violet", light: 0x795E98, dark: 0xC4ACDF)
    static let danger = adaptive("danger", light: 0xAC443B, dark: 0xF1A097)
    static let line = adaptive("line", light: 0xDFE5DB, dark: 0x364139)

    static let pageInset: CGFloat = 24
    static let sectionGap: CGFloat = 20
    static let cardInset: CGFloat = 20
    static let radius: CGFloat = 14
    static let controlRadius: CGFloat = 8
    static let sidebarWidth: CGFloat = 204
    static let minimumWidth: CGFloat = 880
    static let minimumHeight: CGFloat = 620
    static let body = Font.system(size: 13)
    static let detail = Font.system(size: 12)
    static let caption = Font.system(size: 11)
    static let title = Font.system(size: 26, weight: .semibold, design: .rounded)
    static let heading = Font.system(size: 16, weight: .semibold)

    private static func adaptive(_ name: String, light: UInt32, dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: NSColor.Name("Gecko.\(name)")) { appearance in
            let hex = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light
            return NSColor(
                srgbRed: Double((hex >> 16) & 255) / 255,
                green: Double((hex >> 8) & 255) / 255,
                blue: Double(hex & 255) / 255,
                alpha: 1
            )
        })
    }
}

struct GeckoCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) { content }
            .padding(GeckoTheme.cardInset)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(GeckoTheme.surface, in: RoundedRectangle(cornerRadius: GeckoTheme.radius))
            .overlay {
                RoundedRectangle(cornerRadius: GeckoTheme.radius).strokeBorder(GeckoTheme.line, lineWidth: 1)
            }
    }
}

struct GeckoPageHeader: View {
    let title: String
    let subtitle: String
    let symbol: String
    var color: Color = GeckoTheme.accent

    var body: some View {
        HStack(spacing: 12) {
            GeckoSymbol(symbol: symbol, color: color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(GeckoTheme.title)
                Text(subtitle).font(GeckoTheme.body).foregroundStyle(GeckoTheme.secondary)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

struct GeckoSymbol: View {
    let symbol: String
    var color: Color = GeckoTheme.accent
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.45, weight: .medium))
            .symbolRenderingMode(.hierarchical)
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.11), in: RoundedRectangle(cornerRadius: size * 0.28))
            .accessibilityHidden(true)
    }
}

struct GeckoBadge: View {
    let title: String
    let symbol: String
    var color: Color = GeckoTheme.accent

    var body: some View {
        Label(title, systemImage: symbol)
            .font(GeckoTheme.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(color.opacity(0.10), in: Capsule())
            .fixedSize()
    }
}

struct GeckoAppGlyph: View {
    let bundleID: String?
    var size: CGFloat = 36

    var body: some View {
        if let bundleID, let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) {
            Image(nsImage: NSWorkspace.shared.icon(forFile: url.path))
                .resizable().scaledToFit().frame(width: size, height: size)
                .accessibilityHidden(true)
        } else {
            GeckoSymbol(symbol: "app.fill", color: GeckoTheme.blue, size: size)
        }
    }
}

struct GeckoTrackingButton: View {
    let isTracking: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(isTracking ? "Pause tracking" : "Start tracking", systemImage: isTracking ? "pause.fill" : "play.fill")
                .font(GeckoTheme.body.weight(.semibold))
                .frame(minWidth: 118)
        }
        .buttonStyle(.borderedProminent)
        .tint(GeckoTheme.action)
        .controlSize(.large)
        .accessibilityHint(isTracking ? "Pauses focus tracking" : "Resumes focus tracking")
    }
}
