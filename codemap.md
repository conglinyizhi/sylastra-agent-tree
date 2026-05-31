# 仓库地图：sylastra-agent-tree

## 项目职责

`sylastra-agent-tree` 是一个 OpenCode 插件，在宿主运行时之上增加了专家代理（specialist-agent）运行模型。其核心职责包括：

- 定义编排代理（orchestrator）和专家代理（specialist agents）
- 加载分层插件配置和每个代理的权限
- 提供额外的工具和 MCP 集成
- 管理可委托/可恢复的会话编排和终端复用器可视化
- 注入工作流强制钩子以及运行时命令处理器
- 交付安装时技能和引导 CLI

本代码地图仅涵盖插件仓库本身，不包括嵌套的 `opencode/` 上游检出。

## 系统入口点

| 路径 | 角色 |
|---|---|
| `package.json` | 包清单、依赖图、发布脚本、发布文件列表 |
| `src/index.ts` | 主要插件引导：连接代理、工具、MCP、钩子、委员会/会话管理器、复用器会话镜像、面试/预设管理器、任务会话追踪和配置合并行为 |
| `src/cli/index.ts` | 安装/引导工作流的 CLI 入口点 |
| `src/config/schema.ts` | 用于验证和模式生成的真实运行时配置模式 |
| `scripts/generate-schema.ts` | 从 Zod 配置模式生成 `sylastra-agent-tree.schema.json` |

## 仓库目录映射

| 目录 | 职责概要 | 详细地图 |
|---|---|---|
| `src/` | 主要应用面，组合了插件引导、运行时模型链、钩子编排、任务会话别名和面向安装者的代码 | [查看地图](src/codemap.md) |
| `src/agents/` | 编排代理和专家代理的工厂层，包括提示/模型覆盖、显示名称规范化、MCP 分配和权限塑造 | [查看地图](src/agents/codemap.md) |
| `src/cli/` | 安装程序、配置编辑、提供者预设生成和内置技能安装 | [查看地图](src/cli/codemap.md) |
| `src/config/` | 配置模式、分层加载器、预设合并、兼容性迁移、常量表和代理/MCP 策略辅助工具 | [查看地图](src/config/codemap.md) |
| `src/council/` | 多模型委员会编排，包括预设解析、议员执行模式、重试、超时处理和综合回退流程 | [查看地图](src/council/codemap.md) |
| `src/hooks/` | 聚合运行时钩子面，用于提示转换、恢复逻辑、任务会话别名、提示和生命周期策略 | [查看地图](src/hooks/codemap.md) |
| `src/hooks/apply-patch/` | 结构化的 `apply_patch` 解析、匹配、恢复和重写流水线 | [查看地图](src/hooks/apply-patch/codemap.md) |
| `src/hooks/auto-update-checker/` | 启动时更新检测、缓存处理和可选安装提示流程 | [查看地图](src/hooks/auto-update-checker/codemap.md) |
| `src/hooks/delegate-task-retry/` | 委托失败尝试后的工具重试指导 | [查看地图](src/hooks/delegate-task-retry/codemap.md) |
| `src/hooks/filter-available-skills/` | 基于代理权限策略的技能可见性过滤 | [查看地图](src/hooks/filter-available-skills/codemap.md) |
| `src/hooks/foreground-fallback/` | 交互式会话回退控制路径，用于速率限制或降级的前台执行，支持事件驱动的代理映射 | [查看地图](src/hooks/foreground-fallback/codemap.md) |
| `src/hooks/json-error-recovery/` | 针对格式错误的模型响应的 JSON/工具输出恢复辅助工具 | [查看地图](src/hooks/json-error-recovery/codemap.md) |
| `src/hooks/phase-reminder/` | 消息转换提醒，强制执行编排代理工作流阶段 | [查看地图](src/hooks/phase-reminder/codemap.md) |
| `src/hooks/post-file-tool-nudge/` | 读/写后的提醒路径，引导委托感知的下一步操作 | [查看地图](src/hooks/post-file-tool-nudge/codemap.md) |
| `src/hooks/task-session-manager/` | 可恢复的 `task` 会话追踪、简短别名解析、提示注入和过期会话清理 | [查看地图](src/hooks/task-session-manager/codemap.md) |
| `src/hooks/todo-continuation/` | 未完成待办执行的自动继续行为 | [查看地图](src/hooks/todo-continuation/codemap.md) |
| `src/interview/` | `/interview` 特性：每个会话和仪表板的提示/状态编排、持久化、本地 UI 和跨进程协调 | [查看地图](src/interview/codemap.md) |
| `src/mcp/` | 内置 MCP 注册表和每个提供者的 MCP 定义 | [查看地图](src/mcp/codemap.md) |
| `src/multiplexer/` | 终端复用器抽象层，包含后端选择、会话镜像、轮询回退和关闭生命周期编排 | [查看地图](src/multiplexer/codemap.md) |
| `src/multiplexer/tmux/` | tmux 后端实现，用于面板生命周期和布局管理 | [查看地图](src/multiplexer/tmux/codemap.md) |
| `src/multiplexer/zellij/` | zellij 后端实现，用于标签/面板生命周期管理 | [查看地图](src/multiplexer/zellij/codemap.md) |
| `src/skills/` | 作为静态载荷随包发布的安装时 OpenCode 技能 | [查看地图](src/skills/codemap.md) |
| `src/skills/codemap/` | 仓库映射技能包和代码地图状态管理脚本 | [查看地图](src/skills/codemap/codemap.md) |
| `src/skills/clonedeps/` | 仅工作流的依赖源镜像技能，通过 librarian 和直接编排代理 git 操作路由发现/引用解析 | [查看地图](src/skills/clonedeps/codemap.md) |
| `src/skills/simplify/` | 行为保持简化技能包 | [查看地图](src/skills/simplify/codemap.md) |
| `src/tools/` | 工具和运行时命令导出面，用于 AST-grep、smartfetch、委员会编排和 `/preset` 切换 | [查看地图](src/tools/codemap.md) |
| `src/tools/ast-grep/` | AST-grep 二进制管理和 AST 感知搜索/替换工具流程 | [查看地图](src/tools/ast-grep/codemap.md) |
| `src/tools/smartfetch/` | 网络内容的获取/提取/缓存流水线和辅助模型摘要 | [查看地图](src/tools/smartfetch/codemap.md) |
| `src/utils/` | 横切辅助工具，用于日志记录、会话元数据、可恢复任务别名、系统消息规范化、子代理深度追踪、环境和运行时操作 | [查看地图](src/utils/codemap.md) |
| `scripts/` | 构建/发布验证和生成产物维护脚本 | [查看地图](scripts/codemap.md) |

