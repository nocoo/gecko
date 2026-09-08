<p align="center">
  <img src="assets/brand/icon-rounded.png" alt="Gecko" width="128" height="128" />
</p>

<h1 align="center">Gecko</h1>

<p align="center">记录 Mac 上的应用与窗口使用时间，在本地和 Web 控制台回看一天的活动。</p>

<p align="center">
  <a href="https://gecko.hexly.ai">站点</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Gecko 由 macOS 菜单栏应用和 Web 控制台组成。Mac 端记录前台应用、窗口标题及支持的浏览器页面信息，保存为本地会话；开启同步后，Web 端按日期汇总使用时间、应用分布和活动时间线。

它面向个人的时间回顾和专注习惯观察。日常统计来自会话记录，AI 分析是可选功能，需要配置自己的模型服务；分析结果是对已记录活动的解释，不能据此完整衡量工作产出。

## 功能

- 跟踪前台应用与窗口变化，识别闲置、锁屏和睡眠；结合事件通知和自适应定时检查更新会话。
- 读取 Chrome、Safari、Edge、Brave、Arc、Vivaldi 当前标签页的 URL、标题和标签页数量，需要相应 macOS 自动化权限。
- 将会话写入本地 SQLite；可暂停跟踪、设置数据库位置和登录时启动。
- 通过 HTTPS 和设备 API key 批量同步到 Web 服务，在断网后继续保留本地记录。
- 在 Web 端查看每日统计、应用排行、会话时间线，维护应用分类、标签、备注和时区。
- 使用配置的 Anthropic / OpenAI 兼容模型生成每日分析，可编辑提示词并开启自动回顾；配置 Dove 后可发送分析邮件。
- 管理同步 API key，通过 `/api/v1/snapshot?date=YYYY-MM-DD` 读取当天统计和已有分析，并通过 Backy 推送或恢复备份。

未开启同步时，记录留在 Mac 的数据库中。开启后，会话字段会上传到配置的服务；请求 AI 分析时，会话信息及应用上下文会发送给所选模型服务。窗口标题与 URL 的完整程度受应用接口和系统权限影响。

## 使用

### Mac 应用

需要 macOS 14+。当前最新 GitHub Release 仅提供源码，按下方开发步骤构建并运行 Mac 应用。

首次启动后，按应用提示授予辅助功能和自动化权限，再开始跟踪。应用常驻菜单栏，可打开记录窗口或设置页面。默认数据库路径为：

```text
~/Library/Application Support/ai.hexly.gecko/gecko.sqlite
```

### Web 与同步

