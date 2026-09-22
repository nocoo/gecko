# Gecko

Screen-time tracking with a native macOS agent, synchronized web dashboard and analysis tools.
Profile: native-hybrid, with Swift and TypeScript lanes.
Direction: [README.md](README.md). Frameworks must not rewrite this file.

## Sources of Truth

This file is the contract; hooks, CI and configuration enforce it. Raise weaker enforcement instead of lowering this contract.

| Fact | Where |
|---|---|
| Human docs | [README.md](README.md), [English guide](docs/README.en.md) and numbered architecture/feature docs |
| Version | Root/web `package.json`; Mac `project.yml` `MARKETING_VERSION`, `Gecko/Sources/Views/AboutView.swift` fallback and regenerated `Gecko.xcodeproj` must match |
| Enforcement | `.husky/`, `.github/workflows/ci.yml`, web Vitest/Playwright configs, Xcode `GeckoTests` |
| Local secrets | Ignored web `.env.local`; Google/NextAuth variables and optional remote D1 credentials; native keys in Keychain |
| Machine rules / accidents | Global `AGENTS.md` and `rules/`; [Retrospective.md](Retrospective.md) |

## Project Invariants

- Production vinext runs on Node, not Bun: large authenticated POST bodies hang under the Bun runtime. Bun remains the install/build/test tool; preserve the Dockerfile's Node runtime stage.
- Google identity uses stable `account.providerAccountId`, not the random JWT-mode `user.id` / initial `token.sub`. A changed identity callback requires existing users to sign in again. Preserve the email allowlist; an empty `ALLOWED_EMAILS` currently permits every successful Google login.
- Native device keys stay in Keychain; local sessions remain queued through network outages. Tests use local SQLite, fake providers and injected preferences rather than real user data or paid model calls.
- Use a stable Apple Development signature for installed TCC-sensitive builds. The unit-test host must start only its test event loop, without production settings, Keychain, tracking or permission services.
- Store injected `UserDefaults` and use it in every setter. Resume a suspended GCD source before canceling it; essential menubar startup belongs in `MenuBarExtra` / AppDelegate, not a deferred Window task.
- Production schedulers must be reachable from bundled route startup; vinext's development instrumentation is insufficient. After a Node change, rebuild native SQLite dependencies and verify their runtime ABI.
- Preserve intentional React effect triggers such as pathname. Never drop a trigger or apply unsafe autofix to silence an exhaustive-dependencies warning.

## Stack / Layout

| Component | Choice |
|---|---|
| Web | TypeScript 7, React/vinext, NextAuth, Node ≥22.12; Bun install/scripts, CI Bun 1.4.2 |
| Native | macOS 14+, SwiftUI/AppKit, Xcode 16+, XcodeGen, SwiftLint |
| Data | Local SQLite or explicit Cloudflare D1 REST mode; native SQLite and Keychain |
| `apps/web-dashboard/` | App/API, services, database adapters, Vitest and HTTP/browser suites |
| `apps/mac-client/` | Native app, `project.yml`, generated Xcode project and tests |
| `scripts/` | Coordinated version release and DMG packaging |

## Commands

Run each line from the root. Install both dependency graphs; only the root install restores the repository's Husky wrappers. Web tests need no real OAuth or D1 credential; browser tests require Chromium. Native tests require full Xcode and SwiftLint; when Command Line Tools is selected, use the per-command `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` override.

```bash
bun install --frozen-lockfile
bun install --cwd apps/web-dashboard --frozen-lockfile
bun run typecheck
bun run lint
bun run --cwd apps/web-dashboard build
bun run test:l1
bun run test:l2
bun run test:l3
bun run --cwd apps/web-dashboard gate:security
(cd apps/mac-client && swiftlint --strict)
xcodebuild -resolvePackageDependencies -project apps/mac-client/Gecko.xcodeproj -scheme Gecko -scmProvider system
xcodebuild test -project apps/mac-client/Gecko.xcodeproj -scheme Gecko -destination 'platform=macOS' -only-testing:GeckoTests
```

The L2/L3 entrypoints initialize `.local/gecko-test.db` in the web package and set `D1_LOCAL_PATH` plus test-auth variables. `db:init` deletes its selected database before rebuilding it: never pass a production or daily-dev path. Keep `CF_ACCOUNT_ID`, `CF_API_TOKEN` and `CF_D1_DATABASE_ID` out of automated test environments. Gitleaks/OSV and the SQLite native ABI must be available.

## Verification

