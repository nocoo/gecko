# 16 · Quality Gates & Release Operations

Operational runbook for Gecko's local Git hooks, pre-commit selftest probes, native/web quality boundaries, coordinated version release, and macOS DMG packaging. CI slot definitions live in `.github/workflows/quality-slots.yml`; Worker CD contract lives in `.github/workflows/release.yml` and [15-github-cicd.md](15-github-cicd.md).

## Local Pre-commit Gate (`scripts/pre-commit.py`)

`.husky/pre-commit` executes the staged revision of `scripts/pre-commit.py` directly from the Git index (`git show :scripts/pre-commit.py`), installed via root `bun install` (`"prepare": "husky"`).

- **Execution discipline**: Never use `--no-verify` on commits or pushes. Hooks are strictly check-only (never auto-fix or re-stage), run against an isolated `git checkout-index` snapshot with symlinked `node_modules` and per-run cache directories, enforce an 8-minute hard timeout (`480s`), and clean up owned process groups (`SIGTERM` → `SIGKILL`) and temporary directories on failure or cancellation.
- **Self-check first**: Runs `scripts/test_pre_commit.py` inside the staged snapshot before executing language lanes.
- **Web lane** (`apps/web-dashboard`):
  - `bun run lint` (Biome `--error-on-warnings`, 0 errors / 0 warnings).
  - `bun run typecheck` (`cf workers types`, `vinext typegen`, `tsc --noEmit`, `tsc --noEmit -p tsconfig.tools.json`).
  - `bun run test:coverage --allowOnly=false` (Vitest v8 coverage >= 95.5% across statements, branches, functions, and lines; JSON report check fails closed on empty runs or skipped/todo/focused tests).
  - Coverage scope and exclusions are defined in `apps/web-dashboard/vitest.config.ts` (excludes `src/proxy.ts`, `src/app/**`, `src/components/**`, `src/hooks/**`, `src/lib/palette.ts`, `src/lib/chart-config.ts`, `src/services/prompt-defaults.ts`).
- **Native lane** (`apps/mac-client`):
  - Required when staged paths touch `apps/mac-client/` — missing `swiftlint`, `xcodebuild`, or `xcrun` fails closed with exit `1`.
  - When `apps/mac-client/` is not staged, macOS dev machines still run native checks if all native tools are available in `PATH` (`DEVELOPER_DIR` defaults to `/Applications/Xcode.app/Contents/Developer`).
  - Unverified end-to-end on Linux CI.
  - Copies pre-resolved `SourcePackages` (checking `checkouts/GRDB.swift` under `~/Library/Developer/Xcode/DerivedData/Gecko-*/SourcePackages`, using APFS `cp -cR` on macOS and `shutil.copytree` on Linux).
  - Runs `swiftlint lint --strict`, `xcodebuild test -scheme Gecko -only-testing:GeckoTests` with ad-hoc signing (`CODE_SIGN_IDENTITY=-`), validates `xcresulttool` summary/tree (no failures, runtime warnings, or unexpected skips), and checks `xcrun xccov` against interim regression floors (**lines >= 26%**, **functions >= 38%**; governance target remains 95%; Swift toolchain does not emit statement/branch percentages).

### Pre-commit Selftest Probe (`bun run gate:l1-selftest`)

`bun run gate:l1-selftest` (also enforced in CI job `l1-gate`) exercises `scripts/pre-commit.py` in quiet probe mode with Linux-safe `SourcePackages` copy against negative cases:

- Unit test failure and coverage floor regression
- Biome lint error/warning and TypeScript type error
- Focused (`.only`) or skipped tests
- Staged-bad vs. unstaged-good index mismatch
- Gate timeout, malformed JSON test report, and missing required tools

Historical baseline Linux CI/agent VM probe snapshot (web-only): statements **99.21%**, branches **96.28%**, functions **98.17%**, lines **99.62%** (floor 95.5%); warm web stage ~10–11s per probe (target < 30s for web-only; full macOS hook including `xcodebuild` not yet benchmarked).

