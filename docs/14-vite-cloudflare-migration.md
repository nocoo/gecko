# 14 — vinext 直接部署 Cloudflare，Google 迁 Access

> **状态**：设计审查修订；D1 / D2 已确认，D3 / D5 待哥决策；尚未实施或完成 workerd 验收。\
> **日期**：2026-10-16\
> **范围**：Web 控制台与托管。保留 Mac 同步路径、JSON、API key 和批次大小。\
> **主路径**：vinext App Router + `@cloudflare/vite-plugin` + D1 binding + Access。\
> **退出原则**：只有证明是 vinext 集成阻塞、且 Hono 能消除阻塞，才另审 Vite SPA + Hono 方案；不自动重写。

Gecko 已经使用 Vite；缺的是 Workers 目标，不是 SPA 路由器。本文描述迁移后的唯一运行路径，不保留 Node 服务端、D1 REST 或 NextAuth 兼容层。当前线上 Node 构建在切换验收前继续服务，不能为了接插件先破坏可运行版本。

## 1. 决策与证据边界

| # | 题目 | 结论与约束 |
|---|---|---|
| D1 | 目标形态 | **已确认：vinext 直接部署 Workers**；保留 `src/app` 页面和 Route Handler |
| D2 | 人的登录 | **已确认：Cloudflare Access**；删除 Google OAuth / NextAuth；Access Allow 策略接替原邮箱准入限制，不能变成允许所有身份 |
| D3 | `user_id` | **待确认**。推荐经验证的 Access email 小写，便于跨应用识别；代价是邮箱变更/重新分配会影响归属。备选 Access `sub`，减少邮箱变化影响，但仍须确认 Access 身份生命周期并做一次性映射。两者都不能从 Google ID 自动推导 |
| D4 | `POST /api/sync` | 请求内完成持久写入后仍返回 **202** 和 `{ accepted, sync_id }`；增强持久性，不新增异步队列协议 |
| D5 | CLI / 配置 | **待确认**。基于当前锁定版本，推荐 Wrangler + `wrangler.jsonc`；备选升级并验证 vinext 的 `cf` + `cloudflare.config.ts` 工具链。后者符合在线文档方向，但目前未在 Gecko 验证，不能混用两套字段、类型或部署命令 |

### 1.1 本轮核对的事实

