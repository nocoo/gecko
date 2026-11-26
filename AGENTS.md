# Gecko

Screen-time tracker: native macOS agent (`apps/mac-client/`, macOS 14+, SwiftUI/AppKit, Xcode 16+, XcodeGen, SwiftLint, SQLite, Keychain), web dashboard (`apps/web-dashboard/`, TS 7, React/vinext, Workers/D1, CF Access, Bun/Node), and release/gate `scripts/`.
Docs: [README.md](README.md) · [English](docs/README.en.md) · [Docs](docs/README.md) · [CI/CD](docs/15-github-cicd.md) · [Gates & Release](docs/16-quality-gates-and-release.md) · [Retrospective](Retrospective.md)

## Commands

Run from root (CI: Bun 1.4.2, Node 26.12.1). Install both graphs; only root `bun install` restores `.husky/`. Env templates: `apps/web-dashboard/.env.example` & `.dev.vars.example` (local `.env.local`/`.dev.vars` ignored). Tests need no Access/prod D1; E2E needs Chromium; `gate:security` requires `gitleaks` + `osv-scanner`; native needs Xcode + SwiftLint (`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` if CLT active).

```sh
bun install --frozen-lockfile
bun install --cwd apps/web-dashboard --frozen-lockfile
bun run dev # https://gecko.dev.hexly.ai -> 127.0.0.1:7018
bun run typecheck # S1 (web)
bun run lint # S2 (web Biome, check-only, 0 warnings)
bun run --cwd apps/web-dashboard build # B1 (web vinext bundle)
bun run test:l1 # L1 (web Vitest coverage >= 80%)
bun run gate:l1-selftest # L1 pre-commit gate probe
python3 -B scripts/pre-commit.py # local pre-commit gate
bun run test:l2 # L3 Integration (local HTTP :17018)
bun run test:l3 # L4 E2E (Playwright Chromium :27018)
bun run --cwd apps/web-dashboard gate:security # G1/G2 (gitleaks + osv-scanner + image-size)
(cd apps/mac-client && swiftlint --strict) # S2 (native)
xcodebuild -resolvePackageDependencies -project apps/mac-client/Gecko.xcodeproj -scheme Gecko -scmProvider system
xcodebuild test -project apps/mac-client/Gecko.xcodeproj -scheme Gecko -destination 'platform=macOS' -only-testing:GeckoTests
```

## Invariants

- Load prod vinext (`cloudflare.config.ts`) with Node (Bun handles install/build/test); GitHub Release deploys Worker `gecko` via `cf` with `GECKO_DEPLOY_STAGE=cron`.
- Never PATCH prod Worker settings via script API (sets `last_deployed_from=api`, aborts CI `cf deploy --strict`); keep Dove secrets on Worker `gecko` via `cf` inherit.
- Dashboard `user_id` is verified Cloudflare Access email (lowercase); Access Allow gates admission; machine APIs use device keys and Backy webhook keys.
- Keep native device keys in Keychain and queue sessions offline; tests use local SQLite, fake providers, and injected prefs—never real data or paid models.
- Use a stable Apple Development signature for TCC-sensitive builds; the Xcode test host starts only its test event loop (no prod settings, Keychain, tracking, or permissions).
- Store injected `UserDefaults` and use it in every setter; resume suspended GCD sources before cancel; put essential menubar startup in `MenuBarExtra`/`AppDelegate`, not a deferred `Window` task.
- Wire prod schedulers into bundled route startup (vinext dev instrumentation is not loaded in prod); rebuild native SQLite deps and verify runtime ABI after Node upgrades.
- Preserve intentional React effect triggers (e.g. `pathname`); never drop a trigger or apply unsafe autofix for exhaustive-dependencies warnings.
- Sync versions across root & `apps/web-dashboard` `package.json`, `apps/mac-client/project.yml` (`MARKETING_VERSION`), `Gecko/Sources/Views/AboutView.swift` fallback, and regenerated `Gecko.xcodeproj`.
- Releases/deploys require explicit authorization; check `main` ruleset before `bun run release` and verify SHA CI/Release, `/api/live`, and Cron `0 * * * *` ([Gates & Release](docs/16-quality-gates-and-release.md)).

## Quality & Local Gates

Follows `system1-quality`; CI slots & pinned `base-ci` (`v2026.19`, using `setup-playwright` for `L4` single Desktop Chromium smoke suite and `z1-gate` for `Z1`) live in `.github/workflows/quality-slots.yml` (`quality / Z1: Gate` required on `main`). Statuses: `enforced`, `planned`, `manual`, `N/A`.

- **N/A & manual**: `L2 Runtime` and `P1 Package` are `N/A` (Worker/app, not npm); native Release/DMG (`scripts/build-dmg.sh`) is `manual`.
- **Planned gaps**: native test/coverage CI & 95% target (SwiftLint runs in macOS CI; interim local test floors: 26% lines, 38% functions), GRDB dep audit, exhaustive L3 API matrix, native E2E, and pre-push stdin ref scoping are `planned`.
- **Coverage scope**: Web `L1 Unit` enforces >= 80% statements/branches/functions/lines (`apps/web-dashboard/vitest.config.ts` covers `src/**` + `worker-entry.ts`, excluding UI/app/hooks/constants and `scripts/**`).
- **Local hooks**: Root `bun install` restores `.husky/`; never use `--no-verify` or auto-fix in hooks (8-min timeout, process-group cleanup; [Gates & Release](docs/16-quality-gates-and-release.md)).
- **Hook lanes**: `pre-commit` (`scripts/pre-commit.py`) checks staged index (web `S1/S2/L1` + fail-closed native on `apps/mac-client/` or local tools); `pre-push` runs `test:l2` + `gate:security` in parallel.

## Resources & Isolation

| Lane | Endpoint / State | Boundary |
| --- | --- | --- |
| Daily web | `127.0.0.1:7018`, `gecko.dev.hexly.ai`, local Miniflare D1 | Daily local data; preserve user session, never target prod |
| L3 API (`test:l2`) | `127.0.0.1:17018`, per-run temp persist + `_test_marker` | Local HTTP; do not overlap `:7018` or `:27018` |
| L4 E2E (`test:l3`) | `127.0.0.1:27018`, per-run temp persist + `_test_marker` | Isolated Playwright storage; do not overlap `:7018` or `:17018` |
| Prod | `https://gecko.hexly.ai`, Worker `gecko` (`production`) | Read-only `/api/live` checks unless release/deploy authorized |

Vinext holds a single dev-instance lock: arrange an idle `:7018` before `test:l2`/`test:l3` without killing a user's running server. Keep `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and `CF_D1_DATABASE_ID` out of test envs; harnesses reject remote fallback and need no `-test` Worker/DB.

## Retrospective

Record incidents in [Retrospective.md](Retrospective.md); promote recurring constraints to `Invariants` and enforceable safeguards to tests/hooks.
