# Agent 编码指南

本文档为在此仓库中操作的 AI 代理提供指导。

## 项目概述

**sylastra-agent-tree** - OpenCode 的 Agent 编排插件，fork 自 oh-my-opencode-slim。使用 TypeScript、Bun 和 Biome 构建。

## 命令

| 命令 | 说明 |
|---------|-------------|
| `bun run build` | 将 TypeScript 构建到 `dist/`（包括 index.ts 和 cli/index.ts） |
| `bun run typecheck` | 运行 TypeScript 类型检查（不生成输出文件） |
| `bun test` | 使用 Bun 运行所有测试 |
| `bun run lint` | 对整个代码库运行 Biome linter |
| `bun run format` | 使用 Biome 格式化整个代码库 |
| `bun run check` | 运行 Biome check 并自动修复（lint + format + 整理 imports） |
| `bun run check:ci` | 运行 Biome check 不自动修复（CI 模式） |
| `bun run dev` | 构建并使用 OpenCode 运行 |

**运行单个测试：** 使用 Bun 的测试过滤功能，配合 `-t` 参数：
```bash
bun test -t "test-name-pattern"
```

## 代码风格

### 通用规则
- **格式化工具/Linter：** Biome（配置于 `biome.json`）
- **行宽：** 80 字符
- **缩进：** 2 空格
- **换行符：** LF（Unix）
- **引号：** JavaScript/TypeScript 中使用单引号
- **尾逗号：** 始终启用

### TypeScript 指南
- **严格模式：** 在 `tsconfig.json` 中启用
- **禁止显式 `any`：** 会产生 linter 警告（测试文件除外）
- **模块解析：** `bundler` 策略
- **声明文件：** 在 `dist/` 中生成 `.d.ts` 文件

### 导入
- Biome 在保存时自动整理导入（`organizeImports: "on"`）
- 让格式化工具处理导入排序
- 如果 TypeScript 配置中定义了路径别名，请使用它们

### 命名约定
- **变量/函数：** camelCase
- **类/接口：** PascalCase
- **常量：** SCREAMING_SNAKE_CASE
- **文件：** 大多数使用 kebab-case，React 组件使用 PascalCase

### 错误处理
- 使用带描述性消息的类型化错误
- 让错误适当地传播，而不是静默捕获
- 使用 Zod 进行运行时验证（已是依赖项）

### Git 集成
- Biome 与 git 集成（已启用 VCS）
- 提交前应通过 `bun run check:ci`

## 项目结构

```
sylastra-agent-tree/
├── src/
│   ├── agents/       # Agent 工厂（orchestrator、explorer、oracle 等）
│   ├── cli/          # CLI 入口
│   ├── config/       # 常量、模式、MCP 默认配置
│   ├── council/      # 委员会管理器（多 LLM 会话编排）
│   ├── hooks/        # OpenCode 生命周期钩子
│   ├── mcp/          # MCP 服务器定义
│   ├── multiplexer/  # Tmux/Zellij 面板集成（用于子会话）
│   ├── skills/       # 技能定义（包含在包发布中）
│   ├── tools/        # 工具定义（council、webfetch、AST-grep 等）
│   └── utils/        # 共享工具（tmux、会话辅助）
├── dist/             # 构建后的 JavaScript 和声明文件
├── docs/             # 面向用户的文档
├── biome.json        # Biome 配置
├── tsconfig.json     # TypeScript 配置
└── package.json      # 项目清单和脚本
```

## 关键依赖

- `@modelcontextprotocol/sdk` - MCP 协议实现
- `@opencode-ai/sdk` - OpenCode AI SDK
- `zod` - 运行时验证

## 开发工作流

1. 进行代码更改
2. 当行为、命令、配置、工作流或面向用户的输出发生变化时更新文档
   - 检查 `README.md` 以及 `docs/` 中的相关文件
   - 保持示例、命令片段和功能列表与代码同步
   - 如果不需要更新文档，请在最终摘要中明确说明
3. 运行 `bun run check:ci` 验证 lint 和格式
4. 运行 `bun run typecheck` 验证类型
5. 运行 `bun test` 验证测试通过
6. 提交更改

## Tmux 会话生命周期管理

在使用 tmux 集成时，理解会话生命周期对于防止孤儿进程和幽灵面板至关重要。

### 会话生命周期流程

```
任务启动：
  session.create() → tmux 面板创建 → 任务运行

任务正常完成：
  session.status (idle) → 提取结果 → session.abort()
  → session.deleted 事件 → tmux 面板关闭

任务被取消：
  cancel() → session.abort() → session.deleted 事件
  → tmux 面板关闭

外部删除会话：
  session.deleted 事件 → 任务清理 → tmux 面板关闭
```

### 关键实现细节

**1. 优雅关闭（src/utils/tmux.ts）**
```typescript
// 始终在关闭面板前发送 Ctrl+C
spawn([tmux, "send-keys", "-t", paneId, "C-c"])
await delay(250)
spawn([tmux, "kill-pane", "-t", paneId])
```

**2. 会话中止时机（src/council/council-manager.ts）**
- 在提取任务结果后调用 `session.abort()`
- 这确保内容在会话终止前被保留
- 触发 `session.deleted` 事件以进行清理