| 来源 | 已核对内容 / 证据限制 |
|---|---|
| Gecko `4493bed` | `apps/web-dashboard/package.json`：vinext `1.0.0-beta.0`、Vite `8.3.1`、next-ai 实装 `0.4.0`；未安装 Cloudflare Vite 插件 |
| 已安装 `apps/web-dashboard/node_modules/vinext/dist/init-cloudflare.js` | 初始化器创建/更新 **`wrangler.jsonc`**，App Router 插件设置 `name: "rsc", childEnvironments: ["ssr"]`；不能声称这个版本生成 typed config |
| 已安装 `vinext/package.json`、`dist/server/app-router-entry.js` / `.d.ts` | 导出 `vinext/server/app-router-entry`，默认对象有 `fetch(request, env, ctx)`；自定义入口应组合该对象，而非仅增加命名 `scheduled` 导出 |
| [vinext 当前 Cloudflare 文档](https://vinext.dev/docs/deploying/cloudflare)（本轮读取） | 已描述 `cf`、插件 v2、`cloudflare.config.ts`、`@vinext/cloudflare deploy`、`.cloudflare/types`；**比当前安装包的初始化器新**，不能直接套到锁定版本 |
| GeekHub `8226bd0` | `../geekhub/src/worker/auth.ts`、`scripts/run-tests.ts`、`scripts/verify-test-bindings.ts`、`vite.config.ts`、`wrangler.jsonc`；实装插件 `1.63.1` 的类型有 `persistState` / `remoteBindings` / `inspectorPort` / RSC child environments |
| Giraffe `ac2d1e3` | `../giraffe/apps/web/src/server/index.ts`、`middleware/access.ts`、`../giraffe/docs/11-agent-api.md`：机器 API 独立鉴权，专用 Access 路径应用，不扩大 dashboard bypass |
| 本机 `cf 1.0.0-beta.13` | `cf cli search`、`cf workers types --help`、`cf d1 migrations apply --help`；后者接受 **数据库 ID**，不是 Wrangler 的 binding/name 参数 |
| 现有库身份 | `docs/01-database-schema.md`、`docs/03-data-sync.md` 记录 `gecko` / `f66490d2-e7b3-43e8-a30c-2b34111141d7`；本轮未查询线上账号、schema、迁移账本或 Access 策略 |

本轮仅审文档和源码，不访问私钥、真实用户数据，不执行初始化、远程迁移、Access 修改或部署。已核对的 API 不等于 Gecko 的生产 bundle 已通过验证；第 9 节的实施门槛仍须实际完成。

## 2. 现状与目标

以下 Web 相对路径均以 `apps/web-dashboard/` 为根；仓根路径明确加“仓根”。

| 层 | 现在的真实路径 / 行为 | 目标与原因 |
|---|---|---|
| 页面 / API | `vite.config.ts` 只有 `vinext()`；`src/app/**` | 保留 App Router，增加 Cloudflare RSC 运行环境，不搬成 `src/web` + `src/worker` |
| 托管 | `Dockerfile`：Bun 构建、`node:22-slim` 运行 `vinext start :7018`；历史 Railway 部署 | Worker `gecko` / `gecko.hexly.ai`；实际旧托管连接须切换前确认 |
| 数据 | `src/lib/d1.ts`：远程 D1 REST 或本地 `better-sqlite3` | 单一 `env.DB`；本地也用 Miniflare D1，消除原生 SQLite ABI 和业务 CF token |
| 人的身份 | `src/auth.ts`：Google `account.providerAccountId`；空 `ALLOWED_EMAILS` 当前允许全部 Google 登录 | Access JWT + 明确 Allow 策略；D3 映射完成才开放控制台 |
| 机器身份 | `src/lib/api-helpers.ts`：API key；`src/app/api/backy/pull/route.ts`：`X-Webhook-Key` | 两种机器凭据各自保留，不要求 Mac / Backy 携带 Access service token |
| 同步 | `src/app/api/sync/route.ts` 先 202，`src/lib/sync-queue.ts` 内存队列每 2s drain | 请求内写入成功才 202，避免 isolate 回收丢数据 |
| 自动分析 | `src/instrumentation.ts` **及** `src/app/api/daily/[date]/analyze/route.ts` 调 `ensureAutoAnalyze()`，最终 `setInterval` | 默认 Worker 导出的 `scheduled`，Cron `0 * * * *`；删掉两个启动点 |
| 健康 | `src/app/api/live/route.ts`：200/503、`no-store`、数据库探测、`process.uptime()` | 保持健康/失败语义；删进程 uptime，加 `storage: "d1"`，保留 version/component/timestamp/database |
| 本地 / 测试 | 日常 7018；L2 17018 / L3 27018 共享 `.local/gecko-test.db`，可复用已有服务器 | 日常仍 7018 / Caddy `gecko.dev.hexly.ai`；L2/L3 各自独立目录、DB、进程与 run ID |

目标流量：浏览器经 Access 到 vinext；Mac `/api/sync` 与 `/api/v1/*` 走 API key；Backy `/api/backy/pull` 走 webhook key；监控只读 `/api/live`；同一 Worker 的 Cron 直接调用服务层。所有用户数据仍在现有 D1。

## 3. Workers 集成与 D5

### 3.1 Vite：保留真实 vinext 插件

以下是 **Wrangler / 插件 v1 候选的配置核心**，不是可部署的完整配置；本地和测试的绑定选择必须同时落实第 7 节。选择 cf/v2 时先核对所选版本类型，再生成等价配置，禁止假装两代插件参数必然相同。

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      remoteBindings: false,
      inspectorPort: false,
    }),
  ],
  resolve: { alias: { "@": path.join(rootDir, "src") } },
  server: {
    host: "127.0.0.1",
    port: 7018,
    strictPort: true,
    allowedHosts: ["gecko.dev.hexly.ai"],
  },
});
```

保留现有 `@` alias，避免 TypeScript 7 路径加载回归。仅在 NextAuth / better-sqlite3 已退出服务端依赖图的同一可运行提交中，删除 `ssr.external` 中的 `@vercel/oidc`、`better-sqlite3`、`bindings`。不要执行会覆盖现有配置的初始化；临时目录审查生成物后再手工合并。安装锁定版本，不用未锁定的 `npx` 在发布时临时获取新工具。

`package.json` / `bun.lock` 新增锁定的 `@cloudflare/vite-plugin` 和所选 CLI 开发依赖，`jose` 列为直接运行依赖，不能依靠将被删除的 NextAuth 间接提供。Worker 类型按所选工具生成，不盲目同时引入两代类型包。

### 3.2 两套配置只选一套

| 用途 | Wrangler 候选（当前包有证据） | cf 候选（在线文档，有集成风险） |
|---|---|---|
| 文件 | `wrangler.jsonc` | `cloudflare.config.ts` |
| Worker 入口 | `main: "worker-entry.ts"` | `worker.entrypoint`；按所选版本的 typed import/类型生成规范接入，不用 `main` |
| 基础字段 | `name`、`compatibility_date`、`compatibility_flags: ["nodejs_compat"]` | `worker.name`、`worker.compatibilityDate`、`worker.compatibilityFlags` |
| 对外入口 | `workers_dev: false`、`preview_urls: false`、`routes: [{ pattern: "gecko.hexly.ai", custom_domain: true }]` | `worker.workersDev: false`、`worker.previewUrls: false`、`worker.domains`；完整值形状实施时按类型确认 |
| 现有 D1 | `d1_databases` 中 `binding: "DB"`、`database_name: "gecko"`、明确 `database_id`、`migrations_dir: "migrations"` | `worker.env.DB: bindings.d1({ id: "f66490d2-e7b3-43e8-a30c-2b34111141d7", name: "gecko" })`；禁止仅凭 name 自动建新库 |
| Cron | `triggers: { crons: ["0 * * * *"] }` | `worker.triggers` 的 `triggers.scheduled({ schedule: "0 * * * *" })` |
| 静态资源 | `assets.binding: "ASSETS"`、构建客户端目录、`html_handling: "none"`、`not_found_handling: "none"`、`run_worker_first` | `worker.assets.htmlHandling` / `notFoundHandling` / `runWorkerFirst`；资源源目录由框架构建产物提供 |
| 类型 | `wrangler types` 的产物加入 TS 检查；仍跑 `vinext typegen` | `cf workers types`，`.cloudflare/types` 加入 include 并忽略生成物；仍跑 vinext 路由类型生成 |
| 发布 | Vite 全环境 build 后用 Wrangler 部署**生成的 Worker 配置**，验明入口/assets/绑定；不上传未编译的 TS 源入口 | 选定兼容版本后按官方 `@vinext/cloudflare deploy` 构建并用 cf 发布 Build Output |

字段依据：[cf typed config](https://developers.cloudflare.com/cf/projects/cloudflare-config/)、[cf agents](https://developers.cloudflare.com/cf/agents/)、[Vite plugin API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)、GeekHub 已安装 Wrangler schema。cf `d1 migrations apply <database>` 的 `<database>` 是 ID；其 `--local --persist-to --dir` 已由本机帮助确认，但它与所选插件的本地存储地址是否一致，仍须本地读写往返证明。不得凭相似命令名替换 Wrangler。

三种资源模式显式分开：production 使用上述现有库和正式域；日常 local 使用独立本地 DB ID/persist、`ENVIRONMENT=local` / `RESOURCE_ENV=local`、无域名发布或 Cron；test 使用第 7 节的每轮资源。日常 `dev` 脚本必须显式选择本地配置，不能依赖 production 配置的隐式 Miniflare 模拟。Wrangler 环境的 vars/bindings 不假定继承，cf 按 mode 返回完整配置；部署脚本检查最终配置而不只检查模式名字。`compatibility_date` / `compatibilityDate` 固定为通过探针验收的日期，不在每次发布时自动漂移。

新增本地 `db:local` 脚本，明确 local 配置/DB ID/persist 后只应用未执行 migrations，供 7018 首次启动准备 schema；不删除已有日常库，不使用测试 reset 脚本，不从本地回退到远程库。

两种 assets 配置都必须使用此模式列表（仅键名不同）：

```json
["/*", "!/_next/static/*", "!/*/_next/static/*"]
```

不使用 GeekHub 的 `single-page-application` / 仅 `"/api/*"` 模式：Gecko 有 RSC 页面与代理。`public/` 请求应先经过 Worker；hashed JS/CSS 必须排除，否则 vinext 可能返回 404。验收包括根路径、深链、RSC 导航、public 图片和 hashed 资源。生产鉴权数据禁止 prerender、ISR 或共享 CDN 缓存；保护内容不能只依赖静态资源 matcher。

不因 init 默认值额外建立 KV / Images / Response Store。先盘点 Gecko 使用到的图片优化、字体、缓存能力，再显式选择最小配置；若保留某 adapter，绑定、类型和本地隔离必须一同进入清单。保留 `vinext`、`next`（类型/兼容）、`react-server-dom-webpack`、`@vitejs/plugin-rsc`。

### 3.3 自定义入口和异步生命周期

新增 `worker-entry.ts`。下面展示 **模块 Worker 的默认导出组合**；`Env` 来自所选工具生成的绑定类型，`runAutoAnalyzeTick` 是本项目拟实现的服务函数，不是 vinext API。

```ts
import app from "vinext/server/app-router-entry";
import { runAutoAnalyzeTick } from "./src/lib/auto-analyze";

