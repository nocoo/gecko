# 数据库 Schema

## 概述

Gecko 使用 SQLite 作为本地持久化存储，通过 [GRDB.swift](https://github.com/groue/GRDB.swift) 进行线程安全的读写操作。

- **存储路径**: `~/Library/Application Support/com.gecko.app/gecko.sqlite`
- **日志模式**: WAL（Write-Ahead Logging），提升并发读写性能
- **外键约束**: 已启用
- **设计目标**: macOS 客户端与未来 Web Dashboard 共享同一数据库文件

## 表结构

### `focus_sessions`

记录用户的焦点会话（每次窗口切换产生一条记录）。

| 列名 | SQLite 类型 | 约束 | 迁移版本 | 说明 |
|---|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | v1 | UUID 字符串，由 `UUID().uuidString` 生成 |
| `app_name` | TEXT | NOT NULL | v1 | 应用名称，如 "Google Chrome"、"Cursor" |
| `window_title` | TEXT | NOT NULL | v1 | 当前窗口标题 |
| `url` | TEXT | 可空 | v1 | 浏览器当前页面 URL（非浏览器应用为 nil） |
| `start_time` | DOUBLE | NOT NULL | v1 | 会话开始时间（Unix 时间戳，秒） |
| `end_time` | DOUBLE | NOT NULL | v1 | 会话结束时间（Unix 时间戳，秒） |
| `duration` | DOUBLE | NOT NULL, DEFAULT 0 | v1 | 会话持续时间（秒），`end_time - start_time` 的冗余字段 |
| `bundle_id` | TEXT | 可空 | v2 | 应用 Bundle ID，如 "com.google.Chrome" |
| `tab_title` | TEXT | 可空 | v2 | 浏览器标签页标题 |
| `tab_count` | INTEGER | 可空 | v2 | 浏览器当前打开的标签页数量 |
| `document_path` | TEXT | 可空 | v2 | 编辑器/IDE 当前打开的文档路径（通过 Accessibility API 获取） |
| `is_full_screen` | BOOLEAN | DEFAULT false | v2 | 窗口是否处于全屏状态 |
| `is_minimized` | BOOLEAN | DEFAULT false | v2 | 窗口是否处于最小化状态 |

## 迁移历史

### v1: `v1_create_focus_sessions`

创建 `focus_sessions` 基础表，包含 7 个核心字段。

```sql
CREATE TABLE focus_sessions (
    id           TEXT PRIMARY KEY,
    app_name     TEXT NOT NULL,
    window_title TEXT NOT NULL,
    url          TEXT,
    start_time   DOUBLE NOT NULL,
    end_time     DOUBLE NOT NULL,
    duration     DOUBLE NOT NULL DEFAULT 0
);
```

### v2: `v2_add_rich_context`

新增 6 个富上下文字段，用于捕获更丰富的焦点信息。

```sql
ALTER TABLE focus_sessions ADD COLUMN bundle_id       TEXT;
ALTER TABLE focus_sessions ADD COLUMN tab_title       TEXT;
ALTER TABLE focus_sessions ADD COLUMN tab_count       INTEGER;
ALTER TABLE focus_sessions ADD COLUMN document_path   TEXT;
ALTER TABLE focus_sessions ADD COLUMN is_full_screen  BOOLEAN DEFAULT 0;
ALTER TABLE focus_sessions ADD COLUMN is_minimized    BOOLEAN DEFAULT 0;
```

## 设计决策

### `duration` 是冗余字段

`duration` 始终等于 `end_time - start_time`，属于反范式设计。保留它是为了简化查询（如按持续时间排序、聚合统计），避免在每次查询时计算。

### `isActive` 是计算属性

活跃会话通过 `duration == 0 && endTime == startTime` 判断，而非数据库中的独立字段。这意味着刚创建的会话（尚未调用 `finish()`）会被视为活跃状态。

### 空字符串 vs nil

`url` 等可空字段中，空字符串 `""` 和 `nil` 是不同的值。空字符串会被原样存储，不会被强制转换为 nil。

### CodingKeys 映射

Swift 模型使用 camelCase，数据库列使用 snake_case。通过 `CodingKeys` 枚举完成映射：

| Swift 属性 | 数据库列名 |
|---|---|
| `appName` | `app_name` |
| `windowTitle` | `window_title` |
| `startTime` | `start_time` |
| `endTime` | `end_time` |
| `bundleId` | `bundle_id` |
| `tabTitle` | `tab_title` |
| `tabCount` | `tab_count` |
| `documentPath` | `document_path` |
| `isFullScreen` | `is_full_screen` |
| `isMinimized` | `is_minimized` |

## CRUD 操作

通过 `DatabaseService` 协议抽象，支持依赖注入和测试 mock：

| 方法 | 说明 |
|---|---|
| `insert(_:)` | 插入新会话 |
| `update(_:)` | 更新已有会话（如结束时设置 duration） |
| `save(_:)` | Upsert 操作（存在则更新，不存在则插入） |
| `fetchRecent(limit:)` | 按 `start_time` 降序获取最近的会话，默认 50 条 |
| `fetch(id:)` | 按 ID 查询单条会话 |
| `count()` | 返回会话总数 |
| `deleteAll()` | 清空所有会话数据 |
