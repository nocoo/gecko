# Retrospective

## 2026-10-19 — script-API Worker edits abort CI `cf deploy --strict`

Release CD for v2.0.1 failed with only vinext warnings and `cf deploy failed with exit code 1`. Dove URL/token had been converted from `plain_text` to `secret_text` with a Workers settings PATCH, so the live version's `last_deployed_from` became `api`. `cf deploy` always sets `strict: true`. In GitHub Actions (non-TTY / `CI=true`) the API-override confirm returns false and aborts. vinext pipes cf stdout, so the abort line often never reaches the job log.

Follow-up: put Worker secrets with `cf` (inherit on later deploys or `--secrets-file` on first upload). Do not PATCH `/workers/scripts/<name>/settings` before CD. After an API mutation, one successful `cf deploy` resets `source` to `cf_cli` and CI can proceed.

## 2026-10-17 — image-size must be a direct dependency for Node CI

CI L1 runs Vitest under Node. `image-size` was only an override of a vinext transitive dependency, so bun's install layout was enough for local bun tests and for vinext's own import, but Node `require("image-size")` from the security regression child process failed with `MODULE_NOT_FOUND`. Resolving the package from the parent test file used the same Node resolver and failed the same way. Add `image-size` as a direct `devDependency` so `apps/web-dashboard/node_modules/image-size` exists for Node.

## 2026-09-07 — Isolate the native unit-test host

The required native pre-commit suite stalled during application-host startup before reporting any test cases. The web gates had passed. The test target loads `Gecko.app`, whose SwiftUI initializer creates production settings, Keychain access, the shared database, and permission/tracking services.

The entry point now starts only an AppKit event loop when Xcode supplies `XCTestConfigurationFilePath`. Normal launches still enter `GeckoApp.main()`. Existing tests continue to use their injected in-memory databases, isolated preferences, and HTTP fixtures; the complete test suite remains enabled. Test builds may use a temporary ad-hoc signing configuration without replacing the installed application.

Keep hosted test startup separate from production service initialization. The existing Xcode test target and required pre-commit gate verify the test-host path.

## Earlier entries

### 2026-02-26: Signing identity matters for TCC persistence
- **Problem**: Accessibility permission dropped after every `xcodebuild` rebuild.
- **Root cause**: `CODE_SIGN_IDENTITY: "-"` (ad-hoc signing) generates a new code signature each build. macOS TCC ties Accessibility permission to the binary's code signature, so a new signature = new app = permission revoked.
- **Fix**: Changed `project.yml` to use a stable `Apple Development` signing identity with team `93WWLTN9XU` instead of ad-hoc. Now TCC records persist across builds.
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

### 2026-03-10: SwiftUI Window `.task` does not fire for LSUIElement login-item launch
- **Problem**: Mac app launched as a login item showed "Tracking Paused" in the menu bar, even though auto-start tracking was enabled. Tracking never started automatically.
- **Root cause**: `autoStartTrackingIfNeeded()` was attached via `.task` to `MainWindowView` inside a `Window` scene. With `LSUIElement = true` (agent/menu bar app), the `Window` scene's view body is not evaluated when the app starts as a login item — the window has no reason to appear, so SwiftUI defers view creation. Since the `.task` never fires, tracking never starts.
- **Fix**: Added a duplicate `.task { await autoStartTrackingIfNeeded() }` on the `MenuBarExtra` scene's view. `MenuBarExtra` is always initialized on app launch regardless of `LSUIElement` or launch method. The `TrackingEngine.start()` guard (`state == .stopped`) prevents double-start if both tasks fire.
- **Lesson**: In `LSUIElement` apps, never rely on `Window` scene lifecycle for critical startup logic. `Window` views may not be created until the window is explicitly opened. Use `MenuBarExtra` or `AppDelegate` for launch-time setup that must always run.