export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    await runAutoAnalyzeTick(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;
```

依据：[Workers scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)。事件类型为 `ScheduledController`，不是 Service Worker 风格的 `ScheduledEvent`。不能 `export { default } ...` 再另写命名 `scheduled`；要验证最终 bundle 默认对象确实同时有 fetch/scheduled，且 fetch 仍收到原始 env/ctx。

`src/lib/auto-analyze.ts` 当前 `onTick()` 只启动分析 Promise，不等待分析与邮件完成。必须改为返回覆盖 **模型调用、结果写入、失败释放 claim、邮件发送** 的完整 Promise；仅把旧 `onTick()` 包进 `ctx.waitUntil()` 不够。Cron await 完整任务；手工分析邮件、API key `last_used` 更新也改为明确 await（可捕获非关键失败），不留下脱离请求生命周期的 fire-and-forget。Cron 调服务层，不依赖 HTTP session / `next/headers` 请求上下文，也不经自身 HTTP 路由绕一圈。

保留用户时区、“今天有会话、昨天尚无总结”规则。`src/lib/daily-summary-repo.ts` 的 D1 原子 claim 继续阻止并发重复调用；现有内存 Map 不是跨 isolate 锁。使用已有 claim 行 ID 和 `updated_at` 实现过期重领、所有权条件更新/释放，防止 isolate 终止后永久卡住或旧任务删除新 claim；手工分析也参与同一互斥规则，`force` 不覆盖运行中的任务。模型与邮件须有有界超时；多用户并发、Cron 执行限额及崩溃恢复纳入测试。不能承诺崩溃窗口下付费调用严格 exactly-once。

## 4. Access、人机边界与 NextAuth 清理

### 4.1 边缘路径策略

Access 主应用保护 `gecko.hexly.ai`；team `nocoo` 是既有约定，Gecko 专用 audience 和实际 Allow 策略须部署时取得并记录，不能复制 GeekHub/Giraffe 的 audience。

| Access 路径应用 | Worker 允许的机器/公开请求 | Worker 中的最终检查 |
|---|---|---|
| `/api/live` bypass | GET；框架隐式 HEAD 不返回 body | 最小 D1 探测，不含凭据/内部错误细节；其它方法不提供写能力 |
| `/api/sync` bypass | POST | `requireApiKey(req)`；错误 key 返回 JSON 401，不重定向 |
| `/api/v1/*` bypass | 当前仅 GET `/api/v1/snapshot` | 每个业务 handler 必须验 API key；未知路径不因 bearer 存在而获授权 |
| `/api/backy/pull` bypass | **HEAD 和 POST** | `X-Webhook-Key` 查 `backyRepo.findUserByPullKey`；不是 Access，也不是 `gk_*` |
| 更具体的 `/api/sync/status` **Allow** | GET，人的 dashboard | 保持 `requireSession`；不能继承父 `/api/sync` 的 bypass |

[Access 路径有继承且最具体应用优先](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)，并不是 HTTP method 过滤器。上表方法由 Worker 控制；不得声称配置了“GET-only Access bypass”。为 `/api/sync/status` 的更具体应用配置相同人的 Allow 策略，并将其 audience 纳入受信任 **路径限定** 列表（或在平台支持时复用同一应用 destinations，先验证）。不能全局接受别的应用 audience。`/api/backy/pull-key`、其它 `/api/backy/*`、`/api/keys`、`/api/me` 都是人的接口，不加通配 bypass；验证相似前缀、尾斜线及编码路径不会扩大授权。

这是必须完成的 Access 集成风险：不同应用可能具有不同 audience/session，不能仅添加第二个 AUD 就声称 dashboard 的 fetch 可用。实施优先验证主应用的额外精确 destination 能覆盖 status 且保持同一会话；若采用独立应用，则须验证同域 cookie、SSO 与 AJAX 不被重定向成登录 HTML，并在页面进入时完成必要的浏览器认证。拿不到这些证据就阻断上线，不把 status 改成公开接口，也不要求 Mac 改协议。

先部署 Worker 内鉴权，再开放机器路径 bypass。借用 Giraffe 的专用路径应用模式，不改动全局共享 bypass destinations；关掉 workers.dev 和 version preview URL，不能留下绕 Access 的备用入口。

### 4.2 应用内身份

新增 `src/lib/access.ts`：用 `jose` 验 `cf-access-jwt-assertion`，限定 RS256、精确 issuer、路径对应 audience，要求 `exp` / `iat` / 非空 `sub` / 合法 email，验证过期及 `nbf`。JWKS URL 由可信 team 配置构建，不能取自请求；纯邮箱 header 不算身份。缺配置 fail closed，不自动切本地用户。

`src/lib/api-helpers.ts` 的 `requireSession` 接收真实 `Request` 并调用 Access helper；修改所有 API 调用点，包括原来无 Request 参数的 GET/POST。Server Component 使用独立页面 helper 从 vinext 的 `await headers()` 验同一 JWT，不把来路 Host / forwarded headers 当身份。`src/proxy.ts` 不再包 NextAuth：只按已列路径把机器请求交给各 handler，人的页面/接口均检查身份；**不得继续以“任意 Bearer header 存在”作为全路径放行条件**。API 401 返回 JSON；页面显示未授权，浏览器的 Access 登录由边缘负责，不拼未经证实的登录 URL 或 `/login` 循环。

人的写操作检查固定生产 Origin `https://gecko.hexly.ai`（本地为被核准的当前测试/Caddy origin）及 `Sec-Fetch-Site`；跨站或缺少要求的 Origin 拒绝。机器接口不套用浏览器 Origin 要求，凭各自 key 授权。私有 HTML/RSC、`/api/me` 和用户 API 使用 `Cache-Control: no-store`，不缓存身份或把用户态存在模块全局。

本地身份仅在**配置选择的本地运行模式**、`ENVIRONMENT=local`、`RESOURCE_ENV=local|test`、本地 DB 绑定和回环监听同时成立时启用；test 还必须显式选择第 7.2 节的 stub 模式，jwt 模式永不短路。请求中的 Host/header 不能开启该模式。回环 URL 可用于测试；Caddy `gecko.dev.hexly.ai` 须由本机代理覆写可信 loopback peer header，并清理来路伪造值。没有该配置证据时拒绝短路，不放宽检查。本轮不修改 Caddy/证书。生产部署脚本拒绝上述本地变量、身份和资源。测试身份再要求 `_test_marker` 的 env 与本轮 run ID 匹配；测试中机器鉴权**不短路**，使用 fixture 创建并散列的真实格式 key。

`GET /api/me` 返回最小 `{ user: { id, email, name } }`，不返回 JWT、模型密钥或 webhook key；本轮测试身份信息只在受限 test 模式额外提供。UI logout 使用 Access 的 `/cdn-cgi/access/logout`，本地不显示虚假退出流程；缺 avatar 时沿用现有头像占位。

### 4.3 必改和删除路径

| 文件 | 动作 / 预期效果 |
|---|---|
| `src/lib/access.ts`、`src/lib/api-helpers.ts`、`src/proxy.ts` | 新增/改造共同身份逻辑、Origin 和人机边界；`src/app/api/**/route.ts` 全部按 API 表复核，不仅改共享 helper |
| `src/app/api/me/route.ts` | 新增受保护身份接口 |
| `src/app/daily/page.tsx` | 删除直接 `auth()`，验页面身份后仍按用户 timezone redirect |
| `src/app/api/settings/notifications/route.ts` | 两个方法直接调用 `auth()`，必须显式改造 |
| `src/app/page.tsx`、`src/app/settings/page.tsx`、`src/components/layout/sidebar.tsx` | 替换所有 `useSession` / `signOut`，统一消费 `/api/me`；保留页面加载、出错和头像状态 |
| `src/app/layout.tsx` | 删 `AuthProvider`；`metadataBase` 不再依赖 `NEXTAUTH_URL` / 错误的 3000 默认端口 |
| `src/auth.ts`、`src/app/api/auth/[...nextauth]/route.ts`、`src/app/login/page.tsx`、`src/components/auth-provider.tsx` | 删除 Google/NextAuth 登录流程 |
| `src/lib/vinext-request-shim.ts` | 删除只为 NextAuth cookie/accessor 补偿存在的 shim |
| `src/__tests__/auth.test.ts`、`src/__tests__/lib/vinext-request-shim.test.ts` | 删除过时测试，换成 Access、直接 auth 调用点及人机负例测试 |
| `src/__tests__/setup.ts`、`vitest.config.ts`、相关 `src/__tests__/**/*.test.ts` | 删 NextAuth mock/inline/exclusion；需要的 `next/server` 映射不能随意删；新鉴权逻辑纳入覆盖率 |

删除 `next-auth` 依赖和 `GOOGLE_CLIENT_*`、`NEXTAUTH_*`、`AUTH_SECRET`、`AUTH_TRUST_HOST`、`ALLOWED_EMAILS`、`E2E_SKIP_AUTH`、`USE_SECURE_COOKIES` 等旧变量引用；未使用项不新建。旧密钥撤销是切换后经批准的运维动作，不是本轮访问 Keychain 的理由。

## 5. D1、D3 映射与同步持久性

### 5.1 单一数据库访问

`src/lib/d1.ts` 在 Worker 中 `import { env } from "cloudflare:workers"`，读取 `env.DB`。保留调用方需要的 `query<T>` / `execute` 返回值语义，内部改用 prepare/bind/all/run；同步批写用 `DB.batch`。删 `D1Config`、REST 重试、`getD1Config` / `isLocalMode` / `closeLocal` 和 `D1_LOCAL_PATH`，不是继续保留双驱动。`better-sqlite3` 和 `@types/better-sqlite3` 一起删除，更新 Web lockfile。

同时删除业务代码/示例中的 `CF_ACCOUNT_ID`、`CF_API_TOKEN`、`CF_D1_DATABASE_ID`。部署 CLI 所需的 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` 属于运维环境，不进入 Worker 业务绑定或测试子进程；两者不能混为一谈。

`cloudflare:workers` 是 workerd 内置模块，不是 npm 包。L1 的独立 `vitest.config.ts` 不加载 Cloudflare Vite 插件：给此 specifier 建测试专用 alias/mock，或在已存在的依赖注入边界注入 D1 假对象；静态解析也必须成功。`src/__tests__/lib/d1.test.ts` 验新 adapter 的 results/meta/changes/error，不再 mock REST fetch。不仅 mock 掉整个 d1.ts 后宣称 adapter 已覆盖。

### 5.2 迁移基线：禁止“文件在就算已应用”

`drizzle/0001_cloud_init.sql` 至 `0008_add_ai_prompt.sql` 原样移动到 `migrations/`，保留顺序与文件名。本地空库跑全部；现网可能是历史 `d1 execute --file` 手工执行，**账本可能为空且不等于 schema 为空**。`0002` / `0007` 重建表，`0008` ADD COLUMN 不能重复执行；只禁止重跑 `0001` 不够。

远程首次迁移前，由授权实施者记录账号/库 ID、schema、索引、各表行数、迁移账本及可恢复备份点；把现网 schema 与本地完整迁移后的 schema 比对。仅对**已证明执行过**的文件登记所选工具的迁移账本，不能一律标记 0001–0008。若 schema 不符则停止并单独制定修复，不能靠再执行破坏性 SQL 试错。Wrangler/cf 的账本格式及相对文件名必须在本地副本演练；新增 `scripts/baseline-d1.ts` 默认只出检查报告，写入必须有显式目标和批准。日常 `scripts/deploy.ts` 仅允许在已确认基线后应用真正待执行的迁移。

### 5.3 D3：完整、可恢复的一次性映射

新增 `scripts/remap-user-ids.ts`，先只生成 dry-run 报告。Google `providerAccountId` 与 Access email/sub 没有可自动推算关系，现库也没有可靠的 Google-ID/email 身份表；映射由哥提供并用已验签身份核准。不得把通知邮箱、模型设置或显示名当账户所有权证明。

必须枚举并更新这 **10 张含 `user_id` 的表**：`focus_sessions`、`api_keys`、`sync_logs`、`categories`、`app_category_mappings`、`tags`、`app_tag_mappings`、`settings`、`daily_summaries`、`app_notes`。实际 schema 再扫描一次，发现额外表即阻断。保留 session/category/tag/key 的 ID、`key_hash`、`device_id` 和所有业务值；更新 `api_keys.user_id` 后原 Mac key 无需重发。

检查每个旧 ID 的归属、目标 ID 是否已存在及所有复合唯一键冲突（category slug、tag name、bundle mapping、setting key、summary date、note bundle）。推荐一对一且目标为空；若多个历史随机 ID 属于同一人，必须另给逐项冲突处理并批准，禁止 `OR IGNORE` 静默丢配置/合并别人的数据。映射及备份含隐私，不进 Git 或日志正文。

切换窗口先阻断旧服务全部写入口/定时器、停止新 Worker Cron；短暂停写返回 **503** 让 Mac 重试。旧 `SyncQueue` 还要 drain 并核对错误日志/数据库，已 202 但未持久化的数据不能假定会自动补传；若存在缺口，先明确恢复方式再迁移。小数据映射可在验证容量后的单次 D1 batch 事务执行；若超过语句时长/大小上限，则维持完整停写按可续跑账本分块，完成一致性校验前不开放任一客户端。完成后核对行数、唯一键、旧 ID 清零、API key 哈希不变及各身份读写归属。

恢复必须覆盖**数据库身份映射与应用版本一对**：开放新写入前失败可恢复备份并继续旧 Node；开放后不得直接反向 UPDATE/恢复旧快照丢掉新增数据，要先再次停写、保存增量并审查恢复。完成迁移后删除一次性脚本，不留双身份兼容逻辑。

### 5.4 同步：保持 Mac 协议，不误报可丢弃错误

依据仓根 `apps/mac-client/Gecko/Sources/Services/SyncService.swift`：每批 250，成功解析 200/202 的 `accepted` 与 `sync_id` 后标记本批行；**400/413 也会被当作确定性客户端错误而标记已同步**，401 停止同步，其它错误/网络失败保留待重试。原先“4xx 一律保留 NULL”不成立。Mac 行为本次不改。

`src/app/api/sync/route.ts` 目标流程：

1. 验真实 Bearer key，服务端决定 `user_id` / `device_id`，忽略客户端伪造的归属字段。
2. 维持现有协议校验与 1000 条上限，不因迁移收紧合法 Mac payload；400/413 仅用于原有确定性坏输入，不用于 Access、绑定、D1 配额或临时故障。
3. 将 `src/lib/sync-queue.ts` 的 14 列映射/SQL 纯函数移至 `src/lib/sync-write.ts`，每 INSERT 最多 7 行（98 bind），删除整套队列类、单例、计数与 drain timer。保持 `INSERT OR IGNORE` 对 session ID 的重试幂等。
4. await 一次包含本批所有 INSERT 的 `DB.batch`；同时写 `sync_logs`，让现有 `/api/sync/status` 真正可读最新设备状态。`sync_logs.id = sync_id`，`session_count` 记录收到条数，首末时间取本批 start_time 的最小/最大值；新增条数可从 INSERT 的 meta.changes 另记运行指标，不改现有日志 schema。重试可有多条上传日志，但不能复制 focus session。
5. 全部成功后返回 **202**、`accepted = 合法提交条数`（含同一身份的重复 session，不取 `meta.changes`）、新 `sync_id`。DB 失败返回 JSON 5xx，不能先 202 后 waitUntil 写库；响应丢失后重复提交仍安全。

[D1 batch 是事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)，错误回滚本 batch；[单语句最多 100 bind，查询/调用另有配额](https://developers.cloudflare.com/d1/platform/limits/)。1000 条需要 143 条 INSERT，加鉴权/审计超过 Free 每次调用 50 查询上限；此方案要求上线前确认 **Workers Paid** 的有效配额，不能悄悄把 API 上限改小。验证 250 条约 85KB、1000 条、长标题/URL、重复批次、D1 故障与响应丢失；202 之前必须可读到全部行。记录 D1 时限和 Mac 实际 URLSession 超时内的完成证据；Node/Bun 旧 hang 在 workerd 是否消失，不能仅凭运行时不同作保证。

### 5.5 出站、字体与健康

`src/services/email-notification.ts` 从 Worker bindings 读取 `DOVE_WEBHOOK_URL` / `DOVE_WEBHOOK_TOKEN` secrets 和 `DOVE_TEMPLATE_SLUG` var；`NEXTAUTH_URL` 改成 `DASHBOARD_URL=https://gecko.hexly.ai`。`src/lib/backy-repo.ts` 当前把用户 Backy URL/API key/pull key 放在 `settings`，继续保留按用户配置，**不能全部搬成全局 Worker secrets**。AI 用户密钥同样仍在 D1，不能进入客户端 bundle 或日志。

`src/lib/backy.ts` 的 `node:zlib` + Buffer、`src/lib/backy-export.ts` 全量导出和 `src/lib/backy-push.ts` multipart 上传必须在 workerd 实测，记录代表性数据量下内存/CPU/子请求/超时，生产与测试上传标签改读明确 `ENVIRONMENT` / `RESOURCE_ENV`，不误把 test 标成 prod。`nodejs_compat` 不是所有 Node 行为都兼容的证明。

`src/components/ai-settings.tsx` 当前使用自有控件和 `@nocoo/next-ai` 根入口的纯配置/类型导出，予以保留；并没有使用该包的 `/react` 控件。Route Handler/服务层继续用 `@nocoo/next-ai/server`，不引入 `server-next`，浏览器图不得导入 `/server`。GeekHub `src/worker/ai.ts` 提供 Worker 集成参考，但 `patches/@nocoo%2Fnext-ai@0.4.0.patch` **只改 React 控件为 Basalt**，不能称其修复服务端兼容。以本地假模型验证 Gecko 自己的 provider、鉴权、超时、错误解析和 Cron 路径，禁止自动测试调用真实付费模型。

`next/font/google` 已安装实现支持生产构建下载并自托管字体，开发/无法静态解析时才可能 CDN 回退；当前 layout 通过默认导出别名取字体，最终走哪条路径以实际 build/network 为准。不宣称“生产始终 CDN”；本地字体缓存/离线测试策略和图片资源均需构建验收。

`/api/live` 用 `SELECT 1` 探 DB，保留 200/503 与 `no-store`，错误 body 不回显凭据、SQL或内部路径。`storage: "d1"` 只是应用声明；`cf-ray` 也可能来自代理着旧 Railway 的 Cloudflare，不能单独证明 Worker 已切换。

## 6. API 清单：L2 显式方法全覆盖

当前 30 个 route 文件、51 个显式方法；删除 NextAuth GET/POST 后增加 GET `/api/me`，目标仍 30 个文件、**50 个显式方法**。每一行对应 `src/app` 下同名路径的 `route.ts`，`:id` / `:date` 对应 `[id]` / `[date]`。

| 方法 | 路径 | 鉴权 |
|---|---|---|
| GET | `/api/live` | 无 |
| GET | `/api/me` | Access |
| POST | `/api/sync` | API key |
| GET | `/api/sync/status` | **Access，不新增机器语义** |
| GET | `/api/sessions` | Access |
| GET | `/api/stats` | Access |
| GET | `/api/stats/timeline` | Access |
| GET | `/api/apps` | Access |
| GET PUT DELETE | `/api/apps/notes` | Access |
| GET POST PUT DELETE | `/api/categories` | Access |
| GET PUT | `/api/categories/mappings` | Access |
| GET POST PUT DELETE | `/api/tags` | Access |
| GET PUT POST | `/api/tags/mappings` | Access |
| GET POST | `/api/keys` | Access |
| PATCH DELETE | `/api/keys/:id` | Access |
| GET | `/api/v1/snapshot` | API key |
| GET PUT | `/api/settings/timezone` | Access |
| GET PUT | `/api/settings/notifications` | Access |
| GET PUT | `/api/settings/ai` | Access |
| POST | `/api/settings/ai/test` | Access |
| GET | `/api/daily/summaries` | Access |
| GET | `/api/daily/:date` | Access |
| POST | `/api/daily/:date/preview-prompt` | Access |
| POST | `/api/daily/:date/analyze` | Access |
| GET PUT | `/api/backy/config` | Access |
| GET | `/api/backy/history` | Access |
| POST | `/api/backy/push` | Access |
| GET POST DELETE | `/api/backy/pull-key` | Access |
| **HEAD POST** | `/api/backy/pull` | **X-Webhook-Key** |
| POST | `/api/backy/test` | Access |

维护 `src/__tests__/e2e/api-surface.ts`（新增）的覆盖台账，与路由导出扫描对比，新增/删除方法不允许悄悄漏测。每个显式 method 至少有成功路径和适用的未授权/坏输入用例；不能以全是 401/403 冒充业务覆盖。另测 vinext 自动 HEAD/OPTIONS、未知路径/方法及删除后的 `/api/auth/*` / `/login` 不再提供旧认证流程。

## 7. 6DQ 与 vinext/workerd 隔离 harness

6DQ 名称不变；**原 G1 已并入 L1**，不恢复独立 G1。下表是实施计划，不把未运行项目改标 enforced。

| 维度 | 所需证据 |
|---|---|
| L1 web | Vitest 四项各 ≥95.5%，禁止 focused/skipped/empty suites；D1 adapter、Access、同步写入、Cron await/claim、harness guard 均实测，不以新增排除掩盖覆盖率 |
| L1 static web | 所选工具生成 Worker binding/runtime types + `vinext typegen` + 严格 tsc + Biome 零警告；独立 L1 不启动 workerd |
| L2 | 17018，真实 vinext + Cloudflare 插件 + 本地 D1 HTTP；第 6 节 50 个显式方法逐一有业务证据；包含机器 key、Access JWT 负例、租户隔离、同步读后写、Cron 本地事件 |
| L3 web | 27018，Chromium 独立状态；页面/深链/RSC 导航、日览、同步状态、API key 管理、设置与本地身份；真实 Access 登录/退出另做上线人工验收 |
| G2 web | 保留 gitleaks / OSV 和 `src/__tests__/image-size-security.test.ts`；这是 **image-size 解析器回归**，不是 Docker 镜像门，删 Docker 不删它 |
| D1 隔离 | 每轮本地持久目录、绑定 ID、env/run marker、服务器身份、fixture 与进程所有权；拒绝远程、日常库和共享默认状态 |
| Native | 现有 XCTest / SwiftLint / 签名隔离 / planned 覆盖率差距原样保留；Mac 协议不改，不把 Web 迁移当作 native 验收 |
| Build / release | 本地实际生产 bundle 的 fetch + scheduled + assets 验收，Web/Mac 协调版本与 DMG 流程不变；本轮文档审查不是发布证据 |

### 7.1 复用原则与具体文件

借用 GeekHub harness 的“独立 persist + 本地绑定 + marker + 清理”结构，**不直接复制它的 SPA `react()` / `viteEnvironment.name = "worker"` / SPA fallback**。也不照搬它的不足：HTTP 探测空闲端口不等于 bind 检查、固定 marker 不足以认定服务器归属、仅删少量凭据不能阻止 dotenv 注入。

新增 `scripts/run-tests.ts`、`scripts/verify-test-bindings.ts`、`scripts/seed-test-db.ts`；修改 `vite.config.ts`、`playwright.config.ts`、`package.json`、`src/__tests__/e2e/**`、`e2e/bdd/**`。删除 `scripts/init-local-db.ts`、旧 `db:init` / `dev:e2e` / `dev:bdd` 自启链及每个 suite 的 server spawn/reuse/reset；测试只接受 harness 发放的 baseURL。仓根 `package.json` / `.husky/pre-push` / `.github/workflows/ci.yml` 入口一同接入，保持原质量门。

### 7.2 每轮生命周期

1. 确认 17018/27018 可 bind，`strictPort` 禁止漂移；占用就失败，不杀占用者。vinext 有开发实例锁，未证明可配置隔离前 **L2/L3 串行且等待日常 7018 空闲**，不自动结束哥的 dev server。交互 dev server 按机器规则放 herdr 的 `dev server` tab；测试子进程由 harness 同步拥有。
2. 在项目测试父目录内 `mkdtemp`，分配 run ID、每轮测试绑定 ID、persist/cache/log/report 路径；`realpath` 校验目录边界，拒绝 symlink 逃逸。每轮临时配置不带生产库 ID、自定义域、workers.dev/preview URL、Cron 自动计划或 remote binding。
3. 测试进程使用最小 env 白名单和受控 envDir/配置目录，不继承 `.env.local`、`.env.development.local`、`.dev.vars` 或 CLI 登录配置；剥离 `CF_*`、`CLOUDFLARE_*` 凭据及真实 AI/Dove/Backy 目标，harness 再注入所需本地模式。检查**解析后的有效配置**，不只对源 JSON 做字符串搜索。生产部署相反：拒绝任何 local/test 资源/身份。
4. Wrangler 候选显式传测试 `configPath`，插件 `persistState: { path: state }`、`remoteBindings: false`、`inspectorPort: false`，测试 vars 在 Worker 配置中写入 `ENVIRONMENT=local` / `RESOURCE_ENV=test`；不能只设置 shell `RESOURCE_ENV` 并假定变成 binding。cf/v2 的对应能力先由锁定类型和本地读写证明，不能硬套 v1 `config` 回调。
5. 使用选定 CLI 的 **local-only** SQL/migration 命令，明确同一个 config、测试 DB ID 和 persist path；用“CLI 写标记 → Worker 读到 → Worker 写 fixture → CLI 读到”证明同一数据库。不直接操纵 Miniflare 私有 SQLite 文件，不接远程 `-test` 库。
6. 空库执行全部 migrations，创建 `_test_marker(key, value)`，至少含 `env=test`、`run_id=<本轮>`；fixture/reset 前验证 marker。用测试专用散列 key 与两个用户创建数据。假 JWKS/模型/Dove/Backy 仅绑定本轮 loopback，阻止外部网络副作用；付费服务不作测试依赖。
7. 启动真实 vinext + CF 插件（可用 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port <lane>`），cache/报告全部在本轮目录。ready 同时要求进程存活、`/api/live` 的预期版本/存储、受限 test 身份返回的 run ID 与数据库 marker 一致；JWT 测试模式的 ready 请求必须携带有效 fixture JWT。任何旧服务的 200 都不能算就绪。
8. 单一 harness 启动 L2 或 Playwright；`playwright.config.ts` 不再自行启动/复用 server，baseURL 来自本轮环境。新增项目自有测试变量 `TEST_AUTH_MODE=stub|jwt`：仅在本地 test 绑定/marker 已验证时读取；生产/日常配置禁止它。L3 可用固定 stub；L2 必须有独立启动的 jwt 模式，**完全禁用本地身份短路**，使用本轮签名/JWKS（只换信任材料，执行同一验签逻辑）覆盖缺 JWT、伪造、过期、错 iss/aud、跨站、冒充本地和两个用户的数据边界。生产忽略测试 JWKS 并拒绝测试模式配置；机器 key 在两模式都照常验证。
9. Cron 通过所选插件支持的本地 scheduled 触发接口测试（当前官方说明 `/cdn-cgi/local/scheduled`；必须在锁定版本验证）；证据是完整任务已落库/失败已释放 claim，而非 HTTP 触发返回 200。独立完成一次生产 build/preview 测试，防止只验证 dev 虚拟入口。
10. 成功、失败、超时、SIGINT/SIGTERM 都清理本轮拥有的 server、测试 runner、stub 及后代进程组，等待退出再验证 marker 后删除数据。初始化未完成时只删除由本轮创建且验证所有权的目录；保留可定位的失败报告，不触碰别人的目录或进程。

## 8. 改动与原子提交计划

这里是**未来实施提交**，不是本轮准许改应用代码。所有路径在提交前用 `rg` 校验调用者；每一步都必须通过相应严格检查。D3/D5 未确认不开始不可逆动作，不提交“只加插件却仍加载 better-sqlite3/NextAuth”的不可运行状态。

### 8.1 文件总账

| 文件 | 动作及归属 |
|---|---|
| `vite.config.ts`、选定的 `wrangler.jsonc` **或** `cloudflare.config.ts`、`worker-entry.ts`、`tsconfig.json`、`package.json`、`bun.lock` | 单一 Workers target、类型、依赖与脚本；不留两套活跃配置 |
| `src/lib/d1.ts`、`src/lib/sync-write.ts`（新增）、`src/app/api/sync/route.ts`、`src/app/api/sync/status/route.ts`、`src/app/api/live/route.ts` | binding、持久化 202、同步日志、健康检查 |
| 第 4.3 节全部路径及 `src/app/api/**/route.ts` | Access、页面身份、退出、所有直接/间接 NextAuth 依赖 |
| `src/lib/auto-analyze.ts`、`src/lib/daily-summary-repo.ts`、`src/services/analyze-core.ts`、`src/app/api/daily/[date]/analyze/route.ts`、`src/services/email-notification.ts` | Cron 完整 await、claim 所有权/过期恢复、手工分析互斥及邮件生命周期 |
| `src/lib/backy.ts`、`src/lib/backy-export.ts`、`src/lib/backy-push.ts`、`src/lib/backy-repo.ts` | 检查 workerd 能力与数据规模；环境标签/测试出站隔离；不强改按用户凭据存储 |
| `drizzle/*.sql` → `migrations/*.sql`、`scripts/baseline-d1.ts`、`scripts/remap-user-ids.ts`、`scripts/deploy.ts`（新增） | 原样迁移 SQL、基线与 remap 演练、拒绝 local/test 的部署流程 |
| 第 7 节 harness / configs / tests；`src/__tests__/lib/{d1,sync-queue,auto-analyze,auto-analyze-default-deps,daily-summary-repo}.test.ts`、`src/__tests__/api/{sync,sync-status,live,backy-pull,daily-analyze-route,settings-notifications}.test.ts` | 删除旧实现测试并替换为新合同测试；HTTP/browser 全面接入，新增 Access、entry 和 harness guards 测试 |
| `Dockerfile`、`.dockerignore`、`src/lib/sync-queue.ts`、`src/instrumentation.ts`、`src/lib/hourly-scheduler.ts`、`src/__tests__/lib/hourly-scheduler.test.ts`、`scripts/init-local-db.ts` | 目标替代能力已可用后删除，不留空壳兼容 |
| `.env.example`、`.env.e2e.example`、仓根 `.gitignore` | 去 OAuth/业务 CF tokens/真实模型 E2E 变量；只保留所选 Workers 的本地示例；忽略 `.wrangler` / `.cloudflare`、types、临时状态，不能把 secrets 加进 typed config |
| 仓根 `package.json`、`bun.lock`（仅根依赖变化才改）、`scripts/pre-commit.py`、`scripts/test_pre_commit.py`、`.husky/pre-push`、`.github/workflows/ci.yml` | 入口、index-snapshot 生成类型/依赖隔离、L2/L3 与 CI；不降门槛、不绕 hooks、不顺手改 shared workflow pin |
| 仓根 `AGENTS.md`、`README.md`、`docs/README.md`、`docs/README.en.md`、本文；`docs/01-database-schema.md` / `docs/03-data-sync.md` | 实施完成后更新运行时事实、命令、数据与协议说明，旧编号文档标清被取代的段落；保留事故历史 |

### 8.2 可运行的提交边界

1. `docs: confirm worker migration prerequisites`\
   记录哥确认的 D3/D5、版本组合、实际配置/生成入口、隔离与 workerd 探针证据、资源/账号预检和停写方案。探针在隔离临时目录，不提前改生产或运行未审阅 init。先验证第 9 节中框架/API 可行性；完整 Gecko 回归在下一步，远程验收在第 10 节，不能把后续结果当作已具备。
2. `feat: move dashboard runtime to workers`\
   **一个端到端可运行切片**：8.1 中 target/依赖/类型、binding、Access、同步写入、Cron 生命周期、出站适配和测试 harness 必须一起形成可运行产品；同步删除对应 NextAuth、Node SQLite、timer 和 Docker 路径。分拆开发可以在工作区进行，但不提交必然不能启动/测试的中间状态。native 代码不变。通过 L1/L2/L3、G2、生产 bundle 本地验收后原子提交，不部署。
3. `chore: add guarded d1 cutover tooling`\
   `scripts/baseline-d1.ts`、`scripts/remap-user-ids.ts`、`scripts/deploy.ts` 及隔离 fixture 测试；默认 dry-run，明确生产 ID、基线审批、恢复检查和环境拒绝。本地空库/历史 schema/已登记基线/冲突/超限中断恢复均演练；未授权不操作线上。
4. `docs: record worker cutover evidence`\
   完成第 10 节后更新仓根 AGENTS/README、英文指南、索引及相关编号文档，记录实际部署 revision/版本、身份映射校验和健康/同步/Cron 证据。不能仅凭 push 或 header 声称已部署。
5. `chore: remove completed cutover tooling`\
   迁移和恢复验证完成后删一次性 baseline/remap 脚本与其专用 fixture，保留正常 migrations/deploy；旧托管、OAuth 凭据与旧运维资源按批准范围退役，历史事故与发布记录不删。

每次具体 stage 文件，Conventional Commit 全小写、祈使句、≤50 字符；禁止 `--no-verify`。正式版本仍由仓根 `scripts/release.ts` / `bun run release` 对齐 Web/Mac X.Y.Z、tag、Release 与 DMG，Worker 版本元数据记录同一版本及 Git SHA；不另造独立“Worker tag”体系。

## 9. 阻断条件与退出条件

### 9.1 上线前必须解除的风险

| 风险 | 解除证据 / 未解除时动作 |
|---|---|
| 版本分叉 | D5 确认；锁定 vinext/插件/CLI，证明 build 配置、类型、fetch/scheduled/assets 均正确。没有证据的 `--legacy-wrangler-cloudflare-init` 等参数不写成操作步骤 |
| 大 POST / D1 配额 | 250/1000 条与长字段在本地生产 bundle 和经批准的生产 smoke 中持久化后 202；有效 Paid 配额、响应时限及安全重试证据。不用 400/413 报临时失败 |
| 鉴权与身份 | D3 映射方案、10 表无冲突、旧 key 不变；Access 主/更具体应用的策略/audience/session 连续性、机器/Backy/健康路径及所有备用域负例验收 |
| Cron / next-ai | 无请求上下文可完成 scheduled；完整 await、超时、并发 claim、isolate 中断后可恢复；本地假模型跑过 Gecko 自己的 server entry |
| Backy / runtime | zlib/Buffer/multipart、全量导出内存/CPU、包体积/启动资源和出站超时通过；不能以 GeekHub 的成功代替 |
| 测试工具链 | 同一 persist 的 CLI/Worker 往返，dotenv/remote 拒绝，run marker、独占端口、vinext 锁、退出清理和真实 bundle 测试通过 |
| 字体 / 私有缓存 | 生产字体/images/assets 可用，构建联网行为已知；HTML/RSC/API 不共享缓存用户身份或数据 |

### 9.2 只有框架特有阻塞才重审 Hono

若最小复现证明下列任一问题属于 vinext 集成，且同版本 workerd 的小型原生 Worker/Hono 对照可以正确完成，可暂停主路径并请求审查替代方案：

- vinext Request/body 桥接破坏大 POST，而直接 Worker fetch 正常。
- vinext RSC 模块图使 next-ai server 无法运行，而独立 Worker 模块图正常。
- 正确默认导出/自定义入口仍被 vinext 构建丢掉 scheduled，直接 Worker 构建能保留。
- RSC/SSR、`@` alias、生产静态资源或页面身份隔离无法在可接受的 vinext 版本组合下正确工作。
- vinext 独有的实例锁/构建路径问题阻止必需隔离测试，且不能通过既有配置或串行运行满足需求。

一般 workerd 限额、D1 时限/配额、共同 SDK 的 Node 依赖、Backy 内存超限、cf 配置不熟悉 **不是直接切 Hono 的理由**，Hono 也在同一 runtime；先定位并在 D1 不变下修正方案。触发退出也不自动删 vinext：先更新本编号文档的路径/提交/6DQ 设计并获批，禁止半套 App Router 与半套 SPA 混入 main。

## 10. 上线顺序与验收

1. D3/D5 获确认、第 9 节本地门槛完成；Caddy 7018 浏览器路径可用。固定并核验 Worker 构建 revision、版本及实际旧托管连接；本仓没有部署 workflow，push 不等于发布。
2. 确认账号和 **现有** D1 ID、Paid 配额、备份恢复点、迁移 schema/账本；本地与远程动作明确分开。先部署不对外、不带 Cron 的 Worker，默认入口全部鉴权；不得为方便冒烟新建公开 `-test` Worker/库。
3. 准备 Access 主应用、Allow 名单、机器路径 bypass 及 `/api/sync/status` 更具体 Allow 策略；生产 vars 为 production，无本地身份。确认 DNS/自定义域切换方案和旧流量去向后才操作，避免 Access 提前拦住现有 Mac。
4. 按 5.3 停全部旧写入/定时器并处理队列，再执行已核准 baseline/remap，验证完整性与恢复条件。未通过不放开新写入；临时维护响应为 503。
5. 用仓内锁定的 `scripts/deploy.ts` 选择生产配置、核对基线后应用真实待执行迁移、构建并发布，切 `gecko.hexly.ai` 到该 Worker；生产只保留一个活跃写入者。取得实际部署 ID / Git SHA / 版本 / 域名绑定证据后恢复流量。
6. **GET** `https://gecko.hexly.ai/api/live` 同时核对 HTTP 200、body `status=ok`、版本、`storage=d1` 与 DB 探测；不用 `curl -I` 读取不存在的 body，不以 `cf-ray` 单独判定切换。无凭据的机器 API 是 JSON 401、Backy HEAD 是无 body 的 401，不能跳登录页。
7. 浏览器验证 Access 允许/拒绝、直接页面与 `/api/me`、timezone 日览、key 管理、设置、退出及 private cache；验证 `/api/sync/status` 仍要求人的身份。以原 Mac key 上传一批并读 D1/控制台确认已持久化、重传无重复；Backy HEAD/POST 和原 webhook key 验收，副作用由哥批准。
8. 最后启用 Cron `0 * * * *`（UTC 调度，业务按用户 timezone），验证 scheduled 事件、完整分析/持久化/邮件与重复触发保护；真实付费模型仅在哥批准的烟测范围调用。不需要先访问某个 route 才启动 Cron。
9. 全部通过后退役 Railway/旧域或旁路访问、旧 OAuth 凭据；按恢复检查点处理备份，不留双运行时兼容分支。记录证据并完成协调发布；本轮审文档不执行这些外部动作。

验收结论必须同时覆盖：vinext App Router 保留、Cloudflare 部署来源可证明、Access 人机边界、原 Mac 协议、D1 binding/现有数据、无悬空后台 Promise、完整 L2/L3/隔离和全部删除调用点。日常 / L2 / L3 端口仍是 **7018 / 17018 / 27018**。

## 11. 明确不在本次

- Mac 跟踪、Keychain、本地 SQLite、同步 JSON/批次和客户端错误处理修改。
- 产品路线图 08 的新可视化、Basalt 视觉审计或凭空引入队列/缓存服务。
- 远程 `-test` Worker / D1、Workers Builds / GitHub 自动部署。
- 未满足第 9.2 节并另获确认时重写 React Router / Hono。
- 本轮文档审查中的应用实现、生产 SQL、Access/DNS/Caddy/证书更改或 push。
