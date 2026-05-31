# src/hooks/foreground-fallback/

## 职责

为前台（交互式）会话提供响应式模型回退，当在事件流中检测到速率限制或提供商限制信号时触发。

## 设计

- `index.ts` 导出：
  - `ForegroundFallbackManager`
  - `isRateLimitError(error)`
- 管理器状态包含每个会话的映射：
  - 当前模型（`sessionModel`）
  - 映射代理（`sessionAgent`）
  - 已尝试模型（`sessionTried`）
  - 去重时间戳（`lastTrigger`）
  - 执行中的回退锁（`inProgress`）
- 速率限制检测基于正则表达式，并检查结构化负载字段（`message`、`statusCode`、`data.message`、`data.responseBody`）。
- 回退选择使用有优先级的 `resolveChain(agentName, currentModel)`：
  1. 精确代理链（如已配置）
  2. 若代理已知但未配置，则不使用链
  3. 从当前模型推断
  4. 跨所有链的扁平化回退
- 重新提交使用 `client.session.promptAsync`，传入最后用户消息部分和解析后的 `{ providerID, modelID }` 目标。

## 流程

1. `handleEvent` 接收每个插件事件。
2. 在 `message.updated`、`session.error` 和重试的 `session.status` 时，检查速率限制标记，匹配时调用 `tryFallback(sessionID)`。
3. `subagent.session.created` 更新会话到代理的映射，以便更好的链解析。
4. `tryFallback(sessionID)` 强制执行：
   - 功能启用标志，
   - 一次一个锁，
   - 去重窗口（`DEDUP_WINDOW_MS = 5000`）。
5. 它将当前模型标记为已尝试，从链中选择下一个未尝试的模型，通过 `session.messages` 获取最新用户消息，通过 `session.abort()` 中止当前提示，等待 500 毫秒，然后使用 `promptAsync` 重新提示。
6. 成功则更新会话模型记忆；失败则记录结构化诊断信息。
7. `session.deleted` 清理删除所有每个会话的记账信息，避免内存增长。

## 集成

- 通过 `src/index.ts` 中的插件级别 `event` 钩子连接。
- 使用 `ctx.client.session` API（`messages`、`abort`、`promptAsync`），并依赖于配置提供的运行时回退链。
- 设计为交互式会话的安全网，在委托/调用方侧的重试逻辑不可用或为时已晚时使用。
