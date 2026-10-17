# 15 — GitHub CI/CD：base-ci 质量门与 Worker 发版

> **状态**：代码已落地。CI/Release 钉 base-ci v2026.9；CD 默认 HTTP 阶段。等 GitHub environment secrets、Worker Dove secrets 与 main push。Cron 仍手开。\
> **日期**：2026-10-17\
> **范围**：GitHub Actions、生产 Worker 发布、`bun run release` 与手册事实。不改 Mac 协议。\
> **主路径**：现有 `.github/workflows/ci.yml` + 新增 `release.yml` 调用 `deploy-worker.yml`；`deploy-cli: cf`；GitHub environment `gecko / production`。\
> **退出原则**：只有 `deploy-worker.yml` 无法携带 Gecko 必填生产约束（阶段、Node 构建、D1 UUID、验活）时，才改为调用同一 SHA 的 `release-source` / `setup-js` composite；不手写平行发布栈。

docs/14 把 GitHub 自动部署排除在切流轮次之外。切流完成后，本文件是唯一的 CI/CD 合同。

## 1. 决策

| # | 题目 | 结论 |
|---|---|---|
| C1 | 共享流程 | 继续钉 `nocoo/base-ci` **v2026.9** 完整 SHA `0394178ebcff0418c442d84a84119220f31f8987`。CI 已用 `quality.yml`；CD 用 `deploy-worker.yml`。禁止浮动 tag / `v2026` 别名 |
| C2 | 触发 | 成功的 **main push CI**（`workflow_run`）自动发 Worker；`v*.*.*` tag 发同一 SHA；`workflow_dispatch` 传入已成功的 CI run id。PR / fork CI 不发 |
| C3 | CLI | `deploy-cli: cf`，`cf-version: 1.0.0-beta.13`，工作目录 `apps/web-dashboard`。不写 Wrangler、不混 `wrangler.jsonc` |
| C4 | 阶段 | CD 默认 `GECKO_DEPLOY_STAGE=http`（绑 `gecko.hexly.ai`、triggers `[]`）。未设 stage 的 production 配置会丢掉自定义域。Cron 等哥批准后再把 workflow 改成 `cron` |
| C5 | 构建 | vinext / `cloudflare.config.ts` 必须由 **Node** 加载。发布脚本 spawn `node` 跑 `@vinext/cloudflare deploy`。Bun 只做 install 与脚本宿主 |
| C6 | 迁移 | `d1-migrations: true`，`d1-databases` 用生产 UUID `f66490d2-e7b3-43e8-a30c-2b34111141d7`。共享步骤在发布前 `cf d1 migrations apply <id>`。不再走 cutover `deploy.ts --approve` |
| C7 | Dove | `DOVE_WEBHOOK_URL` / `DOVE_WEBHOOK_TOKEN` 改为 `bindings.secret()`。值留在 Worker secrets，不进 GitHub reusable workflow（后者只声明 CF token/account）。首次 CD 前由哥写入现网 secret；缺失时邮件路径静默跳过 |
| C8 | 环境 | GitHub environment 名精确为已有的 `gecko / production`。生产凭据只进该 environment：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` |
| C9 | 验活 | `GET https://gecko.hexly.ai/api/live`：HTTP 200，`status=ok`，`storage=d1`，`version` 等于该 SHA 的 `apps/web-dashboard/package.json` |
| C10 | 发版 | `bun run release` 仍只做版本面、changelog、tag、GitHub Release、DMG。Worker 由 Release workflow 发布；push 之后以该 SHA 的 Actions 与 `/api/live` 为证据 |

## 2. 现状

| 来源 | 事实 |
|---|---|
| `.github/workflows/ci.yml` | `quality.yml@0394178…`，Bun 1.4.2，`install-policy: project`，web L1/L2/L3；无 `permissions` 块 |
| `AGENTS.md` | 仍写 CI pin `ad43150…`，且「没有 GitHub deployment workflow」 |
| 生产 Worker `gecko` | 已绑 `gecko.hexly.ai`，无 Cron，`/api/live` 为 `storage=d1` version `1.13.1` |
| `cloudflare.config.ts` | `CLOUDFLARE_DEPLOY=production` 才是生产；`GECKO_DEPLOY_STAGE` 缺省时 `domains` 为空 |
| GitHub | environment `gecko / production` 已存在，当前无 secrets |
| `scripts/release.ts` | commit / tag / push / GH Release / DMG；不部署 Worker |

## 3. 目标流程

```text
push main / bun run release
        │
        ▼
   CI (quality.yml)  L1/L2/L3/G2
        │ success + push + same repo
        ▼
   Release (deploy-worker.yml)
        │ prove source-run-id or tag SHA
        │ frozen install apps/web-dashboard
        │ cf d1 migrations apply <prod uuid>
        │ GECKO_DEPLOY_STAGE=http node vinext-cloudflare deploy
        ▼
   verify /api/live version + storage=d1
```

`bun run release` 先 push main 再 push tag。main 的 `workflow_run` 是可靠发布路径；tag 任务在 CI 尚未完成时允许失败，不改 `release.ts` 去同步等待。

## 4. 要改的文件

