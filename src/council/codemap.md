# Council 模块 Codemap

## 职责

`src/council/` 编排并行/串行的多 LLM council 会话，并生成规范化的 councillor 结果供 `council` agent 综合使用。

它在设计上专注于执行：

- 校验 council 配置 + preset 选择，
- 启动并监控 councillor 子会话，
- 规范化输出 + 重试行为，
- 向调用工具返回结构化结果对象。

提示词模板和工具 schema 定义在 `agents/` 和 `tools/` 中。

## 架构

- `council-manager.ts` 是核心引擎。
- `index.ts` 是模块的桶文件（barrel）。

### council-manager 职责

- 读取注入的插件上下文（`PluginInput`）和可选的：
  - 配置（`PluginConfig`），
  - `SubagentDepthTracker`，
  - `tmuxEnabled` 标志（用于面板启动节奏控制）。
- 拥有运行时辅助函数：
  - `runCouncil()` 编排入口，
  - `runCouncillors()` 扇出策略，
  - `runCouncillorWithRetry()` 和 `runAgentSession()` 用于每个 councillor 的生命周期。
- 使用 `utils/session.ts` 中的共享会话工具：
  - `parseModelReference` 用于模型字符串校验，
  - `promptWithTimeout` 用于有超时限制的提示调用，
  - `extractSessionResult` 用于收集助手文本，
  - `shortModelLabel` 用于 UI 友好的模型名称。
- 将提示/结果格式化委托给 `agents/council.ts` 中的 `formatCouncillorPrompt` 和 `formatCouncillorResults`。

## 运行时流程

```text
runCouncil(prompt, presetName?, parentSessionId)
  ├─> 使用 SubagentDepthTracker 强制执行最大深度
  ├─> 从插件配置加载 council 配置
  ├─> 解析 preset（回退：default_preset -> "default"）
  ├─> preset 缺失或为空时快速失败
  ├─> 向父会话发送开始通知（尽力而为，非阻塞）
  ├─> 解析运行时策略
  │     超时、执行模式、重试预算
  ├─> 以选定的模式运行 councillors
  │     - runAgentSession：创建 -> 注册深度 -> 可选 tmux 延迟
  │       -> 提示 -> 提取文本 -> finally 中中止会话
  │     - runCouncillorWithRetry：仅对 "空响应" 重试
  │       最多 `councillor_retries` 次
  │     - 并行模式使用索引错开以减少面板启动冲突
  ├─> 聚合结果，附带每个 councillor 的状态
  ├─> 如果没有完成的 councillor：返回失败结果
  └─> 格式化并返回结果供调用者综合
```

## 错误与结果模型

- 每个 councillor 返回状态：
  - `completed` 附带 `result` 文本，
  - `failed` 附带 `error`，
  - `timed_out` 附带超时消息。
- 空的 provider 响应被视为失败，除非通过 `fallback.retry_on_empty` 禁用了失败重试。
- 单个 councillor 的格式错误的模型字符串会作为该 councillor 的失败显示；会话仍会继续处理其余 councillor。
- 深度限制违规会返回硬失败（`子 agent 深度超限`），不会启动任何 councillor 会话。

## 配置语义（委托给 schema）

在 `config/council-schema.ts` 中校验，在 `runCouncil` 中消费：

- `presets` 包含每个 preset 的 councillor 定义，
- `default_preset`，
- `timeout`，
- `councillor_execution_mode`（`parallel`/`serial`），
- `councillor_retries`。

旧版 schema 行为：

- 嵌套的旧版 `councillors` 键被展开，
- 顶层 `master` 键在 preset 级别被忽略，
- 弃用的 `master` 字段被记录（通过 `_deprecated`）并以警告形式呈现给调用者，同时保留 `_legacyMasterModel` 用于回退消息。

## 集成点

- **工具调用者：** `tools/council.ts` 创建 `council_session` 并调用 `runCouncil(prompt, preset, parentSessionId)`。
- **插件初始化：** `src/index.ts` 在暴露 `council_session` 之前，使用运行时配置、`SubagentDepthTracker` 和 multipxer 能力构造 `CouncilManager`。
- **深度生命周期：** `SubagentDepthTracker` 也用于插件事件钩子，在子会话创建/删除时进行注册/清理。
- **运行时常量：** `config/constants.ts` 提供了启动延迟（`TMUX_SPAWN_DELAY_MS`、`COUNCILLOR_STAGGER_MS`）以避免 multiplexer 冲突。
