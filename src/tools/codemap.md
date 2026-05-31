# src/tools/

## 职责

`src/tools/` 提供 OpenCode 使用的插件工具和运行时命令钩子。

- 基于 `ast-grep` 的 AST 感知搜索/替换。
- 通过 `smartfetch`（`webfetch` 工具）实现的远程获取/转换工具。
- 通过 `createCouncilTool`（`council.ts`）实现的委员会编排。
- 通过 `subtask` 和 `/subtask`（`subtask/`）实现的子会话子任务。
- 通过 `createPresetManager`（`preset-manager.ts`）实现的 `/preset` 运行时预设切换。

它是插件运行时集成（`src/index.ts`）与各功能文件夹中底层实现之间的桥梁。

## 导出面（`src/tools/index.ts`）

- `ast_grep_search`、`ast_grep_replace` 来自 `./ast-grep`
- `createWebfetchTool`、`WEBFETCH_DESCRIPTION` 及相关类型来自 `./smartfetch`
- `createCouncilTool`
- `createSubtaskTool`、`createSubtaskCommandManager`、`createSubtaskState` 和 `createReadSessionTool` 来自 `./subtask`
- `createPresetManager` 和 `PresetManager` 类型

## 设计模式

- **基于工厂的注册：** 每个功能暴露一个工厂，返回绑定到插件上下文的可执行工具或处理器对象。
- **清晰的边界：** 所有插件生命周期钩子都从工厂方法（`handleCommandExecuteBefore`、`handleEvent`、`registerCommand`）发出，而非在工具模块中。
- **元数据优先输出：** 工具调用在可能时返回文本及内部元数据写入（以获得更丰富的 UI 面）。

## 子系统与数据流

### Council 工具路径

- `createCouncilTool` 定义 `council_session`。
- `execute` 执行受保护的调用：
  - 验证 `toolContext` 和 `sessionID`，
  - 仅允许 `agent: 'council'`（或缺失 agent 时的向后兼容）直接使用，
  - 调用 `CouncilManager.runCouncil(prompt, preset, parentSessionId)`。
- 成功时，将 councillor 响应摘要和标准化模型列表附加到输出。
- 失败时，返回简洁的错误字符串。
- 当 `CouncilManager` 暴露已弃用的字段元数据时，显示配置弃用警告。

### Preset-manager 命令路径

- `createPresetManager(ctx, config)` 返回：
  - `registerCommand(opencodeConfig)`：如果不存在则注入 `/preset` 命令定义，
  - `handleCommandExecuteBefore(input, output)`：拦截 `/preset` 命令处理。
- 命令行为：
  - 无参数 → 清空输出并列出可用预设（支持 `active` 标记），
  - 单个 token 参数 → 通过 `client.config.update(...)` 切换预设，附带映射后的 agent 覆盖，
  - 多词参数 → 提示建议且不更新。
- 映射逻辑将插件预设覆盖格式（`AgentOverrideConfig`）转换为运行时 SDK 的 `agent` 配置（`model`、`temperature`、`variant`、`options`），并跳过运行时更新不支持的字段（`prompt`、`orchestratorPrompt`、`skills`、`mcps`、`displayName`）。
- 内存中的 `activePreset` 支持即时状态显示和在成功切换后更新。

### Subtask 路径

- `createSubtaskCommandManager` 注册 `/subtask` 并请求当前 agent 调用 `subtask` 工具，附带 worker prompt 和相关文件。
- `createSubtaskTool` 创建一个带有 `parentID` 的真实子会话，注入引用的文件作为合成 Read 工具上下文，等待 worker 完成，返回 `<subtask_summary>`，然后中止子会话以进行清理。
- `createReadSessionTool` 允许子任务 worker 在摘要 prompt 缺少细节时，仅读取创建它的源会话。
- `SubtaskState` 标记子会话，以便嵌套子任务可以被阻塞，并且 `session.deleted` 事件可以清除过期的标记。

### Smartfetch 路径

- `createWebfetchTool` 负责获取编排、权限提示、缓存检查、`llms.txt` 探测、二进制/文本分支以及可选的辅助模型后处理。
- `smartfetch` 模块将工作拆分为：
  - 传输/策略（`network.ts`），
  - 缓存及 TTL 语义（`cache.ts`），
  - 输出格式化（`utils.ts`），
  - 文件支持的二进制（`binary.ts`），
  - 辅助模型摘要（`secondary-model.ts`），
  - 常量和类型。
- `webfetch` 始终从 `src/index.ts` 注册为公共工具。

### AST-grep 路径

- `ast-grep` 拆分为 CLI/CLI 发现和工具定义关注点。
- `ast_grep_search`/`ast_grep_replace` 的执行调用 `runSg`，后者处理参数规范化、二进制可用性、超时/错误处理和输出截断。
- `src/tools/ast-grep/index.ts` 重新导出工具定义和工具函数以便发现（`ensureCliAvailable`、`getAstGrepPath`、下载器/运行时检查）。

## `src/index.ts` 中的集成点

- 工具注册：
  - `council` 工具（仅当 `config.council` 存在时），
  - `webfetch`，
  - `subtask`、`read_session`，
  - AST 工具。
- `presetManager` 在插件初始化时初始化，并且：
  - 在配置钩子期间调用 `registerCommand`，
  - 在 `command.execute.before` 中处理命令拦截。
- `/preset` 处理是面向用户的（命令钩子），而 webfetch 和 council 是面向工具的。