| 路径 | 原因 |
|---|---|
| `docs/15-github-cicd.md`、`docs/README.md`、`docs/README.en.md`、`README.md` | 编号文档与入口 |
| `docs/14-vite-cloudflare-migration.md` | 删除「无 GitHub 部署」现状句，指向本文 |
| `.github/workflows/ci.yml` | `permissions: contents: read`；pin 注释与手册一致 |
| `.github/workflows/release.yml` | 调用 `deploy-worker.yml` |
| `apps/web-dashboard/scripts/cd-publish.ts` | 拒绝非 production / 非法 stage；断言域与 triggers；Node 发布 |
| `apps/web-dashboard/src/__tests__/scripts/cd-publish.test.ts` | L1 覆盖拒绝路径与 http/cron 配置 |
| `apps/web-dashboard/vitest.config.ts` | coverage include 新脚本 |
| `apps/web-dashboard/cloudflare.config.ts` | Dove 改为 `bindings.secret()` |
| `apps/web-dashboard/.dev.vars.example`、`.gitignore` | 本地 secret 示例；忽略 `.dev.vars` |
| `apps/web-dashboard/package.json` | `cd:publish` 脚本 |
| `AGENTS.md` | pin、CI/CD 命令、发版证据 |

不改 Mac 客户端、不改 Access、不在 CD 里开 Cron、不新建远程 `-test` 资源。

## 5. `release.yml` 合同

调用方保留触发与项目输入；安装、来源校验、迁移、锁、验活在 base-ci。

- `expected-workflow-path: .github/workflows/ci.yml`
- `expected-workflow-name: CI`
- `expected-branch: main`（tag 任务传 tag 名）
- `source-run-id`：仅 `workflow_run`
- `tag`：仅 tag push / 手动 tag
- `package-version-match`：tag 路径为 true
- `allowed-source-events: push`
- `require-fresh-main: true`（非 tag）
- `package-manager: bun`，`runtime-version: "1.4.2"`，`node-version: "26.8.1"`
- `working-directory: apps/web-dashboard`
- `install-policy: project`
- `deploy-cli: cf`，`cf-version: 1.0.0-beta.13`
- `d1-migrations: true`，`d1-databases: f66490d2-e7b3-43e8-a30c-2b34111141d7`
- `deploy-script`: `CLOUDFLARE_DEPLOY=production GECKO_DEPLOY_STAGE=http bun run scripts/cd-publish.ts`
- `environment: gecko / production`
- `concurrency-group: deploy-gecko-production`
- `timeout-minutes: 20`
- secrets：只映射 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`

`cd-publish.ts` 在 spawn 前用 `inspectGeneratedWorkerConfig` 断言：http 必含 `gecko.hexly.ai` 且 `triggers=[]`；cron 才允许 `0 * * * *`。测试环境变量（`GECKO_TEST_STATE` 等）拒绝发布。

## 6. 6DQ

| 维 | 计划 | 证据 |
|---|---|---|
| L1 web | 新脚本四项覆盖计入现有 95.5% 门；拒绝缺 stage、test env、http 带 Cron | `cd-publish.test.ts`；pre-commit vitest |
| L1 static | 新 TS 过 typecheck / biome；workflow YAML 跟现有 ci.yml 同样钉完整 SHA | `bun run typecheck` / `lint` |
| L2 / L3 | 不在 Actions 里打生产 HTTP 写接口；验活只用公开 `/api/live` | verify-command |
| G2 | 生产 token 只进 environment；Dove 为 Worker secret；workflow 不打印 secret | GitHub environment + `bindings.secret()` |
| D1 | CD 不用测试库、不设 `GECKO_RESOURCE_ENV=test`、不远程 `-test` | 脚本拒绝 test env |
| Build / Docs / release | 真实 vinext 生产 bundle 由 Release job 构建；发版后核对该 SHA 的 CI+Release 与 live version | Actions run + `/api/live` |

不新增 L3 浏览器登录到生产；Access 人路径仍按 docs/14 人工验收。

## 7. 原子提交

1. `docs: add github worker cicd plan`
2. `feat: publish worker from proven ci`
3. `ci: wire base-ci worker release`
4. `docs: record github worker deployment`

## 8. 哥需要配合（代码外）

1. 在 GitHub environment `gecko / production` 写入 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（Workers + D1 权限；不要用仅 D1 的 scoped token）。
2. 把现网 Dove webhook 写成 Worker secrets `DOVE_WEBHOOK_URL`、`DOVE_WEBHOOK_TOKEN`（首次 CD 前）。本地用 `.dev.vars`，不要提交。
3. 授权把含 workflow 的 main **push** 上去之后，CI/CD 才会真正跑。本轮不擅自 push。
4. Cron 仍等 HTTP/浏览器/Mac 同步验收后，再改 `GECKO_DEPLOY_STAGE=cron` 并批准一次 Release。

## 9. 验收

- main 上一次成功 CI 的 `workflow_run` 打出 Release，`target-sha` 等于该 commit。
- `https://gecko.hexly.ai/api/live` 的 `version` 等于该 commit 的 package version，`storage=d1`。
- `cf workers get gecko` 无 Cron，域仍是 `gecko.hexly.ai`。
- PR 的 CI 不发生产。
- `bun run release` 打出的 tag 对应同一 SHA；Worker 不靠本机 `cutover-cf deploy`。
