# Gecko Project Notes

## Retrospective

### 2026-02-26: Signing identity matters for TCC persistence
- **Problem**: Accessibility permission dropped after every `xcodebuild` rebuild.
- **Root cause**: `CODE_SIGN_IDENTITY: "-"` (ad-hoc signing) generates a new code signature each build. macOS TCC ties Accessibility permission to the binary's code signature, so a new signature = new app = permission revoked.
- **Fix**: Changed `project.yml` to use a stable Apple Development certificate (SHA-1 hash) instead of ad-hoc. Now TCC records persist across builds.
- **Lesson**: Always use a stable signing identity for development builds that require TCC permissions (Accessibility, Automation, Screen Recording, etc.). Ad-hoc signing is only safe for apps that don't need system permissions.

### 2026-02-26: SettingsManager didSet wrote to wrong UserDefaults
- **Problem**: `testCustomPathPersistedToDefaults` failed because `SettingsManager.databasePath.didSet` hardcoded `UserDefaults.standard`, but tests inject a custom suite.
- **Fix**: Added a `private let defaults: UserDefaults` instance property, used consistently in both `init` and `didSet`.
- **Lesson**: When a class accepts a dependency via init (like UserDefaults), store it and use it everywhere. Never mix injected and hardcoded instances.
