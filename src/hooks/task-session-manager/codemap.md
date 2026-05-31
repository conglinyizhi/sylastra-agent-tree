# src/hooks/task-session-manager/

## 职责

为 `task` 工具调用提供可恢复任务状态，使编排器（orchestrator）用户能够通过短别名（`exp-1`、`ora-2`）而非原始子会话 ID 在父会话中恢复工作。

## 设计

- `createTaskSessionManagerHook(ctx, options)` 返回以下处理器：
  - `tool.execute.before`
  - `tool.execute.after`
  - `experimental.chat.system.transform`
  - `event`
- 内部使用 `src/utils/session-manager.ts` 中的 `SessionManager` 来存储已记忆的任务会话，并限制每个代理的历史记录。
- 任务标签通过 `deriveTaskSessionLabel` 从 `description`/`prompt` 派生，并由 `SessionManager` 转换为紧凑别名。
- 正在进行的调用通过 `callID` 在有上限的有序映射（`MAX_PENDING_TASK_CALLS`）中跟踪，以安全地重写输入和关联输出。
- 会话治理通过 `shouldManageSession(sessionID)` 进行特性开关控制，使钩子仅对 orchestrator 管理的会话生效。

## 流程

1. `tool.execute.before` 接收到 `task` 调用。
2. 如果 `subagent_type` 是已识别的代理，则派生一个短标签。
3. 当提供了 `task_id` 时，尝试针对当前父会话/代理的记忆别名进行解析。
4. 成功时，将 `args.task_id` 重写为真实任务 ID；解析失败时则移除它以强制创建新任务。
5. 调用元数据存储在待处理调用映射中，用于关联后续的 post-tool 事件。
6. `tool.execute.after` 从 `task` 输出文本中读取输出任务 ID。
7. 首次成功解析时，它会 `remember()` 该任务条目并将其与别名映射关联。
8. 如果此次调用是恢复尝试，且返回的 ID 发生了变化，则删除陈旧的前驱别名。
9. 如果恢复返回类似 `[ERROR] Session not found`/`Session no session` 的错误，则删除前驱别名，使后续命令回退到全新执行。
10. `experimental.chat.system.transform` 在 `### Resumable Sessions` 下注入来自 `SessionManager.formatForPrompt` 的渲染块。
11. 在 `session.deleted` 时，钩子清除该父会话的所有任务状态，并移除该父会话的任何待处理任务调用记录。

## 集成

- 在 `src/index.ts` 中连接：
  - 在 `tool.execute.before` 中调用
  - 在 `tool.execute.after` 中调用
  - 注入到 `experimental.chat.system.transform`
  - 在 `event` 的 `session.deleted` 中进行清理
- 除钩子处理和 `SessionManager` 外无其他副作用。
- 依赖：
  - `SessionManager` 和 `deriveTaskSessionLabel`（来自 `src/utils/session-manager.ts`）
  - `parseTaskIdFromTaskOutput`（来自 `src/utils/task.ts`）
  - 插件配置（`maxSessionsPerAgent`）和来自 `src/index.ts` 的运行时会话过滤（`shouldManageSession`）