## 运行时控制流

1. **插件启动**
   - OpenCode 加载 `src/index.ts`。
   - 配置通过 `src/config/` 加载和规范化。
   - 代理定义由 `src/agents/` 生成。
   - 注册来自 `src/tools/` 的工具工厂和来自 `src/mcp/` 的 MCP 定义。
   - 连接来自 `src/hooks/` 的钩子。
   - 初始化委托/委员会编排、复用器会话镜像、面试支持、任务会话别名和运行时预设处理。

2. **交互请求处理**
   - 编排代理提示驱动路由决策。
   - 工具调用通过 `src/tools/` 或内置 OpenCode 工具解析。
   - 钩子可以转换提示/消息、规范化系统消息数组、修复工具故障或在执行前后拦截运行时命令。

3. **委托执行**
   - OpenCode 子会话由委托/委员会流程创建，并由插件工具追踪。
   - `src/hooks/task-session-manager/` 记住可重用的子会话，并将简短别名注入编排代理提示中。
   - `src/multiplexer/` 可选地将这些会话镜像到 tmux/zellij 面板中。
   - 结果通过通知/输出轮询流回父会话。

4. **安装/发布路径**
   - `src/cli/` 配置宿主 OpenCode 实例。
   - `src/skills/` 复制到用户技能目录。
   - `scripts/` 验证生成的模式、包完整性和宿主加载行为。

## 关键跨模块集成点

- `src/index.ts` 是几乎每个运行时子系统的中央组合根。
- `src/config/` 为 `src/agents/`、会话/委托工具和 MCP 注册提供数据。
- `src/cli/skills.ts` 和 `src/cli/custom-skills.ts` 桥接安装时技能打包与运行时权限策略。
- 会话/委托工具依赖于 `src/multiplexer/`，并与 `src/utils/` 中的辅助工具协作，进行深度追踪、结果提取、任务输出解析和别名状态管理。
- `src/tools/council.ts` 委托给 `src/council/`。
- `src/tools/preset-manager.ts` 钩子命令执行，并从配置的预设更新运行时代理模型。
- `src/hooks/task-session-manager/` 依赖于 `src/utils/session-manager.ts` 和 `src/utils/task.ts` 以支持子会话重用。
- `src/hooks/filter-available-skills/` 和代理权限逻辑依赖于 CLI/配置层共享的技能名称。
- `src/interview/` 连接到 `src/index.ts` 暴露的插件命令/事件面。

## 根资产

- `README.md`：面向用户的产品概述、安装文档和代理描述。
- `AGENTS.md`：此仓库的代理操作约定。
- `biome.json`：格式化/lint 策略。
- `tsconfig.json`：TypeScript 编译器设置。
- `.slim/codemap.json`：此仓库的代码地图变更检测状态。

## 推荐阅读顺序

1. `codemap.md`
2. `src/codemap.md`
3. 以下之一：
   - `src/agents/codemap.md`
   - `src/multiplexer/codemap.md`
   - `src/tools/codemap.md`
   - `src/hooks/codemap.md`
4. 手头任务相关的子系统子地图