6DQ retains its name. Former G1 is merged into L1; L2/L3, G2 and D1 retain their scope. Status: `enforced`, `planned`, `manual`, `N/A`.

| Dimension | Required proof | Status | Current enforcement / gap |
|---|---|---|---|
| L1 web | Statements, branches, functions and lines each ≥95.5%; no skipped/focused tests | planned | The index-snapshot commit gate enforces four 95.5% thresholds, rejects focused/skipped/empty suites, and checks real test reports |
| L1 native | Measurable statements/branches/functions/lines each ≥95%; no skipped/focused tests | planned | Required unsigned GeckoTests use isolated DerivedData and cloned GRDB dependencies. Xccov measures all application files; interim lines 26% / functions 38% regression floors remain below the unchanged 95% target. Statements/branches are unsupported by Swift; no native CI lane |
| L2 API | Real local HTTP over 100% of endpoint/method combinations | planned | Push/CI run real vinext/SQLite suites; exhaustive endpoint/method and server-identity checks are not enforced |
| L3 web | Critical dashboard journeys in Chromium | enforced | CI and root `test:l3` / `test:e2e:bdd` use Playwright |
| L3 native | Tracking, sleep/lock, permissions and sync as user journeys | planned | Native unit tests exist; complete desktop system acceptance is not enforced |
| L1 static web | Strict types and check-only lint, zero errors/warnings | planned | Commit runs check-only types/lint and import-time toolchain smoke; vinext regenerates route types from the snapshot |
| L1 static native | Warnings-as-errors compilation and strict SwiftLint | planned | Local hook requires native tools and uses compiler warnings as errors plus strict SwiftLint; CI covers only web |
| G2 web | Dependency and secret scans; missing tools fail | enforced | Push scans the web lock/history and image-size regression; shared CI security also scans root dependencies |
| G2 native | Native dependency vulnerabilities and repository secrets scanned | planned | Repository secret scanning exists; the GRDB Swift package lacks a dependency audit gate |
| D1 isolation | Per-run local files/preferences and guarded fixture/reset/cleanup | planned | Web suites share a fixed test DB and may reuse servers; `db:init` removes arbitrary supplied paths without a test marker/guard |
| Build | Real vinext bundle and native executable | manual | Web `build`, Xcode build/test; native packaging via `scripts/build-dmg.sh` |
| Docs / release | Synchronized web/native versions and publication proof | manual | README/changelog and maintainer review |

| Hook | Current behavior | Required follow-up |
|---|---|---|
| pre-commit | Staged Python gate; isolated index snapshot and cache directories; check-only web/native tests, coverage, strict checks and fail-closed tools/reports | Raise native coverage to 95%, resolve unsupported Swift metrics, improve toward <30s |
| pre-push | Web L2 and G2 in parallel | Validate commits named by stdin push refs, <3min |

Never use `--no-verify` on commits or branch pushes. Hooks never auto-fix or re-stage. Gate execution is bounded to eight minutes and owned process groups/temporary outputs are cleaned on failure or cancellation. CI pins shared workflows at `ad43150de3a2be2fa464b5cd2f921dc4fa9f8f0f`.

## Resources / Isolation

| Lane | Port / store | Boundary |
|---|---|---|
| Daily web | 7018, `gecko.dev.hexly.ai` | Explicit local development DB or optional remote D1; never an automated target |
| L2 | 17018, web `.local/gecko-test.db` | Local HTTP; fixed database and existing-server reuse remain gaps |
| L3 | 27018, same test DB | Browser lane needs its own fresh storage; do not overlap L2 |

Vinext has a single development-instance lock. Arrange an idle local server before L2/L3; do not terminate a user's 7018 session to force a gate through. Required harnesses allocate verified per-run SQLite paths, reject remote fallback and guard resets/cleanup. No remote `-test` Worker/database is required.

## Operations / Release

Authorized maintainers use `bun run release` (patch default; `-- minor`, `-- major`, explicit version, or `-- --dry-run`). It updates all version locations, regenerates the Mac project with XcodeGen, prepares changelog/tag/Release and builds/uploads the DMG; packaging also needs `create-dmg` and the intended signature.
The repository has no GitHub deployment workflow. Verify the actual hosting connection before treating a push as a web deployment, then check the deployed version and sync behavior. Preserve coordinated web/Mac releases and the normal gates.

## Retrospective

All original dated narratives are preserved in [Retrospective.md](Retrospective.md), including native test-host isolation. Keep only recurring project rules here, cross-project lessons in global rules/nmem and deterministic requirements in hooks/tests.
