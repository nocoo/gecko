/**
 * Default prompt template sections and variable definitions.
 * Shared between the analyze route (server) and the settings UI (client).
 *
 * This file MUST NOT import any server-side modules (d1, settings-repo, etc.)
 * so it can be safely bundled in client components.
 */

/** Section 1 — Role & context (no template variables). */
export const DEFAULT_PROMPT_SECTION_1 =
  `你是一位专业的生产力分析师。请根据以下用户的电脑使用数据，给出深度分析报告。`;

/** Section 2 — Data injection (supports {{variable}} expansion). */
export const DEFAULT_PROMPT_SECTION_2 =
  `## 数据概览
- 分析日期：{{date}}
- 总活跃时长：{{totalDuration}} 分钟
- 总会话数：{{totalSessions}}
- 使用应用数：{{totalApps}}
- 活跃时间跨度：{{activeSpan}} 分钟{{idleNote}}

## 评分（规则计算）
- 专注度：{{scores.focus}}/100
- 深度工作：{{scores.deepWork}}/100
- 切换频率：{{scores.switchRate}}/100
- 集中度：{{scores.concentration}}/100
- 综合评分：{{scores.overall}}/100

## Top 应用
{{topApps}}
{{appContext}}
## 详细会话时间线
以下为按时间排列的所有会话，包含应用名、时长、窗口标题、浏览器URL等。
标记 [IDLE/锁屏] 的条目为系统闲置（如 loginwindow），不应计入有效工作时间。
浏览器条目包含 URL 和页面标题，请从中分析用户实际浏览的内容主题。

{{timeline}}`;

/** Section 3 — Analysis rules (no template variables). */
export const DEFAULT_PROMPT_SECTION_3 =
  `## 分析要求

### 重要规则
1. **loginwindow / ScreenSaver 等闲置进程**：这些代表电脑在锁屏或无人操作状态，评价生产力时应排除，不作为前台积极工作。
2. **浏览器内容分析**：重点分析浏览器的 URL 和标题，判断用户是在工作（查文档、写代码、看技术文章）还是在休闲（社交媒体、视频、新闻）。
3. **时段划分**：将一天划分为 3-6 个时段，每个时段给出 focus 方向标签和描述。时段的划分应基于实际工作内容的切换，而非固定间隔。
4. **应用上下文**：如果提供了"应用上下文"部分，请结合用户对应用的分类、标签和备注来理解每个应用的实际用途。用户的备注是最可靠的上下文来源，比单纯从应用名推测更准确。
5. **切换频率的智能解读**：
   - 切换频率评分只统计"深度切换"（切换后在新应用停留超过5分钟）
   - 评价切换质量时，必须结合应用分类：
     - **同类工具切换**（如 IDE ↔ Terminal ↔ 浏览器看 localhost）属于正常开发工作流，不应视为注意力分散
     - **工作→娱乐切换**（如 IDE → 社交媒体/视频网站）才是真正的分心
   - 分析时请明确区分"工作流内切换"和"分心切换"，给出具体例子
   - 如果用户已对应用设置了分类或标签，优先使用这些信息判断切换性质`;

/** Section 4 — Output format (no template variables). */
export const DEFAULT_PROMPT_SECTION_4 =
  `### 输出格式
请以 JSON 格式返回分析结果，包含以下字段：
- score: 你给出的综合评分（1-100整数，基于实际有效工作，排除闲置时间）
- highlights: 今日亮点（字符串数组，2-4条，中文）
- improvements: 改进建议（字符串数组，2-4条，中文）
- timeSegments: 时段分析（对象数组，3-6条），每个对象包含：
  - timeRange: 时间范围，如 "09:00-11:30"
  - label: 该时段的 focus 方向标签，如 "前端开发"、"文档阅读"、"休息/闲置"
  - description: 该时段的简要描述（中文，1-2句话）
- summary: 综合总结（Markdown 格式，中文，300-500字，包含对工作内容和浏览内容的深度分析）

### JSON 严格语法要求（重要）
- **只**返回 JSON，不要包含任何前后缀、解释、Markdown 代码块包裹。
- 所有结构性符号必须使用 **ASCII 半角**：逗号 \`,\`、冒号 \`:\`、引号 \`"\`、方括号 \`[ ]\`、花括号 \`{ }\`。
- **禁止**使用中文/全角标点作为 JSON 分隔符：\`，\`、\`、\`、\`：\`、\`"\`、\`"\`、\`【\`、\`】\` 都不能出现在字符串之外。
- 字段名必须用 ASCII 双引号包裹。
- 不要在数组或对象最后一个元素后保留尾随逗号（trailing comma）。
- 字符串内部的中文标点可以正常使用，但**字符串外**的所有语法符号必须是 ASCII。`;

/** All template variables available for Section 2 with descriptions and examples. */
export const PROMPT_TEMPLATE_VARIABLES = [
  { key: "date", description: "分析日期", example: "2026-03-06" },
  { key: "totalDuration", description: "总活跃时长（分钟）", example: "342" },
  { key: "totalSessions", description: "总会话数", example: "47" },
  { key: "totalApps", description: "使用应用数", example: "12" },
  { key: "activeSpan", description: "活跃时间跨度（分钟）", example: "540" },
  { key: "idleNote", description: "闲置时间说明（可为空）", example: "\n- 闲置/锁屏时间：30 分钟..." },
  { key: "scores.focus", description: "专注度评分", example: "75" },
  { key: "scores.deepWork", description: "深度工作评分", example: "60" },
  { key: "scores.switchRate", description: "切换频率评分", example: "80" },
  { key: "scores.concentration", description: "集中度评分", example: "70" },
  { key: "scores.overall", description: "综合评分", example: "71" },
  { key: "topApps", description: "Top 10 应用列表（多行）", example: "1. VS Code — 120min (8 sessions)\n2. Chrome — 45min (12 sessions)\n3. Slack — 20min (5 sessions)" },
  { key: "appContext", description: "应用上下文标注（可为空）", example: "## 应用上下文（用户标注）\n以下是用户对部分应用的分类、标签和备注说明：\n- **com.google.Chrome** | 分类: 浏览器 | 标签: 工作, 摸鱼\n- **com.tinyspeck.slackmacgap** | 分类: 沟通 | 备注: 团队日常沟通" },
  { key: "timeline", description: "详细会话时间线（多行）", example: "[09:00] VS Code (30min) — \"main.ts\"\n[09:32] Chrome (5min) — \"Stack Overflow\" | URL: stackoverflow.com/...\n[09:37] loginwindow (15min) [IDLE/锁屏]" },
] as const;
