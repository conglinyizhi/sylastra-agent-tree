# CLI 模块代码地图

## 职责

`src/cli/` 提供插件安装工作流以及生成和持久化运行时配置的工具。

当前职责：

- 解析/安装命令参数
- 安装时验证和环境检查
- OpenCode 配置变更（原子操作）
- 为提供者/代理预设生成精简配置
- 可选的技能安装和捆绑技能复制

## 设计

### 命令面

- `src/cli/index.ts` 仅分派：
  - `install` 子命令和标志
    - `--skills=yes|no`
    - `--preset=<name>`
    - `--no-tui`
    - `--dry-run`
    - `--reset`
    - `--help`

CLI 现在刻意仅为非交互式；它打印用法和步骤到标准输出并返回退出码。

### 模块分解

- `paths.ts`：配置目录和文件发现（`opencode.json`/`.jsonc`、精简配置路径）。
- `config-io.ts`：JSON/JSONC 解析、规范化写入行为、原子写入（`.tmp` + `.bak`）、插件注册、默认代理禁用。
- `providers.ts`：提供者模型映射 + `generateLiteConfig()`。
- `system.ts`：OpenCode 二进制/版本/路径检查。
- `skills.ts`：捆绑技能和仅权限技能的权限默认值。
- `custom-skills.ts`：捆绑技能注册表和复制到配置目录的实现。
- `config-manager.ts`：CLI 配置工具的重导出桶文件。
- `install.ts`：端到端安装编排和控制台消息。
- `types.ts`：安装/配置 DTO。

## 流程

```text
CLI install 命令
  └─> install.ts（runInstall）
      1) 检查 OpenCode 是否已安装
      2) 将插件条目添加到主 OpenCode 配置
      3) 禁用遗留默认代理
      4) 写入/预览生成的精简配置
      5) 可选安装阶段：
         - 为每个 CUSTOM_SKILL 执行 installCustomSkill(...)
```

`generateLiteConfig(installConfig)` 行为：

- 设置 `$schema`、一个选定的 `preset`（默认为 `openai`）
- 始终物化生成的预设 `openai` 和 `opencode-go`
- 安装时 `--preset` 仅在生成的预设之间选择
- 将每个内置代理名称映射到特定提供者的模型/变体
- 从捆绑的自定义技能注册表注入技能列表
- 从 `DEFAULT_AGENT_MCPS` 注入默认 MCP 集合
- 包含 tmux 块（`layout`、`main_pane_size`）（当启用时）

`writeLiteConfig()` 原子地写入目标文件，并支持 `install.ts` 中的 `--reset`/dry-run 分支。

## 运行时集成

- 安装产生的输出文件（`sylastra-agent-tree.json`）由运行时 `config/loader.ts` 消费。
- 已安装/可用技能的权限默认值通过 `cli/skills.ts` 与 `agents/index.ts` 共享。
- 生成的提供者/复用器设置通过 `src/index.ts` 引导由 OpenCode 会话运行时消费。

## 关于架构/文档准确性的说明

- 先前的 TUI 引用已过时；当前源码中不存在专用交互式流程。
- `--skills` 仅控制捆绑/自定义技能的安装。
- 内置预设支持包括 `openai`、`opencode-go`、`kimi`、`copilot` 和 `zai-plan`。
