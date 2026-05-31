# Agents 目录代码地图

## 职责

`src/agents/` 定义了内置专家代理以及自定义代理，并将配置转换为 OpenCode SDK 注册数据。

职责包括：

- 通过工厂函数构建编排代理和专家代理定义。
- 解析模型、变体、温度、选项、提示和显示名称的覆盖。
- 规范化/验证自定义代理名称和面向自定义编排代理的别名。
- 为 OpenCode 组合权限、MCP 白名单和可见性元数据。

## 核心架构

### 构建流程（`createAgents`）

1. 通过 `getDisabledAgents()` 计算禁用集：
   - 来自 `config.disabled_agents`
   - 包含受保护代理保护（`orchestrator`、`councillor` 永远不会被禁用）
2. 从 `SUBAGENT_FACTORIES`（`SUBAGENT_NAMES`）构建内置子代理。
3. 发现来自 `config.agents` 键中非内置或别名的自定义代理名称。
4. 验证自定义名称（`/^[a-z][a-z0-9_-]*$/i`）和模型存在性：如果缺少 `model`，跳过并发出警告。
5. 为每个代理加载提示文件：
   - `<agent>.md` 替换提示
   - `<agent>_append.md` 追加提示
6. 应用覆盖处理：
   - 字符串类型 `model` → `config.model`
   - 数组类型 `model` → `agent._modelArray` 并清除 `config.model`
   - 合并 `temperature`、`variant`、`options`、`displayName`
7. 为每个代理应用权限默认值（`applyDefaultPermissions`）。
8. 应用兼容性回退：
   - 当未显式配置时，`fixer` 可能继承 `librarian` 模型。
   - 当没有显式 `council` 覆盖且默认值仍未解析时，`council` 可能继承弃用的 `council.master.model`。
9. 使用提示文件和禁用代理过滤构建编排代理。
10. 规范化/收集显示名称，并将 `@displayName` 引用注入到：
    编排代理提示和所有自定义 `orchestratorPrompt` 片段中。
11. 验证显示名称冲突/代理名称冲突。
12. 返回 `[orchestrator, ...subagents]`。

### 运行时模型行为

- 当提供 `_modelArray` 时，它用作有序的运行时故障切换链。
- `orchestrator` 可能以未解析（`model` 未定义）状态启动，以允许下游运行时解析。
- `subagent` 覆盖在 `_modelArray` 内保留每个模型的变体，同时可选地将顶级 `variant` 保留为默认回退。

## 委托和注册语义

- `getAgentConfigs(config)` 将定义转换为 SDK 配置并设置：
  - `orchestrator` → `mode: primary`
  - 内置专家代理 → `mode: subagent`
  - `council` → `mode: all`
  - `councillor` → `mode: subagent`，`hidden: true`
- 如果设置了 `displayName`：
  - 内部键仍然注册但隐藏
  - 面向宿主的键变为规范化的显示名称

权限默认值：

- `question` 默认 `allow`，除非存在显式拒绝。
- `council_session` 仅对 `council` 默认 `allow`。
- 嵌套的 `skill` 权限来自 `getSkillPermissionsForAgent`，并与现有权限映射合并。

## 能力和策略输入

- MCP 白名单：
  - `getAgentMcpList(name, config)` 来自 `src/config/agent-mcps.ts`
  - `agent-mcps` 默认值位于 `src/config/agent-mcps.ts`
- 代理元数据/别名：
  - `AGENT_ALIASES`、`SUBAGENT_NAMES`、`PROTECTED_AGENTS`
  - `getAgentOverride`、`getCustomAgentNames` 来自 `src/config/utils.ts`
- 技能：
  - `cli/skills.ts`

## 流程和集成

```text
src/index.ts
  └─> loadPluginConfig()
      └─> createAgents(config) / getAgentConfigs(config)
          └─> 注册 + 运行时聊天钩子

  loadPluginConfig()
    └─> 提示覆盖 + 预设
        └─> createAgents/创建自定义/编排代理提示
```

## 工具和辅助函数

- `isSubagent(name)` — 子代理名称的类型守卫。
- `getDisabledAgents(config)` 和 `getEnabledAgentNames(config)`。
- `orchestrator.ts` 中的 `resolvePrompt()` 集中处理替换与追加行为。

## 文件结构

- `index.ts`（代理注册表、覆盖、分类、自定义代理）
- `orchestrator.ts`（基础提示、提示解析、模型数组类型）
- `council.ts`、`councillor.ts`（委员会工具编排 + 格式化）
- `explorer.ts`、`librarian.ts`、`oracle.ts`、`designer.ts`、`fixer.ts`、`observer.ts`（专家工厂提示/配置）
