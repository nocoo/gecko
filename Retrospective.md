# Retrospective

## 2026-09-07 — Isolate the native unit-test host

The required native pre-commit suite stalled during application-host startup before reporting any test cases. The web gates had passed. The test target loads `Gecko.app`, whose SwiftUI initializer creates production settings, Keychain access, the shared database, and permission/tracking services.

The entry point now starts only an AppKit event loop when Xcode supplies `XCTestConfigurationFilePath`. Normal launches still enter `GeckoApp.main()`. Existing tests continue to use their injected in-memory databases, isolated preferences, and HTTP fixtures; the complete test suite remains enabled. Test builds may use a temporary ad-hoc signing configuration without replacing the installed application.

Keep hosted test startup separate from production service initialization. The existing Xcode test target and required pre-commit gate verify the test-host path.
