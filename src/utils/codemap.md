# src/utils/

编排、钩子和插件 I/O 使用的横切运行时工具。

## 职责

- **tmux.ts**：复用器安全的面板生命周期辅助函数（`spawnPane`、`closePane`），供 tmux 和 zellij 适配器使用。
- **subagent-depth.ts**：跟踪委托会话深度并强制执行最大嵌套委托深度。
- **agent-variant.ts**：规范化 agent 名称，并可在不覆盖现有主体配置的情况下应用可选变体标签。
- **env.ts**：统一的环境变量查找，支持 Bun/Node，过滤空字符串。
- **session-manager.ts**：按父会话 + agent 类型跟踪可恢复的 `task` 工具会话，规范化用户标签，分配稳定的短别名，并暴露提示渲染/逐出行为。
- **session.ts**：用于多轮合成和提示/结果后处理的会话提取辅助函数。
- **polling.ts**：带有稳定性阈值和中止信号支持的共享轮询。
- **zip-extractor.ts**：跨平台 zip/tar 解压，带有 Windows 后备工具。
- **task.ts**：解析 `task` 工具 CLI 输出以恢复 `task_id`。
- **system-collapse.ts**：将多个系统提示片段合并为一个数组元素，同时保持原数组引用可变。
- **logger.ts**：结构化的 JSON 日志写入临时文件。
- **internal-initiator.ts**：用于内部编排器文本部分标记的标记工具。
- **compat.ts**：向后兼容辅助函数。
- **index.ts**：工具模块的公开重导出桶文件。

## 设计

- **确定性生命周期跟踪**：`SubagentDepthTracker` 将会话 ID 映射到深度，并在会话删除时清理。
- **父作用域可恢复会话存储**：`SessionManager` 按 `{parentSessionId, agentType}` 分组任务，并通过最后使用计数器维护 LRU 式排序，以便活跃的可恢复会话保留在内存中。
- **供应器安全的环境访问**：`getEnv` 从 `Bun.env` 回退到 `process.env`，并规范化空值。
- **优雅关闭协议**：复用器面板关闭路径在终止前发送 Ctrl+C，然后重新平衡布局状态。
- **会话提取模型**：`extractSessionResult`/`parseModelReference` 风格的辅助函数集中在 `session.ts` 下。
- **原地系统规范化**：`collapseSystemInPlace` 有意修改 `system` 数组，以保留 OpenCode 内部持有的引用。
- **弹性轮询**：`pollUntilStable` 在成功前需要连续的确认。

## 流程

### `subagent-depth.ts`

- `registerChild(parentSessionId, childSessionId)` 计算 `childDepth = parentDepth + 1`。
- 当深度超过 `DEFAULT_MAX_SUBAGENT_DEPTH` 时阻止注册。
- `cleanup(sessionId)` 和 `cleanupAll()` 移除已终止会话的深度状态。

### `session-manager.ts`

- `deriveTaskSessionLabel` 计算确定性的提示提示：
  - 如果提供了 `description` 则使用它，
  - 否则回退到 `prompt` 中第一个非空规范化行，
  - 否则返回 `recent {agentType} task`。
- `remember` 创建/重用由 `{parentSessionId, agentType}` 键化的条目，并通过 `trimGroup` 强制每个 agent 的最大数量。
- 别名生成在每个父会话+agent 内是单调递增的（`exp-1`、`lib-2` 等）。
- `markUsed`、`resolve`、`drop`、`dropTask`、`clearParent` 在重用和拆卸时保持存储一致性。
- `formatForPrompt` 返回分组和排序的提示文本（`### Resumable Sessions ...`），用于系统转换。

### `tmux.ts`

- `spawnPane` 流程：验证启用状态 → 检查复用器可用性 → 解析二进制文件 → 执行包含布局处理的附加命令。
- `closePane` 流程：发送 SIGINT 等效键序列 → 延迟 → 终止面板 → 必要时重新平衡布局。
- `isServerRunning` 流程：有限制的 `/health` 检查，带有重试和缓存。

### `polling.ts`

- `pollUntilStable(fn, options)` 重复调用异步谓词并跟踪连续的真状态。
- 一旦达到稳定阈值、超时或触发中止信号，立即返回。

### `session.ts`

- 组合提示部分，并提取规范化的会话输出，用于文本/调用/结果流程。
- 托管供 council 和工具执行层使用的共享解析/格式化工具。

### `task.ts`

- 逐行扫描任务输出，从 `task_id: <id>` 格式中提取 `task_id`。

### `system-collapse.ts`

- `collapseSystemInPlace(system: string[])` 使用 `\n\n` 连接所有系统条目，清空并重新填充同一数组引用，并保持空数组行为。

## 集成

- **消费者**
  - `src/multiplexer/*`：`SubagentDepthTracker` 和 `tmux.ts` 集成。
  - `src/council/council-manager.ts`：深度控制和会话提取辅助函数。
  - `src/hooks/*`：标记检测、轮询和会话感知状态辅助函数。
  - `src/hooks/task-session-manager`：`SessionManager`、`parseTaskIdFromTaskOutput` 和 `deriveTaskSessionLabel` 提供可恢复会话工作流；插件的系统转换在此管理器注入提示后通过 `collapseSystemInPlace` 传递钩子输出。

- **依赖**
  - 从 `../config` 引入常量（`DEFAULT_MAX_SUBAGENT_DEPTH`、轮询间隔/超时）。
  - `index.ts` 重新导出工具 API（`agent-variant`、`env`、`polling`、`logger`、`session`、`subagent-depth` 等）。
