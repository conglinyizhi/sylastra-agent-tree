# src/multiplexer/

## 职责

- 为生成的子代理会话提供基于 multiplexer 的面板可视化。
- 根据配置/环境选择并实例化终端后端：
  `auto`、`tmux`、`zellij` 或 `none`。
- 通过 OpenCode 事件的生命周期钩子以及健康/轮询回退机制，管理子会话面板的生命周期。
- 确保面板清理安全且优雅（尽力中断 + 关闭）。

## 设计

- `types.ts`
  - 定义共享抽象：
    - `Multiplexer`（`spawnPane`、`closePane`、`applyLayout`、`isAvailable`、
      `isInsideSession`），
    - `PaneResult`，
    - `isServerRunning(serverUrl, timeoutMs?, maxAttempts?)` 用于就绪检查。

- `factory.ts`
  - 每次调用创建全新的 multiplexer 实例（无缓存），从而准确捕获环境特定状态（`TMUX`、`ZELLIJ`）。
  - `auto` 模式严格按照环境变量解析，可回退为无操作的 `none`。
  - 暴露 `getAutoMultiplexerType` 和 `startAvailabilityCheck` 用于诊断。

- `tmux/index.ts`（`TmuxMultiplexer`）
  - 通过 `which/where` + `tmux -V` 惰性检测二进制文件。
  - `spawnPane` 在分割面板中执行 `opencode attach`，
    设置面板标题并应用布局。
  - `closePane` 发送 `C-c`，短暂等待后执行 `kill-pane`。
  - `applyLayout` 处理主布局大小调整和重新平衡。

- `zellij/index.ts`（`ZellijMultiplexer`）
  - 检测并复用/创建 `opencode-agents` 标签页。
  - 第一个子会话使用该标签页中的默认面板；后续子会话创建新面板。
  - 回退到首个可用面板 ID 启发式策略，并在跨标签页操作时恢复原始标签页上下文。
  - 接收布局配置但实际为无操作（工具语义与 tmux 不同）。

- `session-manager.ts`（`MultiplexerSessionManager`）
  - 从插件上下文和配置初始化一次。
  - 订阅生命周期事件：
    - `session.created`：如果启用且尚未跟踪，则生成面板，
    - `session.status`：`idle` 时关闭，`busy` 时若已知则重新生成，
    - `session.deleted`：关闭面板并清除跟踪。
  - 跟踪：
    - 活跃面板（`sessions` 映射表），
    - 已知会话（`knownSessions`），
    - 正在生成中的会话（`spawningSessions`）。
  - `respawnIfKnown` 处理关闭后重新出现的忙碌会话。
  - 当事件覆盖不完整时启用轮询回退（`pollSessions`），处理：
    - idle 检测，
    - 缺失状态的宽限期，
    - 最大会话生命周期超时。

- `index.ts`
  - 重新导出工厂、管理器及实现，供外部导入。

## 流程

- `src/index.ts` 读取 multiplexer 配置并创建
  `MultiplexerSessionManager(ctx, config)`。
- 启动时 `getMultiplexer(config)` 确定后端以及管理器是否启用（`type != none`、multiplexer 存在、在会话内运行）。
- `session.created` 时：
  - 通过 `isServerRunning(serverUrl)` 检查后端健康状态，
  - 生成新面板，
  - 启动后台轮询。
- `session.status` 时：
  - `idle` → `closeSession`（关闭面板 + 移除映射），
  - `busy` → 如果会话先前已知则调用 `respawnIfKnown`。
- `session.deleted` 时：
  - 关闭并移除面板，清除已知会话映射。
- `cleanup()` 关闭所有面板并清除跟踪映射表。

## 集成

- 与 OpenCode 会话事件及插件输入的服务器 URL 集成。
- 使用 `src/config` multiplexer 设置定义的辅助端点：
  `type`、`layout`、`main_pane_size`。
- 通过共享抽象使用 `src/multiplexer/tmux` 和 `src/multiplexer/zellij` 中的实现。
- 验证覆盖：
  - `src/multiplexer/factory.test.ts`
  - `src/multiplexer/session-manager.test.ts`