### 2026-03-31: vinext production build does not load instrumentation.ts
- **Problem**: Auto-analyze scheduler never ran in production — no `[AutoAnalyze]` logs at all. Deployed for hours with zero automatic analyses.
- **Root cause**: vinext's `runInstrumentation()` only runs inside the Vite dev server's `configureServer` hook (`server.ssrLoadModule()`). The production server (`vinext start` → `prod-server.js`) imports `dist/server/index.js` directly and never calls `runInstrumentation`. Since `instrumentation.ts` was the only import path for `ensureAutoAnalyze()`, the entire auto-analyze module tree was tree-shaken out of the production build.
- **Fix**: Moved `ensureAutoAnalyze()` call from `instrumentation.ts` to the analyze route module (`src/app/api/daily/[date]/analyze/route.ts`) as a module-level side effect. Route modules are eagerly bundled into `dist/server/index.js`, so the call executes at server startup.
- **Lesson**: In vinext (and likely other Vite-based Next.js alternatives), `instrumentation.ts` is a dev-only feature. For production side effects (schedulers, background tasks), place initialization calls in route modules that are guaranteed to be bundled. Always verify critical code appears in the build output with `grep` before deploying.

### 2026-05-09: better-sqlite3 NODE_MODULE_VERSION mismatch breaks all E2E tests
- **Problem**: All E2E tests returned 500 errors — every API endpoint failed silently. Pre-push hook blocked the release push.
- **Root cause**: `better-sqlite3` native addon was compiled against Node.js MODULE_VERSION 141, but the current Node.js (v24, managed via fnm) requires MODULE_VERSION 137. This happens when Node.js is upgraded (or fnm switches versions) without rebuilding native addons. The server starts fine but crashes on the first database access.
- **Fix**: `bun install --force` to rebuild native addons against the current Node.js ABI.
- **Lesson**: After any Node.js version change (fnm switch, brew upgrade, etc.), always `bun install --force` to rebuild native addons. The error is invisible until runtime — the server starts, routes register, but every DB query throws `ERR_DLOPEN_FAILED`.

