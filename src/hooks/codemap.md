# src/hooks/

此目录是插件级别的钩子组合表面。它导出供 `src/index.ts`（工具转换、事件监听器和命令钩子）使用的所有基于钩子的运行时行为的工厂和管理器。

## 职责

- 拥有钩子模块的稳定导出，使 `src/index.ts` 能够注册功能而无需依赖子文件夹内部实现。
- 描述 OpenCode 钩子表面与协调重试、定时器和会话跟踪的内部状态机之间的生命周期边界。
- 集中编排器工具、委托/任务工作流和会话生命周期处理程序使用的所有钩子功能入口点。

## 设计

- `src/hooks/index.ts` 重新导出每个功能的工厂和管理器。
- 大多数功能实现 `create*Hook(ctx, config?)` 工厂模式并返回生命周期回调。
- 前台回退作为管理器类（`ForegroundFallbackManager`）提供，具有显式的 `handleEvent` 方法。
- `task-session-manager` 持久化每个父会话和每个 agent 的可恢复任务会话，具有有限的历史和别名功能。
- 副作用限制在导出的处理程序和专用工具函数内，以保持钩子行为的确定性。
- 运行时集成依赖于 `PluginInput.client` 获取会话 API 和共享工具（`log`、标记常量、提示辅助函数）。

## 流程

1. `src/index.ts` 从该文件夹导入每个钩子符号。
2. 插件在启动时创建钩子实例，并在以下表面注册回调：
   - `tool.execute.before`
   - `tool.execute.after`
   - `experimental.chat.messages.transform`
   - `experimental.chat.system.transform`
   - `chat.headers`
   - `chat.message`
   - `command.execute.before`
   - `event`
3. 实现要么修改 OpenCode 有效载荷（用于带内指导或提示/系统注入），要么调用会话 API（`todo`、`messages`、`prompt`、`promptAsync`、`abort` 以及事件/状态流）。

## 钩子点

| 钩子点 | 用途 | 实现 |
|---|---|---|
| `tool.execute.before` | 预处理工具输入 | `apply-patch`、`task-session-manager` |
| `tool.execute.after` | 后处理工具输出 | `delegate-task-retry`、`json-error-recovery`、`post-file-tool-nudge`、`task-session-manager` |
| `experimental.chat.messages.transform` | 重写出站用户内容 | `filter-available-skills`、`phase-reminder` |
| `experimental.chat.system.transform` | 注入系统级指令 | `todo-continuation`、`post-file-tool-nudge`、`task-session-manager` |
| `chat.headers` | 修改请求头 | `chat-headers` |
| `chat.message` | 跟踪运行时会话/agent 映射 | `todo-continuation` |
| `command.execute.before` | 处理斜杠命令 UX | `todo-continuation`（`auto-continue`） |
| `event` | 响应会话生命周期和运行时故障 | `foreground-fallback`、`todo-continuation`、`post-file-tool-nudge`、`auto-update-checker`、复用器管理器、`task-session-manager` |

## 实现说明

- `createDelegateTaskRetryHook`（`tool.execute.after`）是一个窄守卫，围绕 `task` 工具失败字符串，并内联附加结构化的重试指导。
- `ForegroundFallbackManager` 监听事件流量，并通过中止当前提示并将最新用户消息重新排队到每个 agent 链中的下一个模型来修复前台速率限制失败。
- `createTodoContinuationHook` 跨越多个表面：消息转换、系统转换、命令拦截、工具后处理和事件。它拥有自动注入状态、冷却期、抑制窗口和编排会话跟踪。
- `createTaskSessionManagerHook` 跟踪任务会话以实现可恢复性：生成面向用户的别名、在委托前解析别名/任务 ID、在完成后记住新任务 ID，并在缺失会话失败、重命名任务 ID 或会话删除时丢弃过期条目。

## 集成

- `src/index.ts` 是唯一的运行时消费者，并确定最终注册顺序，以便组合转换（系统连接、提醒插入、卫生处理）保持确定性。
- `taskSessionManager` 在 `tool.execute.before`、`tool.execute.after`、`experimental.chat.system.transform` 和 `event` 中注册，带有父/子清理。
- `src/hooks/*/codemap.md` 文件记录了每个功能的内部实现。
