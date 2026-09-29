# Native workspace

Gecko's macOS interface uses a persistent sidebar and a shared tracking toolbar.
The visual references are Showtime's compact controls, Falcon's colored workspace
navigation, and Lyre's native split views. Gecko keeps its own warm paper, moss,
amber, blue and violet palette, with adaptive light and dark values in
`GeckoTheme.swift`. The minimum content size is 1040 × 680; the default is
1200 × 780. The window enforces its content minimum when resized or restored.
No third-party UI dependency is required.

## Feature map

| Existing capability | Presentation |
| --- | --- |
| Start and stop tracking | Persistent window toolbar, paused Tracking card, and menu-bar panel |
| Current app, window and browser URL | Live focus card with the application's native icon |
| Accessibility reset/request and settings | Accessibility card on Tracking |
| Automation request and settings | Automation card on Tracking |
| Recent 50 records, refresh and timestamps | Sessions list, with selected record details and readable URLs |
| Launch at login and automatic tracking | Settings → Everyday |
| Database path, browse, save and reset | Settings → Local storage |
| API key, HTTPS server URL and sync toggle | Settings → Cloud sync |
| Pending count, batch progress, last success and errors | Cloud sync status, using existing service state |
| Manual sync and guarded reset | Cloud sync actions with the existing view-model guards |
| Version, build and logo | About, using the approved Hexly textured artwork |
| Dashboard, About and quit from the menu bar | Compact SwiftUI panel, also providing Sessions and Settings shortcuts |

Command-1 through Command-4 select sidebar pages. The native sidebar toggle,
window controls and Settings scene remain available. Long content scrolls;
Settings places its first two cards side by side only when they fit. Session
selection survives refresh when its record remains in the latest 50.
The session list stays between 280 and 340 points wide to leave room for details.
Sidebar selection changes color and background while preserving font weight and
indicator space. The toolbar keeps the tracking action without a central status badge.

The application remains a menu-bar agent (`LSUIElement=true`). Its bundle ID,
signature identity, AppIcon, menu-bar template, database schema, tracking engine,
permission service, Keychain storage and sync behavior are unchanged. Opening a
permission page does not add a permission request; buttons invoke the existing
actions. URL links display their full value in help and in the session details.

## Presentation and verification

`MainWindowView` connects the existing view models to `GeckoWorkspace`.
`TrackingContent` and `GeckoMenuContent` take values and actions, so the production
views can be rendered without constructing a tracking engine or permission
service. Settings continues to use `SettingsViewModel`; its sync card is a
separate view without duplicated sync logic.

`NativeLayoutTests` renders the production views in AppKit windows. Fixtures use
an in-memory database, synthetic sessions and a unique preferences suite;
SettingsManager's injected initializer disables Keychain and login-item access.
No permission service, tracking engine or network sync service is constructed.
Images are captured from the test's own view using AppKit, without screen-recording
or Accessibility permission. The suite covers both appearances, compact missing
permissions, empty sessions, connection validation, and the menu panel. PNG
attachments are retained in the Xcode test result for visual review.
Populated Sessions also renders long titles and URLs at the minimum window size;
split-view columns must remain inside the rendered viewport.

Run from the repository root with full Xcode selected per command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild test \
  -project apps/mac-client/Gecko.xcodeproj -scheme Gecko \
  -destination 'platform=macOS' -only-testing:GeckoTests
```

The snapshots exercise real view construction and size constraints. They do not
certify every keyboard, VoiceOver or macOS permission interaction. Tracking and
sync regression coverage remains in the existing native suites.