### 2026-06-29: bun runtime hangs vinext's `req.json()` on large POST bodies
- **Problem**: Mac client `/api/sync` POSTs (250 sessions, ~85 KB body) hung for the full URLSession timeout in prod. Bogus API key returned 401 in <1 s; valid API key entered the handler, completed `requireApiKey()`, then `req.json()` never resolved. Spent two days chasing client-side URLSession config (ephemeral / HTTP/3 / pipelining / batch size) — every variant reproduced; same config in a shell `swift` script returned <1 s.
- **Root cause**: Dockerfile ran the runtime stage on `oven/bun:1`. `bun node_modules/vinext/dist/cli.js start` reproduces the hang locally even with vinext 0.1.8 and Node-style ReadableStream. `node node_modules/vinext/dist/cli.js start` against the *same* compiled `dist/` returns 202 in <500 ms. Bun 1.x's IncomingMessage→Web ReadableStream conversion (or its interaction with vinext's `readNodeStream` impl) drops larger bodies somewhere between auth and route-handler entry.
- **Fix**: Dockerfile runtime stage switched from `FROM oven/bun:1` to `FROM node:22-slim`; CMD switched from `bun …` to `node …`. Bun stays in the deps + build stages (it's fine for `vinext build`).
- **Lesson**: When a request hangs *inside* the handler with no error and the same code/payload works in a shell, suspect the runtime, not the code. Build-time tools (bun) and runtime (node) are two distinct decisions in a Dockerfile — keep them separate so a bug in one can be swapped without affecting the other. Repro locally by running prod build under each candidate runtime against real D1 REST before chasing client-side fixes.

### 2026-07-20: Biome useExhaustiveDependencies can delete intentional effect triggers
- **Problem**: After eslint→Biome migration, mobile sidebar no longer closed on route change.
- **Root cause**: Biome `useExhaustiveDependencies` (unsafe autofix / unused-var pressure) renamed `pathname` to `_pathname` and removed it from the effect deps. Only `setMobileOpen` remained; that setter is stable, so `setMobileOpen(false)` never re-ran after navigation.
- **Fix**: Keep `pathname` in the dependency array and reference it in the effect body (`void pathname`) so the rule treats it as used.
- **Lesson**: Effects that intentionally re-fire on a value that is not otherwise read (route key, refresh key) must **use** that value in the body. Never “fix” exhaustive-deps by dropping intentional triggers or prefixing with `_`.


## 2026-09-23 — Keep scheduler unit tests offline

The L1 repair run exercised the scheduler singleton callback without replacing its production dependencies. The test passed after the application caught an external D1 404, so assertion success hid an unintended network request. No production credentials were provided. The wiring test now spies on the singleton's tick method and asserts the callback count. The shared unit setup rejects and records every unmocked fetch, failing even when application code catches its error. Treat provider error logs as isolation defects, not harmless test output.

## 2026-09-29 — Confirm logo consumer scope before adoption

The request to apply the latest Hexly logo was initially interpreted as replacing
all consumers. Web and About assets were changed while a scope question was
pending. The owner clarified that only the macOS application icon should change.
All other edits were restored before committing. Inventory consumers first, but
wait for a requested scope decision before changing those consumers; asking a
question does not authorize its recommended answer.

## 2026-09-29 — Verify process exit independently during installation

A command-line AppKit helper requested Gecko's normal termination, then timed
out while polling its retained `NSRunningApplication.isTerminated` value. A
separate exact-path process check confirmed Gecko had exited. The helper's
`fatalError` produced an unnecessary diagnostic crash; Gecko itself did not
crash. Verify process exit independently before replacing the bundle, and use
ordinary error exits for installer checks instead of assertions that crash the
helper. The signed replacement was installed only after the process check.

## 2026-09-29 — Inspect native selection and preview sizing

The first workspace captures exposed a dark system sidebar selection underneath
custom dark text. The sidebar now owns both its selected surface and foreground,
with a selected accessibility trait and keyboard shortcuts. Initial layout tests
also assumed NSHostingView would retain the requested window height; intrinsic
content sizing shrank the menu and connection fixtures. The renderer now disables
automatic host sizing and gives the content a flexible test viewport. Inspect
both appearances and compact states, and fix the rendering assumptions instead
of weakening size assertions.

## 2026-09-29 — Verify populated sessions at the minimum window size

The workspace review covered empty Sessions at compact size and populated
Sessions only at the default size. Long titles and URLs in the nested split view
could push columns outside the 880-point viewport; a new regression fixture
reproduced columns starting at -44.5 and ending at 924.5. Checking only the root
hosting view's dimensions had missed the overflow.

The window now defaults to 1200 × 780, enforces a 1040 × 680 content minimum,
and limits the session list to 280–340 points. Layout tests check split-column
bounds and render populated compact Sessions in both appearances. Sidebar
selection preserves font weight and indicator space to avoid label movement;
the redundant central toolbar badge was removed.

The first standalone SwiftLint invocation also omitted the per-command Xcode
override and crashed while locating SourceKit. Re-running with
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` passed. Apply that
override to SwiftLint as well as Xcode tools when Command Line Tools is selected.

## 2026-09-29 — Preserve retained resolutions during dependency cleanup

Removing direct AI provider declarations exposed older transitive resolutions
when Bun regenerated the lockfile offline. The providers are still used through
`@nocoo/next-ai`, so deleting duplicate declarations must not downgrade their
installed versions. Restore the existing package records and integrity values,
then verify a frozen install and compare the complete resolved package set.
Registry-specific tarball URLs must also be removed from regenerated lockfiles
before committing. Keep cleanup separate from upgrades so each change has its
own verification evidence.

## 2026-09-30 — Bound dependency resolution and smoke assertions

Deleting provider records before an online Bun install caused unrelated
transitive packages, including Zod, to be re-resolved. Keep the generated AI
records and integrity values, restore unrelated resolutions, then verify a
frozen install before testing or committing the scoped upgrade.

The temporary production smoke initially assumed case-sensitive header names,
401 responses before the authentication proxy, and a nonredirecting `/daily`
route. Read the proxy and route contracts first: headers are case-insensitive,
unauthenticated requests redirect to login, and Daily Review redirects to a dated
page. Correct fixture assertions before classifying failures as regressions.

## 2026-10-01 — Run scoped Bun updates from the package directory

Passing a relative `--cwd` to `bun update` failed with ENOENT even though the
same option worked for `bun add`. Run updates with the process working directory
set to the package instead. Named updates also support transitive dependencies,
so provider upgrades need neither temporary direct dependencies nor deleted
lockfile records. Compare the resolved package diff before committing.

## 2026-10-01 — Scope release proxies and wait for DLP scans

The release push passed its local gates but GitHub's direct connection timed
out. Retrying with HTTP_PROXY and HTTPS_PROXY also proxied the pre-push tests'
localhost requests, producing 502 responses. Cancel the owned failed run and
use `git -c http.proxy=http://127.0.0.1:7890 push` so only Git uses the proxy.
The complete pre-push gate passed again before publication.

The DMG formatter completed, but Defender DLP temporarily blocked unmounting
its writable image. Do not terminate security processes or force unmount.
After the scan released the volume, normal `diskutil eject` succeeded; convert
the retained image to UDZO, verify its checksum, and compare the downloaded
release asset with the local artifact before claiming publication success.

## 2026-10-16 — 文档校验必须阻断提交

本轮设计文档审查把 `git diff --check &&` 文档断言与后续提交写在同一 shell
的不同命令段。Markdown 行尾空格使 diff 检查失败并跳过断言，但 shell 仍继续提交。
正常 pre-commit 门通过，不代表这项额外文档校验已运行。随后单独执行断言、复读并
修正文档，保留首个提交，不 amend。今后提交命令使用 `set -e` 或完整的 `&&`
依赖链，全部前置校验成功后才 stage/commit；整文件替换也不在同一 patch 中对同一路径
同时声明 delete/add。

## 2026-10-20 - Verify styled, hydrated pages during UI upgrades

Basalt 3.2.0 added minimum dimensions that overrode Gecko's compact icon-button
sizes. Reset those minimums only for the existing 24px and 32px variants, and
assert their rendered dimensions in the browser rather than inspecting classes.

The stronger browser checks also exposed an existing local routing failure:
the production Worker-first wildcard intercepted Vite CSS and client entry
requests, returning application 404 pages. Server-rendered headings still existed,
so the previous heading-only smoke could miss an unstyled, noninteractive app.
Keep the production routing rule restricted to production; local and isolated
test servers must let Vite serve their assets. Verify rendered CSS and hydrated
API-key actions before handing a local preview to the user.

Once hydration worked, local stats returned 500 because migrations used
`.cloudflare/local` while Vite defaulted to `.cloudflare/state`. Reuse the local
migration path in Vite, retaining the isolated test-state override. A successful
`/api/live` database probe alone does not prove that the application schema exists.

## 2026-10-20 - Remove copied UI contracts, verify interaction details

The version-only upgrade retained Gecko's copied surface tokens and hand-painted
sidebar selection. Basalt's new intrinsic button sizing also exposed flex rows
that shrink short actions until their labels wrap. Remove the duplicated color
system, use the supported green accent and native navigation/control states, and
verify actual geometry across 320px, 390px and desktop in both themes.

A CSS rewrite initially searched for the first `/*`, accidentally matching an
`@source` glob and truncating its quoted path. The dev server immediately reported
an unclosed string. Restore the complete scanner directives and use explicit
section boundaries instead of comment delimiters when rewriting CSS with globs.

Dialog input `autoFocus` runs before Radix's opening focus event, so capturing the
opener there originally captured an input about to disappear. Let Radix perform
initial focus; verify Escape restores the actual opener. API origin text must
also initialize after hydration rather than branch on `window` during render.

The final screenshots exposed a second layout problem: letting the segmented
period group wrap kept it inside the viewport but misplaced its moving selection
indicator. Keep that shared control on one line using the package's compact
spacing token. Browser acceptance must compare the indicator and selected item
rectangles, not just assert that the outer page has no horizontal overflow.

## 2026-10-20 - Keep shared controls at package defaults

The UI cleanup still retained an application-owned button size adapter, control
font and color overrides, and compact padding on the period group. These made
the result diverge from Basalt despite using its components. Remove the adapter
and duplicate presentation classes; use supported size and semantic variant props.
Fix cramped rows in their parent grid/flex layout, not by shrinking the controls.
Use InputGroup for search adornments and SidebarProvider's native overlay instead
of stripping Sheet padding to fit another sidebar inside it.

Measure the installed package before changing typography: both Gecko's navigation
and Basalt 3.2.0 resolve to 14px with a 22px line box. Do not claim that a smaller
local override is a template default. Preserve native links and verify default
control geometry, collapsed logo alignment, mobile focus return, and text wrapping
in both themes. The application-owned react-day-picker calendar retains its
specialized score-ring layout; shared Basalt popover padding stays untouched.

The final 320px screenshot caught header breadcrumb/action overlap after restoring
native icon sizes. A page can avoid horizontal overflow while its children still
collide. Show only the final breadcrumb on mobile and assert separation between
header regions; do not shrink the shared header buttons or breadcrumb typography.
