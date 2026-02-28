# Gecko Project Notes

## Release Process

This project includes both a **web dashboard** and a **Mac app** — both are versioned and released together.

### Version management
- **Single source of truth**: `/package.json` → `version` field (format: `1.2.3`)
- **Display format**: `v1.2.3` (in CHANGELOG, git tags, GitHub Releases, UI)
- **Default bump**: patch (`1.2.3` → `1.2.4`) unless user specifies otherwise
- **Locations to update** (all must match):
  1. `/package.json` — root workspace (source of truth)
  2. `/apps/web-dashboard/package.json` — web dashboard
  3. `/apps/mac-client/project.yml` — `MARKETING_VERSION` (Mac app)
  4. `/apps/mac-client/Gecko/Sources/Views/AboutView.swift` — fallback string
  5. `/apps/mac-client/Gecko.xcodeproj/` — regenerated via `xcodegen generate`

### Release steps
1. Determine new version (default: patch bump)
2. Update all version locations listed above
3. Run `xcodegen generate` in `apps/mac-client/`
4. Update `CHANGELOG.md` with changes since last tag (based on `git log`)
5. Commit: `chore: release v1.2.4`
6. Push to trigger Vercel/Railway auto-deploy
7. Tag: `git tag v1.2.4 && git push origin v1.2.4`
8. GitHub Release: `gh release create v1.2.4 --title "v1.2.4" --notes-file -` (pipe CHANGELOG section)

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

### 2026-02-28: NextAuth JWT mode — all three IDs are random UUIDs
- **Problem**: Production dashboard showed no data after deployment. The `user_id` stored in D1 (from dev) didn't match the session `user.id` on prod.
- **Root cause**: In NextAuth v5 JWT mode (no database adapter), THREE things are random UUIDs per login:
  1. `user.id` — `crypto.randomUUID()` at `oauth/callback.js:224`
  2. `token.sub` — copied from `user.id` at `callback/index.js:76`
  3. Only `account.providerAccountId` carries the stable Google OIDC `sub` claim (from `oauth/callback.js:233`)
- **Fix**: Changed jwt callback to use `account?.providerAccountId ?? token.sub` instead of `user.id`. Migrated all D1 `user_id` values to the Google sub.
- **Additional gotcha**: After deploying the fix, existing JWT session cookies still contain the old UUID. Users must sign out and sign back in to get a new token with the correct ID. Stateless JWTs are never "refreshed" — their payload is frozen at signing time.
- **Lesson**: In NextAuth JWT mode, never trust `user.id` or `token.sub` for stable identity. Always use `account.providerAccountId` which maps to the OAuth provider's stable subject identifier.

### 2026-02-28: Railway auto-deploy requires explicit GitHub repo connection
- **Problem**: `git push` to GitHub didn't trigger Railway deployments. Had to use `railway up` manually.
- **Root cause**: The Railway service was created without connecting a GitHub repo (`source.repo: null`). `railway up` uploads local files directly — it doesn't set up GitHub integration.
- **Fix**: `railway environment edit --json` to set `source.repo` and `source.branch`.
- **Lesson**: After creating a Railway service, always verify `source.repo` is set if you want push-triggered deploys. `railway up` is for manual/one-off deploys only.

### 2026-02-28: GCD DispatchSource — cannot cancel a suspended source
- **Problem**: Gecko Mac app silently crashed (EXC_BAD_INSTRUCTION) when the system went to sleep while the screen was locked.
- **Root cause**: `TrackingEngine` suspended the fallback GCD timer on screen lock (`.locked` state), then called `cancel()` on the still-suspended source when transitioning to `.asleep` or `.stopped`. GCD requires a dispatch source to be resumed before it can be cancelled — cancelling a suspended source is undefined behavior that triggers a trap.
- **Fix**: Added `isTimerSuspended` flag. `cancelFallbackTimer()` now calls `resume()` before `cancel()` when the source is suspended.
- **Lesson**: GCD dispatch sources have a suspend count. You must balance every `suspend()` with a `resume()` before calling `cancel()`. This is an easy trap because the crash only manifests under specific state transitions (lock → sleep), not during normal usage.
