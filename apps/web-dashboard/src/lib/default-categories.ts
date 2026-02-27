// Default category definitions and bundle_id → category auto-mapping rules.
// Used by the seeding logic to bootstrap a new user's categories.

/** Shape of a default category to seed. */
export interface DefaultCategoryDef {
  /** Stable slug (used as part of the category ID) */
  slug: string;
  /** Display title */
  title: string;
  /** Lucide icon name */
  icon: string;
}

/**
 * The 4 built-in default categories.
 * Order matters — they are inserted in this order.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategoryDef[] = [
  { slug: "system-core", title: "System Core", icon: "cpu" },
  { slug: "system-app", title: "System App", icon: "monitor" },
  { slug: "browser", title: "Browser", icon: "globe" },
  { slug: "application", title: "Application", icon: "app-window" },
] as const;

/**
 * Known bundle_id → default category slug mappings.
 * On first access, these are auto-inserted into app_category_mappings
 * so users get sensible defaults without manual setup.
 *
 * Only includes bundle IDs that are very commonly seen on macOS.
 * Users can override any mapping later.
 */
export const BUNDLE_ID_MAPPINGS: ReadonlyMap<string, string> = new Map([
  // ── system-core: low-level system processes ──
  ["com.apple.loginwindow", "system-core"],
  ["com.apple.WindowServer", "system-core"],
  ["com.apple.hiservices-xpcservice", "system-core"],
  ["com.apple.CoreServices.launchservicesd", "system-core"],
  ["com.apple.systemuiserver", "system-core"],
  ["com.apple.dock", "system-core"],
  ["com.apple.Spotlight", "system-core"],
  ["com.apple.notificationcenterui", "system-core"],
  ["com.apple.controlcenter", "system-core"],

  // ── system-app: Apple-bundled applications ──
  ["com.apple.finder", "system-app"],
  ["com.apple.ActivityMonitor", "system-app"],
  ["com.apple.systempreferences", "system-app"],
  ["com.apple.SystemPreferences", "system-app"],
  ["com.apple.Terminal", "system-app"],
  ["com.apple.dt.Xcode", "system-app"],
  ["com.apple.Preview", "system-app"],
  ["com.apple.TextEdit", "system-app"],
  ["com.apple.iCal", "system-app"],
  ["com.apple.AddressBook", "system-app"],
  ["com.apple.mail", "system-app"],
  ["com.apple.MobileSMS", "system-app"],
  ["com.apple.FaceTime", "system-app"],
  ["com.apple.Photos", "system-app"],
  ["com.apple.Music", "system-app"],
  ["com.apple.Podcasts", "system-app"],
  ["com.apple.TV", "system-app"],
  ["com.apple.news", "system-app"],
  ["com.apple.Maps", "system-app"],
  ["com.apple.reminders", "system-app"],
  ["com.apple.Notes", "system-app"],
  ["com.apple.stocks", "system-app"],
  ["com.apple.Home", "system-app"],
  ["com.apple.weather", "system-app"],
  ["com.apple.Passwords", "system-app"],
  ["com.apple.AppStore", "system-app"],
  ["com.apple.calculator", "system-app"],
  ["com.apple.ScreenSaver.Engine", "system-app"],
  ["com.apple.ScreenSharing", "system-app"],
  ["com.apple.KeyboardSetupAssistant", "system-app"],
  ["com.apple.DiskUtility", "system-app"],
  ["com.apple.Console", "system-app"],
  ["com.apple.ScriptEditor2", "system-app"],
  ["com.apple.Automator", "system-app"],
  ["com.apple.ColorSyncUtility", "system-app"],
  ["com.apple.VoiceMemos", "system-app"],

  // ── browser: web browsers ──
  ["com.apple.Safari", "browser"],
  ["com.google.Chrome", "browser"],
  ["org.mozilla.firefox", "browser"],
  ["com.microsoft.edgemac", "browser"],
  ["company.thebrowser.Browser", "browser"], // Arc
  ["com.brave.Browser", "browser"],
  ["com.operasoftware.Opera", "browser"],
  ["com.vivaldi.Vivaldi", "browser"],
  ["org.chromium.Chromium", "browser"],
  ["com.nickvision.nicegx", "browser"], // GNOME Web (rare on mac)
  ["com.nickvision.nicegx.browser", "browser"],

  // ── application: common third-party apps ──
  ["com.microsoft.VSCode", "application"],
  ["dev.zed.Zed", "application"],
  ["com.sublimetext.4", "application"],
  ["com.jetbrains.intellij", "application"],
  ["com.jetbrains.WebStorm", "application"],
  ["com.jetbrains.CLion", "application"],
  ["com.jetbrains.rider", "application"],
  ["com.jetbrains.pycharm", "application"],
  ["com.jetbrains.goland", "application"],
  ["com.jetbrains.rustrover", "application"],
  ["com.todesktop.230313mzl4w4u92", "application"], // Cursor
  ["com.tinyspeck.slackmacgap", "application"],
  ["com.microsoft.teams2", "application"],
  ["us.zoom.xos", "application"],
  ["com.hnc.Discord", "application"],
  ["com.spotify.client", "application"],
  ["com.openai.chat", "application"],
  ["com.figma.Desktop", "application"],
  ["com.linear", "application"],
  ["com.notion.Notion", "application"],
  ["md.obsidian", "application"],
  ["com.1password.1password", "application"],
  ["com.bitwarden.desktop", "application"],
  ["com.adobe.Photoshop", "application"],
  ["com.adobe.illustrator", "application"],
  ["com.adobe.Lightroom", "application"],
  ["com.postmanlabs.mac", "application"],
  ["com.insomnia.app", "application"],
  ["io.alacritty", "application"],
  ["com.mitchellh.ghostty", "application"],
  ["com.googlecode.iterm2", "application"],
  ["net.kovidgoyal.kitty", "application"],
  ["org.tabby", "application"],
  ["com.docker.docker", "application"],
  ["org.virtualbox.app.VirtualBox", "application"],
  ["com.github.GitHubClient", "application"],
  ["com.electron.replit", "application"],
  ["com.readdle.smartemail-macos", "application"],
  ["com.freron.MailMate", "application"],
]);
