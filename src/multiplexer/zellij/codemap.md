# src/multiplexer/zellij/

## 职责

- 实现基于 zellij 的面板编排作为 tmux 的替代方案，用于委派会话管理。
- 维护一个专用的 `opencode-agents` 标签页，将所有生成的附加会话路由到该标签页中。
- 确保进程清理和首次运行时的复用行为，避免面板重复膨胀。

## 设计

- `index.ts` 中的 `ZellijMultiplexer` 实现了 `Multiplexer`。
- `findBinary` 是一个简单的 `which/where zellij` 探测，带有缓存的路径。
- `isInsideSession` 检查 `process.env.ZELLIJ`；`isAvailable` 使用缓存的 `binaryPath`。
- 首次创建路径通过 `ensureAgentTab` 构建/重用一个专用标签页（`opencode-agents`），并跟踪：
  - `agentTabId`
  - `firstPaneId`
  - `firstPaneUsed`
- 命令组合由辅助构建器完成：
  - `buildOpencodeAttachCommand`
  - `buildShellLaunchCommand`
- 布局故意设计为无操作，因为 zellij 不暴露本代码库所使用的等效布局 API。

## 流程

- `spawnPane(sessionId, description, serverUrl, directory)`：
  - 解析 zellij 二进制文件并调用 `ensureAgentTab`
  - 如果代理标签页中的第一个面板空闲，则通过 `runInPane` 就地执行附加命令：
    - `focus-pane --pane-id`
    - `rename-pane`
    - `write-chars` 启动命令 + 换行
  - 否则通过 `new-pane --name <desc> --close-on-exit -- sh -lc <opencode attach ...>` 创建新面板。
  - 当从用户标签页调用时，临时切换到 `agentTabId`，操作完成后再切换回来以保持用户上下文。
  - 返回 `{ success, paneId }`，其中面板 ID 验证为 `terminal_*` 格式。
- `closePane(paneId)`：
  - `action write --pane-id <id> \u0003`（优雅的 SIGINT 等效操作）
  - 等待 250ms
  - `action close-pane --pane-id <id>`；将退出码 `0` 和 `1` 视为成功关闭。
- `applyLayout` 故意为无操作，保留以保持接口兼容性。

## 集成

- 由 `getMultiplexer` 在显式 `zellij` 模式或环境驱动的 `auto` 模式下选中（当 `process.env.ZELLIJ` 存在时）。
- 由 `MultiplexerSessionManager` 在 zellij 环境中作为面板后端使用。
- UI 附加命令的参数形状与 tmux 相同：`opencode attach <url> --session <sessionId> --dir <directory>`，因此委派会话在后端之间保持配置无关。
