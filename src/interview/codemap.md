# src/interview/

## 职责

- 实现 `/interview` 命令流程：
  - 命令注册和执行前拦截，
  - 交互式有状态面试提示，
  - Markdown 文档生成/持久化，
  - 本地 HTTP UI 服务器和共享仪表盘模式。
- 保持面试生命周期在以下各层同步：
  - 内存中的会话/面试映射，
  - `outputFolder` 下的 Markdown 产物，
  - 用于跨进程恢复和浏览器轮询的仪表盘缓存。
- 支持两种运行时模式：
  - **每会话模式**（本地面试服务器）
  - **仪表盘模式**（分布式缓存 + 共享面试页面）。

## 设计

- `index.ts` 导出 `createInterviewManager`。

- `manager.ts`（组合根）
  - 创建一次 `createInterviewService(ctx, interviewConfig)`。
  - 通过 `interview.dashboard === true || interview.port > 0` 选择模式。
  - 在仪表盘模式下：
    - 调用 `tryBecomeDashboard(...)` 选举一个进程作为仪表盘，
    - 非仪表盘进程通过 `readDashboardAuthFile(port)` 读取认证令牌，
    - 会话通过 `/api/register` 注册，并通过 `/api/interviews/{id}/state` 同步状态，
    - 10 秒回退轮询确保在需要时 answer/nudge 仍能送达。
  - 返回事件钩子：
    `registerCommand`、`handleCommandExecuteBefore`、`handleEvent`。

- `createInterviewService`（`service.ts`）
  - 管理面试领域映射：
    - `interviewsById`、`activeInterviewIds`、`sessionBusy`、`sessionModel`。
  - 创建和恢复面试：
    - `resolveExistingInterviewPath`、`createInterview`、`resumeInterview`。
  - 从会话消息同步状态：
    - 加载消息，
    - 通过 `findLatestAssistantState` 提取助手状态，
    - 必要时通过 `buildFallbackState` 回退，
    - 使用 `rewriteInterviewDocument` 重写 Markdown。
  - 注入提示词：
    - 启动提示（`buildKickoffPrompt`），
    - 恢复提示（`buildResumePrompt`），
    - answer/nudge 处理（`buildAnswerPrompt`、`handleNudgeAction`）。
  - 处理事件：
    - `session.status` 更新忙碌跟踪，
    - `session.deleted` 标记面试已遗弃并清理映射。
  - 推送更新：
    - `onStateChange` 回调（用于仪表盘模式），
    - `onInterviewCreated` 回调（用于即时注册），
    - 可选的 `openBrowser`（用于初始 UI 打开）。

- `createInterviewServer`（`server.ts`）
  - 拥有每个会话的 HTTP 端点和 HTML 渲染器绑定。
  - 支持：
    - `GET /`、`GET /api/interviews`、`GET /interview/{id}`
    - `GET /api/interviews/{id}/state`
    - `POST /api/interviews/{id}/answers`
    - `POST /api/interviews/{id}/nudge`
  - 在 `getSubmissionStatus` 中将领域错误映射为 HTTP 状态码。

- `dashboard.ts`
  - 实现共享仪表盘服务器和状态缓存。
  - 认证路径：
    - 随机令牌写入 `${XDG_DATA_HOME}/opencode/.dashboard-<port>.json`，
    - 通过 cookie、查询令牌或 Bearer 头部进行验证。
  - 内存状态/缓存约定：
    - `sessions` 注册表，
    - `stateCache` 以面试 ID 为键，
    - 待处理的 answer 和 nudge 操作具有消费即读语义。
  - 恢复/扫描：
    - 从 Markdown frontmatter 定期执行 `rebuildFromFiles()`，
    - 通过 SDK + 手动文件夹发现会话目录，
    - 在已知目录和缓存的文件列表中扫描文件。
  - TTL 清理在 24 小时后移除终止状态。

- 辅助模块：
  - `document.ts`：Markdown/文件辅助函数（`slugify`、路径解析、frontmatter、标题/摘要提取）。
  - `parser.ts`：助手状态解析流水线（`parseInterviewState`、`findLatestAssistantState`、`buildFallbackState`）。
  - `prompts.ts`：创建/恢复/回答/nudge 的提示词模板。
  - `helpers.ts`：请求解析和 HTML/JSON 响应辅助函数。
  - `types.ts`：领域 schema 和面试约定。

## 流程

- `src/index.ts` 通过 `createInterviewManager(ctx, config)` 连接此文件夹。

- **每会话模式**
  - 创建服务并绑定到惰性 `createInterviewServer({ port: 0 })`，
  - 命令钩子直接流入服务。

- **仪表盘模式**
  1. `createInterviewManager` 调用 `tryBecomeDashboard`。
  2. 仪表盘选举成功：
     - 仪表盘保留本地缓存回调（`setStatePushCallback`、`setOnInterviewCreated`），
     - 自行注册会话目录并重建文件派生的状态。
  3. 选举失败：
     - 进程成为客户端会话，
     - 读取令牌文件，
     - 向仪表盘注册，
     - 通过 HTTP 推送状态 + 面试创建，
     - 空闲时轮询 `/pending` 和 `/nudge`。
  4. 如果探测+回退失败两次，管理器回退到每会话服务器。

- `handleCommandExecuteBefore`
  - 空白输入且没有活跃面试时开始构思，
  - 匹配的 slug/路径恢复已有面试，
  - 否则创建新面试并注入启动提示。

- `handleEvent`
  - 在 `session.status: idle` 时：
    - 先消费仪表盘待处理的 answer/nudge，
    - 然后刷新面试状态以确保 `sessionBusy` 准确反映。
  - 在 `session.deleted` 时：
    - 从仪表盘和本地记账中取消注册会话。

## 集成

- 由 `src/index.ts` 用作面试插件模块。
- 使用 OpenCode SDK 会话 API 进行消息、提示词和状态事件。
- 使用本地 HTTP 服务器约定用于：
  - 仪表盘浏览，
  - 浏览器 ↔ 会话同步端点，
  - 手动文件/发现设置。
- 现有测试覆盖了 `src/interview/*.test.ts` 下的 service、parser、manager、server、dashboard 和 helpers。
