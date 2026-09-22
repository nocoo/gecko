# Vitest 5 migration

Issues [#628](https://github.com/nocoo/gecko/issues/628) and
[#631](https://github.com/nocoo/gecko/issues/631) upgrade `vitest` and
`@vitest/coverage-v8` together from 4.1.11 to 5.0.1. The provider requires the
exact matching Vitest version. No application release or production logic changes
are involved.

## Upstream and repository audit

Reviewed the [5.0 migration guide](https://vitest.dev/guide/migration), its
[5.0.1-tagged source](https://github.com/vitest-dev/vitest/blob/v5.0.1/docs/guide/migration/index.md),
and the [5.0.0](https://github.com/vitest-dev/vitest/releases/tag/v5.0.0) and
[5.0.1](https://github.com/vitest-dev/vitest/releases/tag/v5.0.1) release notes.

- Root and web are separate Bun dependency graphs. Only the web graph contains
  Vitest; root scripts explicitly run in `apps/web-dashboard`, so removal of
  ancestor config discovery does not change their behavior.
- Web already provides Vite 8.3.0. Its Node engine now matches Vitest's published
  `^22.12.0 || ^24.0.0 || >=26.0.0` range. Shared CI defaults to Node 26.8.1;
  local validation used Node 26.8.2 and Bun 1.4.0.
- The single Node/threads project uses top-level factory mocks and dynamic
  `vi.doMock`. It needs no project inheritance, shared-server, browser-mode,
  custom environment/reporter, worker-ID, benchmark, snapshot, fake-timer,
  sequential-option, or removed-entrypoint migration. Playwright runs separately.
- Retain the new `clearMocks: true` default. The full suite passes without relying
  on mock call history from previous tests. Existing async assertions were audited;
  Vitest 5 reproduced three failures in the D1 error tests before adding `await`.
  Error messages and assertions remain unchanged.
- Remove the obsolete `experimentalAstAwareRemapping` flag; AST remapping is
  already standard. Use `import.meta.dirname` for config aliases and ignore the
  new `.vitest/` artifact directory. Keep coverage HTML output in `coverage/`,
  where CI already collects it.
- Coverage include/exclude patterns remain unchanged and match project-relative
  source paths. There are no per-glob or per-file thresholds to migrate.

## Lockfile and installation

Both graphs pass frozen installation. The update used Bun with the available
Tencent npm mirror as a temporary registry override. Mirror tarball URLs were
normalized to Bun's registry-neutral empty resolution fields; integrity hashes
were preserved, including verification of both direct packages against official
npm metadata. No mirror URL is committed.

The lock removes Vitest 4's separately published runner/expect/snapshot/utils
dependencies and adopts Vitest 5's coverage libraries. Other new versions are
in the Vitest/coverage dependency closure. Babel and `supports-color` entries move
because of hoisting; their surviving versions already existed in the old graph.
The root lockfile is unchanged.

## Coverage evidence

Both versions run 851 tests in 62 files, with no unit-test skips. Both coverage
JSON reports contain exactly the same 23 source files. All four thresholds remain
95.5%; no exclusions or ignore directives were added.

| Metric | Vitest 4.1.11 | Vitest 5.0.1 |
|---|---|---|
| Statements | 790/791 (99.87%) | 789/790 (99.87%) |
| Branches | 380/392 (96.93%) | 380/392 (96.93%) |
| Functions | 175/176 (99.43%) | 175/176 (99.43%) |
| Lines | 719/720 (99.86%) | 718/719 (99.86%) |

The sole per-file count change is `src/lib/version.ts`: the exported package
version constant has one covered statement/line in the old report and no
instrumentable statements/lines in the new report. The file remains included,
and its existing version tests still run. Other per-file metric totals and
covered counts are identical; some anonymous function labels become method names.

An isolated Vitest 5 probe also checked a version module that exports the same
package constant plus a two-way function. Exercising only one branch failed the
unchanged 95.5% gates (exit 1; branches 50%, statements 66.66%, lines 50%).
Exercising both branches passed at 100% (exit 0). The constant's zero-count
mapping does not prevent subsequent executable logic from being instrumented.
These are aggregate gates, as before; they do not promise 95.5% for each file.

## Verification

Frozen installs, lint, typecheck, toolchain smoke, unit tests, coverage, production
build, L2 (88 passed, six credential-gated cases skipped), L3 (one Chromium smoke
test), and security checks (bounded image parsers, OSV, Gitleaks) all passed.

Run from the repository root:

```sh
bun install --frozen-lockfile
bun install --cwd apps/web-dashboard --frozen-lockfile
bun run lint
bun run typecheck
bun run --cwd apps/web-dashboard gate:toolchain
bun run --cwd apps/web-dashboard test
bun run test:l1
bun run --cwd apps/web-dashboard build
bun run test:l2
bun run test:l3
bun run --cwd apps/web-dashboard gate:security
```

Local commands use an external process deadline (180 seconds for unit/coverage,
240 for build/security, 300 for each HTTP/browser suite). The existing image-size
regressions also bound each parser subprocess to two seconds. L2 and L3 run
sequentially against local test SQLite, with remote D1 credentials removed from
the inherited environment and no existing server on their ports. The six
credential-gated real-LLM L2 cases remain outside automated local verification;
their existing guards are unchanged.
