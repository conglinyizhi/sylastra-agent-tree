# src/hooks/json-error-recovery/

## 职责

- 检测工具输出中可能的 JSON 语法/解析失败，并追加一个强有力且不冗余的恢复提示，使模型在重试时重新提交修正后的 JSON。

## 设计

- `hook.ts` 包含实现，导出常量：
  - `JSON_ERROR_TOOL_EXCLUDE_LIST`
  - `JSON_ERROR_PATTERNS`
  - `JSON_ERROR_REMINDER`
- `createJsonErrorRecoveryHook(_ctx)` 返回一个 `tool.execute.after` 处理器，在解析失败时追加提醒文本。
- `JSON_ERROR_REMINDER_MARKER` 防止递归的重复注入。
- 通过 `Set` 以小写工具名称（`bash`、`read`、`glob`、网络工具）排除。
- 匹配使用 `JSON_ERROR_PATTERNS` 中的正则表达式字面量，并对非字符串输出短路处理。
- `index.ts` 仅重新导出钩子/常量的公共接口。

## 流程

1. 在 `tool.execute.after` 中，将 `input.tool` 规范化为小写并跳过排除的工具。
2. 当 `output.output` 不是字符串时跳过。
3. 如果输出已包含 `JSON_ERROR_REMINDER_MARKER` 则跳过。
4. 评估所有 `JSON_ERROR_PATTERNS`；匹配时，将 `\n${JSON_ERROR_REMINDER}` 追加到 `output.output`。

## 集成

- 从 `src/hooks/index.ts` 导出，在插件注册时附加到工具输出生命周期。
- 仅消费钩子负载契约（`ToolExecuteAfterInput`、`ToolExecuteAfterOutput`）和标准字符串检查，使其跨工具通用。
- 无直接工具内部依赖；通过在结果返回模型之前观察工具调用来集成。
