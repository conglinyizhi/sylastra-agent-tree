# src/hooks/todo-continuation/

## 职责

为未完成的待办列表实现仅编排器（orchestrator）的自动继续功能，并配有严格的安全控制，以确保自动化不会陷入循环或与用户对抗。同时，在相关工具操作后托管待办状态卫生提醒。

## 设计

- `index.ts` 导出 `createTodoContinuationHook(ctx, config?)`，返回：
  - `handleMessagesTransform`
  - `handleChatSystemTransform`
  - `handleToolExecuteAfter`
  - `handleEvent`
  - `handleChatMessage`
  - `handleCommandExecuteBefore`
  - 包含 `auto_continue` 的 `tool` 映射
- 状态模型（`ContinuationState`）跟踪：
  - 启用标志、连续继续次数、冷却计时器
  - 中止后的抑制窗口、orchestrator 会话 ID
  - 进行中的通知和注入防护
- `todo-hygiene.ts` 负责轻量级提醒的布防/注入，利用待办队列转换和消息上下文信号。
- 请求签名用于 `handleMessagesTransform` 中，以避免每个请求的重复工作。

## 流程

### 自动继续路径

1. `handleMessagesTransform` 识别最新的外部用户消息，推断会话/代理，并为 orchestrator 会话启动一个新的继续周期。
2. 在 `session.idle`/空闲的 `session.status` 时，如果已启用，钩子验证：未完成的待办、非疑问的最后助手消息、最大继续次数限制、抑制/通知防护、以及计时器/注入状态。
3. 如果所有防护检查通过，则调度一个冷却计时器，并通过 `session.prompt` 发送一条轻量级的无需回复通知。
4. 冷却后，通过 `session.prompt` 注入 `CONTINUATION_PROMPT`，更新 `consecutiveContinuations`，并记录进度。
5. 事件处理重置计数器、清除待处理计时器，或在出现类似中止的错误时应用一个短暂的抑制窗口。
6. 在 `session.deleted` 时，orchestrator 会话状态被拆除，通知状态被清除。

### 命令路径

1. `handleCommandExecuteBefore` 在运行时执行前拦截 `/auto-continue`。
2. 它切换启用状态（`on`、`off` 或翻转），根据需要清除计时器，并将直接的状态响应注入到输出部分中。
3. 当启用且有待办项待处理时，追加继续就绪状态文本；当没有待办项时，报告该状态。

### 待办卫生路径

1. `createTodoHygiene.handleToolExecuteAfter` 在支持的工具活动后布防提醒，并对特定工具包含重置/忽略规则。
2. `createTodoHygiene.handleChatSystemTransform` 在仍有未完成待办时，每个请求注入一条提醒（`TODO_HYGIENE_REMINDER` 或 `TODO_FINAL_ACTIVE_REMINDER`）。
3. `handleEvent` 在 `session.deleted` 时清除卫生状态。

## 集成

- 在 `src/index.ts` 中注册，涉及：
  - `experimental.chat.messages.transform`
  - `experimental.chat.system.transform`
  - `chat.message`
  - `command.execute.before`
  - `event`
  - `tool.execute.after`
- 使用共享工具：`log`、`createInternalAgentTextPart` 和 `SLIM_INTERNAL_INITIATOR_MARKER`。
- 会话/代理身份通过 `session.message` 事件协调，并在插件中维护以确保服务模式路由的一致性。
