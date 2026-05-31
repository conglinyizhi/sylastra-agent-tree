# src/

## 职责

- `src/index.ts` 提供插件组装层：加载配置、解析代理定义、预计算运⾏时模型回退链、连接复用器/会话编排、注册工具/MCP/钩子，并返回 OpenCode 插件注册对象。
- `config/`、`agents/`、`tools/`、`multiplexer/`、`hooks/` 和 `utils/` 包含可重用的构建块（加载器/模式/常量、代理工厂/权限辅助工具、工具工厂、会话镜像管理器、钩子实现和运行时工具），为该入口点提供支持。
- `hooks/task-session-manager` 现在是核心插件流程的一部分，支持具有简洁别名和提醒注入的可恢复子任务会话，用于编排代理调用。
- `cli/` 仍然是安装程序面（参数解析、交互式提示、配置编辑、技能/提供者安装）。

## 设计

- 代理创建遵循显式工厂模式（`agents/index.ts`、`agents/` 下的各代理创建者），配合覆盖/权限辅助工具（`config/schema.ts`、`cli/skills.ts`、`config/agent-mcps.ts`），使默认值存在于 `config/constants.ts`，提示可通过 `config/loader.ts` 切换，变体标签通过 `utils/agent-variant.ts` 传播。
- 会话编排结合了 `SubagentDepthTracker`、`MultiplexerSessionManager`、`CouncilManager` 和 `ForegroundFallbackManager`；它们协调子代理深度限制、面板生命周期、委员会会话创建和前台模型故障切换。
- 钩子组合集中在 `src/index.ts` 中：生命周期事件处理器和工具转换处理器分派给专门的钩子，然后部分钩子原地后处理系统消息以确保提供者兼容性。
- 补充工具将 AST-grep 搜索/替换、委员会编排和网页获取打包在 OpenCode 的 `tool` 接口之后，并在 `index.ts` 中与钩子和 MCP 辅助工具一起挂载。

## 流程

- 启动：
  - `loadPluginConfig` 从用户/项目预设构建有效配置。
  - `createAgents` + `getAgentConfigs` 构建最终代理注册表和已解析的提示。
  - 运行时模型链从配置的数组和回退链构建而来。
  - 在注册之前初始化 `SubagentDepthTracker`、`MultiplexerSessionManager`、`CouncilManager`、`ForegroundFallbackManager` 和钩子工厂。
- 插件注册：`index.ts` 将代理配置合并/覆盖到 OpenCode 的配置中，注册工具（`council`、`webfetch`、`ast_grep_*`、todo 工具）、MCP（`createBuiltinMcps`）和所有钩子处理器（`event`、`tool.execute.before/after`、`experimental.chat.system/messages.transform`、`command.execute.before` 等）。
- 运行时事件流（`event`）：更新深度树、复用器面板状态、自动更新检查、面试/预设状态，以及已删除会话的任务会话清理。
- `experimental.chat.system.transform` 流水线：
  - 在需要时注入编排代理/系统级别的提醒，
  - 应用来自 `task-session-manager` 的任务/会话提示增强，
  - 通过 `collapseSystemInPlace` 将所有系统条目合并为一条消息，以适配拒绝多消息系统数组的提供者。
- `tool.execute.before/after`（`task`）：记录待处理的任务调用，将简短别名解析为规范 ID，解析输出以获取新的任务 ID，并更新/移除已记住的会话。
- CLI 流程：`cli/install.ts` 解析标志、可选地提示、检查 OpenCode 安装、通过 `cli/config-io.ts` 和 `cli/paths.ts` 更新配置、禁用默认代理、写入精简配置并安装技能（`cli/skills.ts`、`cli/custom-skills.ts`）。

## 集成

- 直接连接到 `@opencode-ai/plugin`：返回插件对象，变更运⾏时代理配置，处理事件钩子，并通过 `ctx.client`/`ctx.client.session` 路由 RPC。
- 通过 `src/multiplexer` 与宿主复用器后端集成，通过 `SubagentDepthTracker` 与会话生命周期约束集成。
- 钩子/子任务集成点现在包括：
  - `createTaskSessionManagerHook` 用于可恢复的 Task 会话，
  - `createTodoContinuationHook`、`createPhaseReminderHook`、`createFilterAvailableSkillsHook` 和 `createPostFileToolNudgeHook` 用于聊天/工具行为，
  - `createInterviewManager` / `createPresetManager` 命令处理器。
- 工具集成在运行时可见，通过 `utils/session-manager.ts` + `utils/task.ts`（任务恢复支持）、`utils/system-collapse.ts`（系统消息规范化）和遗留工具支持（`logger`、`env`、`polling`、`session` 等）。
