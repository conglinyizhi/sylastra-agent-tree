# src/multiplexer/tmux/

## 职责

- 提供 tmux 特定的面板编排能力，将 OpenCode 子会话附加到当前面板旁的分割面板中。
- 管理生成的面板生命周期（创建、重命名、布局重新平衡、优雅关闭）。
- 解析并缓存 tmux 可执行文件路径以供重复操作使用。

## 设计

- `index.ts` 中的 `TmuxMultiplexer` 实现了 `Multiplexer`。
- `findBinary` 使用平台命令（`which` 或 `where`）并通过 `-V` 验证二进制文件。
- `isAvailable` 缓存 `binaryPath` 和 `hasChecked` 以避免重复查找。
- `targetPane` 捕获 `process.env.TMUX_PANE`，并作为 `targetArgs()` 复用，用于限定作用域的 tmux 操作。
- 命令执行使用 `crossSpawn`，以同时支持 Bun 和 Node 进程接口。
- `quoteShellArg` 提供 shell 安全的引号处理，用于 `opencode` 命令中的目录/URL/会话注入。

## 流程

- `spawnPane(sessionId, description, serverUrl, directory)`：
  - 通过 `getBinary()` 确保二进制文件可用
  - 构建命令：`opencode attach <url> --session <sessionId> --dir <directory>`
  - 执行 `tmux split-window -h -d -P -F '#{pane_id}' ...`，可选 `-t <TMUX_PANE>`
  - 成功后：
    - 使用 `select-pane -T` 重命名面板，取 `description` 前 30 个字符
    - 调用 `applyLayout(storedLayout, storedMainPaneSize)`。
- `applyLayout(layout, mainPaneSize)`：
  - 在当前目标上执行 `select-layout`
  - 对于 `main-*` 布局，更新 `main-pane-height|width` 并重新选择布局以达到确定的大小。
- `closePane(paneId)`：
  - `send-keys -t <pane> C-c`
  - 等待 250ms
  - `kill-pane -t <pane>`
  - 成功后，重新运行 `applyLayout` 以重新平衡面板。

## 集成

- 当 `multiplexerConfig.type === 'tmux'` 或自动模式解析为 tmux（`process.env.TMUX`）时被选中。
- 由 `MultiplexerSessionManager` 用于 `session.created` 的生成和完成清理。
- 使用 `ctx.directory` 作为工作目录，OpenCode API URL 作为 `serverUrl`，会话 ID 作为 `opencode attach --session` 的目标。
