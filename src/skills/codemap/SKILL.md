---
name: codemap
description: Generate comprehensive hierarchical codemaps for UNFAMILIAR repositories. Expensive operation - only use when explicitly asked for codebase documentation or initial repository mapping
---

# Codemap 技能

你通过创建分层 codemap 来帮助用户理解和映射仓库。

## 使用时机

- 用户要求理解/映射一个仓库
- 用户需要代码库文档
- 开始在一个不熟悉的代码库上工作

## 工作流程

### 第 1 步：检查已有状态

**首先，检查仓库根目录下是否存在 `.slim/codemap.json`。**

如果不存在，检查旧版状态文件 `.slim/cartography.json`。

如果旧版状态存在：将 `.slim/cartography.json` 移动到 `.slim/codemap.json`，然后继续变更检测。

如果 `.slim/codemap.json` 存在：跳到第 3 步（检测变更）— 无需重新初始化。

如果两个文件都不存在：继续到第 2 步（初始化）。

### 第 2 步：初始化（仅当无状态文件时）

1. **分析仓库结构** - 列出文件，了解目录
2. **推断模式**，仅包含**核心代码/配置文件**：
   - **包含**：`src/**/*.ts`、`package.json` 等
   - **排除（强制）**：不要包含测试、文档或翻译文件。
      - 测试：`**/*.test.ts`、`**/*.spec.ts`、`tests/**`、`__tests__/**`
      - 文档：`docs/**`、`*.md`（根目录 `README.md` 按需保留）、`LICENSE`
      - 构建/依赖：`node_modules/**`、`dist/**`、`build/**`、`*.min.js`
    - 自动遵循 `.gitignore`
3. **运行 codemap.mjs init**：

```bash
node ~/.config/opencode/skills/codemap/scripts/codemap.mjs init \
  --root ./ \
  --include "src/**/*.ts" \
  --exclude "**/*.test.ts" --exclude "dist/**" --exclude "node_modules/**"
```

这会创建：
- `.slim/codemap.json` - 文件和文件夹哈希值，用于变更检测
- 在所有相关子目录中创建空的 `codemap.md` 文件

4. **将 codemap 编写委托给 Fixer 代理** - 为每个文件夹生成一个 fixer，读取代码并创建或更新其特定的 `codemap.md` 文件。

### 第 3 步：检测变更（状态已存在时）

1. **运行 codemap.mjs changes** 查看变更内容：

```bash
node ~/.config/opencode/skills/codemap/scripts/codemap.mjs changes \
  --root ./
```

2. **查看输出** - 显示以下内容：
   - 新增的文件
   - 删除的文件
   - 修改的文件
   - 受影响的文件夹

3. **仅更新受影响的 codemap** - 为每个受影响的文件夹生成一个 fixer 来更新其 `codemap.md`。
4. **运行 update** 保存新状态：

```bash
node ~/.config/opencode/skills/codemap/scripts/codemap.mjs update \
  --root ./
```

### 第 4 步：完成仓库地图（根 Codemap）

当所有具体目录都完成映射后，Orchestrator 必须创建或更新根目录的 `codemap.md`。此文件作为任何代理或人类进入仓库的**主入口点**。

1.  **映射根资源**：记录根级文件（例如 `package.json`、`index.ts`、`plugin.json`）以及项目的总体用途。
2.  **聚合子地图**：创建一个"仓库目录地图"章节。对于每个包含 `codemap.md` 的文件夹，提取其**职责**摘要，并将其包含在根地图的表格或列表中。
3.  **交叉引用**：确保根地图包含子地图的绝对或相对路径，以便代理可以直接跳转到相关详情。

### 第 5 步：在 AGENTS.md 中注册 Codemap

**OpenCode 在每个会话中自动加载 `AGENTS.md` 到代理上下文。** 为确保代理自动发现并使用 codemap，请在仓库根目录更新（或创建）`AGENTS.md`：

1. 如果 `AGENTS.md` 已存在且包含 `## Repository Map` 章节，**跳过此步骤** — 引用已设置完毕。
2. 如果 `AGENTS.md` 存在但没有 `## Repository Map` 章节，**追加**以下内容。
3. 如果 `AGENTS.md` 不存在，**创建**它并包含以下内容。

```markdown
## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.
```

此操作是幂等的 — 重复运行 codemap 会检测到已有章节并跳过，不会产生重复。

## Codemap 内容

Fixer 负责在此工作流程中编写 `codemap.md` 文件。使用精确的技术术语记录实现：

- **职责** - 使用标准软件工程术语定义此目录的具体角色（例如"Service Layer"、"Data Access Object"、"Middleware"）。
- **设计模式** - 识别并命名所使用的具体模式（例如"Observer"、"Singleton"、"Factory"、"Strategy"）。详细描述抽象层和接口。
- **数据与控制流** - 显式追踪数据如何进出模块。提及特定的函数调用序列和状态转换。
- **集成点** - 列出依赖项和消费模块。使用钩子、事件或 API 端点的技术名称。

Codemap 示例：

```markdown
# src/agents/

## Responsibility
Defines agent personalities and manages their configuration lifecycle.

## Design
Each agent is a prompt + permission set. Config system uses:
- Default prompts (orchestrator.ts, explorer.ts, etc.)
- User overrides from ~/.config/opencode/sylastra-agent-tree.json
- Permission wildcards for skill/MCP access control

## Flow
1. Plugin loads → calls getAgentConfigs()
2. Reads user config preset
3. Merges defaults with overrides
4. Applies permission rules (wildcard expansion)
5. Returns agent configs to OpenCode

## Integration
- Consumed by: Main plugin (src/index.ts)
- Depends on: Config loader, skills registry
```

**根 Codemap（地图集）** 示例：

```markdown
# Repository Atlas: sylastra-agent-tree

## Project Responsibility
A high-performance, low-latency agent orchestration plugin for OpenCode, focusing on specialized sub-agent delegation and multiplexer-assisted child sessions.

## System Entry Points
- `src/index.ts`: Plugin initialization and OpenCode integration.
- `package.json`: Dependency manifest and build scripts.
- `sylastra-agent-tree.json`: User configuration schema.

## Directory Map (Aggregated)
| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/agents/` | Defines agent personalities (Orchestrator, Explorer) and manages model routing. | [View Map](src/agents/codemap.md) |
| `src/features/` | Core logic for tmux integration and session state. | [View Map](src/features/codemap.md) |
| `src/config/` | Implements the configuration loading pipeline and environment variable injection. | [View Map](src/config/codemap.md) |
```