打开[站点](https://gecko.hexly.ai)或自己的部署，通过 Google 登录。在 API 集成页面创建设备 API key，将 key 和部署地址填入 Mac 应用的同步设置并启用同步。key 保存在 macOS Keychain。

Mac 端当前默认地址为开发域名 `https://gecko.dev.hexly.ai`；使用线上站点时，需要主动改为 `https://gecko.hexly.ai`，自行部署则填写自己的 HTTPS 地址。同步需要可访问的服务和有效 key。

Web 端通过 `ALLOWED_EMAILS` 配置登录邮箱范围。自行部署时应填写自己的允许列表；空列表在当前实现中允许任何能够完成 Google OAuth 的账号。分类、标签、AI 设置和备份配置在 Web 控制台中管理。

## 开发

### 准备仓库

Web 需要 Node.js 22.12+ 和 Bun；Mac 需要 Xcode 16+、XcodeGen 和 macOS 14+。

```bash
git clone https://github.com/nocoo/gecko.git
cd gecko
bun install --frozen-lockfile
```

### Mac

`apps/mac-client/project.yml` 包含维护者的签名团队配置。自行构建时换成自己的 Apple Development 签名团队，再生成项目：

```bash
cd apps/mac-client
xcodegen generate
open Gecko.xcodeproj
cd ../..
```

在 Xcode 选择 Gecko scheme 构建运行。稳定的开发签名有助于保留 macOS 权限授权。需要打包 DMG 时，先安装 `create-dmg`，再从根目录运行 `bash scripts/build-dmg.sh`；脚本会重新创建根目录 `build/`。

### Web

从仓库根目录进入 Web 应用并安装依赖：

```bash
cd apps/web-dashboard
bun install --frozen-lockfile
cp .env.example .env.local
```

在 `.env.local` 填写 Google OAuth 的 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、会话密钥 `NEXTAUTH_SECRET`、实际访问地址 `NEXTAUTH_URL` 和 `ALLOWED_EMAILS`。本机 HTTP 开发可用 `NEXTAUTH_URL=http://localhost:7018`，Google OAuth 回调对应 `/api/auth/callback/google`。

数据库有两种模式：配置 `CF_ACCOUNT_ID`、`CF_API_TOKEN`、`CF_D1_DATABASE_ID` 使用自己的 Cloudflare D1，并按编号应用 [drizzle 迁移](apps/web-dashboard/drizzle/)；或用 `D1_LOCAL_PATH` 指向已初始化的本地 SQLite。下面的命令创建本地开发库，然后在启动时选择它：

```bash
bun run db:init .local/gecko-dev.db
D1_LOCAL_PATH=.local/gecko-dev.db bun run dev
```

打开 `http://localhost:7018`。`db:init` 会删除并重建指定数据库，只在需要初始化或清空该本地库时运行。AI、Dove 和 Backy 是可选配置，不是基础页面启动的前提。

在 `apps/web-dashboard/` 中运行 `bun run build` 构建，`bun run start` 启动生产服务。生产运行时使用 Node.js；[Dockerfile](apps/web-dashboard/Dockerfile) 用 Bun 安装/构建、Node 运行。根目录 `bun run typecheck` 与 `bun run lint` 检查 Web 类型和代码风格。

```text
apps/mac-client/       SwiftUI 应用、跟踪与同步服务、XCTest
apps/web-dashboard/    React / vinext 页面、API 和本地/远端数据库访问
apps/web-dashboard/drizzle/  云端数据库迁移
scripts/               Mac 构建与开发工具
docs/                  设计记录与英文 README
```

## 测试

从仓库根目录运行：

| 测试层 | 命令 |
| --- | --- |
| Web 单元与组件测试 | `bun run --cwd apps/web-dashboard test` |
| Web HTTP 集成测试 | `bun run --cwd apps/web-dashboard test:e2e` |
| Web 浏览器测试 | `bun run --cwd apps/web-dashboard test:bdd` |
| Mac 单元与集成测试 | `xcodebuild test -project apps/mac-client/Gecko.xcodeproj -scheme Gecko -destination 'platform=macOS' -only-testing:GeckoTests` |

浏览器测试首次运行前，在 `apps/web-dashboard/` 执行 `bunx playwright install chromium`。HTTP 与浏览器测试分别使用端口 `17018` 和 `27018`，会重建 `.local/gecko-test.db`；先停止其他 vinext 开发服务，并顺序运行这两组测试。普通测试不需要云端数据库；真实 AI 集成场景需按 `.env.e2e.example` 提供凭据，未配置时跳过。

Mac 测试需要完整 Xcode 和已生成的项目；测试无需签名的环境可追加 `CODE_SIGNING_ALLOWED=NO CODE_SIGN_IDENTITY=""`。Web 的 `test:coverage` 生成覆盖率报告，`test:watch` 进入监听模式。

## 技术栈

![Swift](https://img.shields.io/badge/Swift-F05138?logo=swift&logoColor=white)
![SwiftUI](https://img.shields.io/badge/SwiftUI-007AFF)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-F38020?logo=cloudflare&logoColor=white)

| 部分 | 实现 |
| --- | --- |
| Mac 应用 | Swift、SwiftUI、AppKit / NSWorkspace、AppleScript、GRDB |
| Web | TypeScript、React、vinext / Vite、Tailwind CSS、Radix UI、Recharts |
| 数据与身份 | 本地 SQLite、Cloudflare D1 REST API、NextAuth / Google OAuth |
| AI | AI SDK、`@nocoo/next-ai`，Anthropic / OpenAI 兼容接口 |
| 测试 | XCTest、Vitest、Bun HTTP 测试、Playwright |

依赖以 [Mac 项目配置](apps/mac-client/project.yml) 和 [Web package.json](apps/web-dashboard/package.json) 为准。

## 文档

- [数据库结构](docs/01-database-schema.md)
- [数据采集](docs/02-data-collection.md)
- [同步设计](docs/03-data-sync.md)
- [跟踪引擎架构](docs/06-energy-phase3-architecture.md)
- [每日回顾](docs/07-daily-review.md)
- [AI 集成](docs/10-next-ai-package.md)
- [变更记录](CHANGELOG.md)

设计文档保留了历史方案；当前运行方式和功能边界以本 README 与源码为准。

## 许可证

[MIT](LICENSE) © 2026 Zheng Li