**3. 事件处理器（src/index.ts）**
multiplexer 会话处理器必须保持连接：
- `multiplexerSessionManager.onSessionDeleted()` - 关闭 tmux/zellij 面板

### 测试 Tmux 集成

对会话管理进行更改后：

```bash
# 1. 构建插件
bun run build

# 2. 从本地分支运行（在 ~/.config/opencode/opencode.jsonc 中）：
# "plugin": ["file:///path/to/sylastra-agent-tree"]

# 3. 启动测试任务
@explorer count files in src/
@librarian search for Bun documentation

# 4. 验证没有孤儿进程
ps aux | grep "opencode attach" | grep -v grep
# 任务完成后应返回 0 个进程
```

### 常见问题

**幽灵面板未关闭：**
- 检查是否在结果提取后调用了 `session.abort()`
- 验证 `session.deleted` 处理器是否在 src/index.ts 中连接

**孤儿 opencode attach 进程：**
- 确保优雅关闭在 kill-pane 之前发送了 Ctrl+C
- 检查 tmux 面板是否在进程终止前关闭

## 推送前代码审查

在将更改推送到仓库之前，请始终运行代码审查以捕获以下问题：
- 重复代码
- 冗余函数调用
- 竞态条件
- 逻辑错误

### 使用 `/review` 命令（推荐）

OpenCode 内置了 `/review` 命令，可自动执行全面的代码审查：

```bash
# 审查未提交的更改（默认）
/review

# 审查特定提交
/review <commit-hash>

# 审查分支比较
/review <branch-name>

# 审查 PR
/review <pr-url-or-number>
```

**为什么使用 `/review` 而不是手动询问 @oracle？**
- 标准化的审查流程，具有一致的关注领域（错误、结构、性能）
- 自动处理 git 操作（diff、status 等）
- 上下文感知：读取完整文件和约定文件（AGENTS.md 等）
- 委托给专门的 @build 子代理，具有适当的权限
- 提供可操作的、实事求是的反馈

### 推送前的工作流

1. **进行更改**
   ```bash
   # ... 编辑文件 ...
   ```

2. **暂存更改**
   ```bash
   git add .
   ```

3. **运行代码审查**
   ```
   /review
   ```

4. **解决发现的任何问题**

5. **运行检查**
   ```bash
   bun run check:ci
   bun test
   ```

6. **提交并推送**
   ```bash
   git commit -m "..."
   git push origin <branch>
   ```

**注意：** `/review` 命令在我们的 PR #127 中发现了 linter 和测试都没有捕获的问题（重复代码、冗余的 abort 调用）。推送前始终使用它！

## 常见模式

- 这是一个 OpenCode 插件——大多数功能位于 `src/` 中
- CLI 入口是 `src/cli/index.ts`
- 主插件导出是 `src/index.ts`
- Agent 工厂位于 `src/agents/` 中——每个 agent 有自己独立的文件 + 可选的 `.test.ts`
- 技能位于 `src/skills/` 中（包含在包发布中）
- Multiplexer 会话管理位于 `src/multiplexer/` 中
- 委员会管理器（多 LLM 编排）位于 `src/council/` 中
- Tmux 工具位于 `src/utils/tmux.ts` 中
- 35 个文件中共有 468 个测试——运行 `bun test` 验证

## 仓库地图

完整的代码地图位于项目根目录的 `codemap.md`。

在处理任何任务之前，请阅读 `codemap.md` 以了解：
- 项目架构和入口点
- 目录职责和设计模式
- 模块之间的数据流和集成点

如需深入处理特定文件夹，还请阅读该文件夹的 `codemap.md`。

## 调试问题

### OpenCode
日志文件写入位置：
macOS/Linux：~/.local/share/opencode/log/
Windows：按 WIN+R，粘贴 %USERPROFILE%\.local\share\opencode\log
日志文件以时间戳命名（例如 2025-01-09T123456.log），保留最近 10 个日志文件。
您可以使用 --log-level 命令行选项设置日志级别以获取更详细的调试信息。例如：opencode --log-level DEBUG。

### 插件
~/.local/share/opencode/sylastra-agent-tree.<timestamp>.log

## 克隆依赖源

只读的依赖源仓库可在 `.slim/clonedeps/repos/` 下查看。不要编辑这些克隆。

- `.slim/clonedeps/repos/opencode-ai__opencode/` — `https://github.com/opencode-ai/opencode.git` at `main@73ee493265acf15fcd8caab2bc8cd3bd375b63cb`；查看 `packages/plugin` 和 `packages/sdk/js` 以了解 OpenCode 插件和 SDK 内部实现。
- `.slim/clonedeps/repos/opencode/` — `https://github.com/anomalyco/opencode.git` at `dev@356f6841865d68adf6d0123c37357ad50814497a`；查看 `packages/opencode` 以了解最新的 TypeScript 运行时内部实现和实验性的后台子代理支持。
- `.slim/clonedeps/repos/modelcontextprotocol__typescript-sdk/` — `https://github.com/modelcontextprotocol/typescript-sdk.git` at `v1.29.0@e12cbd7078db388152f6e839abdbe09ba01f3f32`；查看它以了解 MCP 协议和服务器集成内部实现。

## 提交约定

- 提交信息必须遵循约定式提交（Conventional Commits）。
- 提交信息的 `message` 部分使用中文。
- commit body 中不使用 emoji。
