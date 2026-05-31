# src/hooks/delegate-task-retry/

## 职责

通过分析工具输出并追加简洁的重试提示，为失败的委托（`task`）调用提供有针对性的恢复指引，同时保留现有模型对话上下文。

## 设计

- `index.ts` 重新导出：
  - `createDelegateTaskRetryHook`
  - `buildRetryGuidance`
  - 模式类型/辅助函数
- `patterns.ts` 定义了带类型的 `DelegateTaskErrorPattern` 契约和有序的检测目录（`DELEGATE_TASK_ERROR_PATTERNS`）。
- `detectDelegateTaskError(output)`：
  1. 确保输出为字符串，
  2. 需要包含通用错误指示器之一，
  3. 返回第一个匹配的已配置错误模式。
- `buildRetryGuidance(errorInfo)` 将每个匹配映射为面向用户的修复文本，可选地追加从工具输出中解析的 `Available:` 建议。
- `hook.ts` 返回一个 `tool.execute.after` 处理器，仅修改字符串输出。

## 流程

1. OpenCode 在 `task` 执行后调用处理器，传入 `{ tool, output }`。
2. 钩子忽略非 `task` 工具和非字符串输出。
3. 如果输出通过了通用错误信号检查，`detectDelegateTaskError` 扫描已配置的模式。
4. 匹配后，将包含修正指引和示例 `task(...)` 用法的内联文本追加到 `output.output`。
5. 不产生额外的 API 调用；行为是同步的字符串级别恢复。

## 集成

- 在 `src/index.ts` 中注册为 `tool.execute.after`。
- 输入负载期望最小化（`{ tool: string }` + `{ output: unknown }`），以保持与工具回调形状一致，避免影响无关的回调。
- 此钩子保持独立于编排引擎和多路复用器/会话管理器。
