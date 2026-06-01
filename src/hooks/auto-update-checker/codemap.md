# src/hooks/auto-update-checker/

## 职责

- 提供一个启动钩子，检测 `sylastra-agent-tree` 的插件更新可用性，通过 TUI toast 报告状态，并驱动 artifact updater 的 prepare / activate / healthcheck / rollback 流程。
- 区分处理本地开发模式和固定插件版本（`file://`、固定标签和 `latest` 通道语义）。

## 设计

- `index.ts` 中的 `createAutoUpdateCheckerHook(ctx, options)` 为 `session.created` 注册一个 `event` 处理程序，并保护一次性启动执行（`hasChecked`）。
- `runBackgroundUpdateCheck` 执行版本解析并分支到：
  - 本地开发无操作路径，
  - 固定插件通知，
  - 当 `autoUpdate=false` 时的手动通知，
  - 或自动更新执行路径。
- `checker.ts` 是核心发现层，导出：
  - `findPluginEntry`、`extractChannel`、`getCachedVersion`、`getLocalDevVersion`、`getLatestVersion`。
- `updater.ts` 拥有 TypeScript 侧 updater bridge，负责定位二进制、读取 state、调用 `prepare|activate|healthcheck|rollback`。
- `constants.ts` 集中安装和配置路径常量（`CACHE_DIR`、`ARTIFACT_UPDATE_ROOT`、`PACKAGE_NAME`、manifest 相关常量、配置路径别名）。
- `types.ts` 声明 `AutoUpdateCheckerOptions`、`PluginEntryInfo`、配置/包类型信封。

## 流程

1. 在第一个符合条件的 `session.created`（根/无父会话）时，安排异步更新检查。
2. 如果检测到本地开发插件（`getLocalDevVersion`），发出信息 toast 并返回。
3. 从 `getCachedVersion` + 配置中的插件条目（`findPluginEntry`）解析当前版本。
4. 获取通道元数据（`extractChannel` + `getLatestVersion`）。
5. 如果检测到 `prepared` 状态，则在启动时尝试 `activate`，随后运行 `healthcheck`；失败时触发 `rollback`。
6. 如果发现远端有新版本：
   - 固定条目 ⇒ 仅通知，
   - 未固定且 `autoUpdate=false` ⇒ 仅通知，
   - 未固定且启用自动更新 ⇒ 调用 updater `prepare`。
7. 通过 `ctx.client.tui.showToast` 和 `utils/logger` 呈现成功/失败信息。

## 集成

- 通过 `src/hooks/index.ts` 和插件初始化（`src/index.ts`）作为 `event` 钩子接入。
- 消费 `PluginInput.client.tui.showToast`、`PluginInput.directory`、`ctx.client` 上下文，并通过 `cli/config-manager`（`stripJsonComments`、`getOpenCodeConfigPaths`）读取配置路径。
- 运行时交互使用 `crossSpawn` 调用 updater 二进制，Node `fs/path` 读取 state，并通过 manifest URL 获取版本信息。
- 导出表面包括 `getAutoUpdateInstallDir` 和 `AutoUpdateCheckerOptions`，用于可测试性和宿主端覆盖。
