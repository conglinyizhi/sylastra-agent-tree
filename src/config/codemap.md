# Config 模块 Codemap

## 职责

`src/config/` 负责插件配置 schema、加载/合并流水线、提示词解析以及供 agent、council 和运行时子系统使用的辅助 API。

## 架构

### 核心入口点

- `loadPluginConfig(directory)` 是由 `src/index.ts` 使用的顶级加载器。
- `PluginConfigSchema` 校验并规范化原始配置，包括：
  - 旧版 council 字段弃用捕获
  - 严格限制 `prompt` / `orchestratorPrompt` 仅用于自定义 agent。
- `getAgentPrompt`/`loadAgentPrompt` 及相关辅助函数由 agent 注册表使用。

### 合并与加载流水线

`loadPluginConfig(directory)`：

1. 从以下位置定位用户配置（优先 `.jsonc`，其次 `.json`）：
   - `OPENCODE_CONFIG_DIR`
   - `XDG_CONFIG_HOME/opencode`
   - `~/.config/opencode`
2. 在 `<directory>/.opencode/sylastra-agent-tree.(jsonc|json)` 定位项目配置。
3. 使用 schema 校验。无效/格式错误的文件会发出警告并以返回 `null` 的方式忽略该文件。
4. 合并用户+项目配置，项目配置优先级更高：
   对 `agents`、`tmux`、`multiplexer`、`interview`、`sessionManager`、`fallback`、`council` 进行嵌套合并。
   顶层数组/值被覆盖。
5. 如果启用了 `tmux` 且未配置显式的 `multiplexer`，则迁移到 `multiplexer`（`tmux` 兼容路径）。
6. 应用环境变量 `SYLASTRA_AGENT_TREE_PRESET` 覆盖配置文件中的 preset。
7. 如果存在 preset，将 preset 中的 agent 合并到 `agents` 中，使得显式根级 agent 仍然优先（`deepMerge(preset, config.agents)`）。
8. 返回合并后的配置对象。

### 提示词发现

`loadAgentPrompt(agentName, preset?)`：

- 在配置目录中搜索 `sylastra-agent-tree/` 提示词根目录。
- 当 `preset` 为字母/连字符/下划线安全字符时，支持可选的 preset 子目录查找。
- 对每个 agent：
  - `<agent>.md` 替换式提示词
  - `<agent>_append.md` 追加式提示词
- 读取错误会发出警告，不会导致配置加载失败。

### Schema 表面与兼容性

- Agent 覆盖 schema 支持：
  - `model` 字符串或有序回退数组（字符串或 `{id, variant}`）
  - `temperature`、`variant`、`options`、`skills`、`mcps`、`displayName`
  - 仅自定义 agent 的提示词（`prompt`、`orchestratorPrompt`）。
- Multiplexer：
  - 新的统一 `multiplexer` schema（`auto|tmux|zellij|none`）
  - 保留旧版 `tmux` schema，加载时迁移。
- Council：
  - `CouncilConfigSchema` 现在将弃用的 `master*` 字段规范化为 `_legacyMasterModel` 元数据以保持兼容
  - 支持 presets + 超时/重试/执行模式。
- Fallback 配置支持每个 agent 的链式数组和重试/退避值。

## 控制流与依赖

```text
src/index.ts
  └─> loadPluginConfig(directory)
      ├─> Agent 覆盖应用在 src/agents/index.ts
      ├─> MCP 默认值/过滤在 src/config/agent-mcps.ts
      ├─> Council 会话行为在 src/council/*
      ├─> Fallback/会话行为在运行时钩子中
      └─> Multiplexer 行为在 src/multiplexer/*
```

### 关键协作者

- `constants.ts`
  - 名称/别名、可编排列表、默认模型/超时/模式。
- `agent-mcps.ts`
  - `getAgentMcpList`、`parseList`、`getAvailableMcpNames`。
- `utils.ts`
  - 别名解析和自定义 agent 键发现。
- `loader.ts`
  - 配置 IO、深度合并、preset 组合、环境变量覆盖、提示词加载。
- `schema.ts`、`council-schema.ts`
  - 类型/形状校验 + 转换。

## 文件结构

- `index.ts` — 导出的配置接口
- `loader.ts` — 加载、合并、提示词解析、tmux 迁移
- `schema.ts` — 插件配置 + agent 覆盖 schema
- `council-schema.ts` — council 特有及旧版兼容 schema
- `constants.ts` — 默认值、名称、委派规则、超时
- `agent-mcps.ts` — MCP 默认值和允许列表解析
- `utils.ts` — 配置辅助方法