## Local Pre-push Gate (`.husky/pre-push`) & Planned Gaps

`.husky/pre-push` runs two web gates in parallel inside `apps/web-dashboard`:

- `bun run test:l2` — L3 Integration: real local HTTP on `127.0.0.1:17018` with per-run isolated Miniflare D1 persist (`_test_marker`, rejects remote fallback). Stop daily `:7018` before running because vinext holds a single dev-instance lock.
- `bun run gate:security` — runs `image-size` parser regression test, `osv-scanner` against `apps/web-dashboard/bun.lock`, and `gitleaks` against `.gitleaks.toml`. Missing `osv-scanner` or `gitleaks` fails closed.

Browser E2E (`bun run test:l3` / `bun run test:e2e:bdd`, Playwright Chromium on `:27018`) runs in CI (`L4: E2E`) and on-demand rather than in `pre-push`.

Tracked `planned` gaps:

- Pre-push validation of commits named by stdin push refs within < 3 min.
- Exhaustive endpoint/method coverage and server-identity verification in L3 Integration.
- Native macOS CI execution, 95% native coverage target, GRDB Swift package dependency audit (`G2` native), and desktop system E2E journeys (tracking, sleep/lock, permissions, sync).

## Coordinated Release & DMG Packaging

Authorized maintainers run `bun run release`:

```sh
bun run release              # patch bump (default)
bun run release -- minor     # minor bump
bun run release -- major     # major bump
bun run release -- 2.0.0     # explicit version
bun run release -- --dry-run # preview without side effects
```

1. **Check `main` branch protection first**: run `gh api repos/nocoo/gecko/rules/branches/main`. When `quality / Z1: Gate` is required on `main`, a direct push from `bun run release` will be declined — merge the version bump via PR first, then tag/release the merged commit (see [Retrospective.md](../Retrospective.md)).
2. **Synchronized version locations**: `scripts/release.ts` updates root `package.json`, `apps/web-dashboard/package.json`, `apps/mac-client/project.yml` (`MARKETING_VERSION`), and `apps/mac-client/Gecko/Sources/Views/AboutView.swift` fallback, then regenerates `apps/mac-client/Gecko.xcodeproj` with XcodeGen, updates `CHANGELOG.md`, tags `v<version>`, creates the GitHub Release, and uploads the DMG.
3. **DMG packaging (`scripts/build-dmg.sh`)**:
   - Builds Release `Gecko.app` under `build/derived` (requires the intended Apple Development signing identity; verifies `Info.plist` version and `codesign --verify --deep --strict`).
   - Packages with `hdiutil create -srcfolder ... -format UDZO` without mounting a temporary volume and validates with `hdiutil verify`.
   - Refuses to overwrite an existing `build/Gecko-<version>.dmg`, preserves existing build artifacts, and retains each `build/dmg-<version>.*` staging directory under ignored `build/`.

## Worker CD & Post-Release Verification

`bun run release` does not deploy the Cloudflare Worker. Successful `main` push CI (or `v*.*.*` tag push referencing a proven `main` CI SHA) deploys Worker `gecko` through `.github/workflows/release.yml` (`deploy-worker.yml`, `cf`, `GECKO_DEPLOY_STAGE=cron`, D1 migrations against the production UUID). Production credentials live in GitHub environment `gecko / production`; Dove webhook URL/token remain on Worker `gecko` as Worker secrets via `cf` inherit.

After every release, verify:

1. Exact commit SHA's CI (`quality / Z1: Gate`) and Release workflow runs succeeded.
2. `GET https://gecko.hexly.ai/api/live` returns HTTP `200`, `status: "ok"`, `storage: "d1"`, and `version` matching the released commit.
3. Cron trigger `0 * * * *` remains active on Worker `gecko`.
