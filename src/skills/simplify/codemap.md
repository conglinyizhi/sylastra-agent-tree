# src/skills/simplify/

## 职责

- 提供一个保持行为不变的重构技能契约，将代码清理约束为聚焦清晰度、低风险的变更。
- 为任何简化任务定义明确的质量关卡（理解前置、行为对等、增量简化、可回滚的差异）。
- 仅包含元数据；此目录中不保留本地运行时状态机。

## 设计

- 契约层：`SKILL.md` 是可执行的 prompt 规范，包含明确的阶段：
  - 变更前的理解
  - 简化候选选择
  - 增量转换与验证
  - 最终审查清单。
- 文档层：`README.md` 解释意图、源码来源和插件安装行为。
- 策略模型是声明式的（`description`、允许的用法、检查清单），由 OpenCode 技能执行器消费，不依赖辅助脚本或插件代码。

## 流程

- Agent 发现将 `src/skills/simplify` 解析为自定义技能入口点，然后在运行时读取 `SKILL.md`。
- 运行时行为由 `src/cli/custom-skills.ts`（`allowedAgents: ['oracle']`）和 `getSkillPermissionsForAgent()` 中计算的技能权限进行门控。
- 实践上工作流是只读且上下文驱动的：简化指令要求在修改前理解调用方、边界情况和测试，然后应用局部、有范围的带验证重构。
- 使用者（Fixer/Oracle/Reviewer 任务）依赖此契约作为操作约束，而非可执行的 TypeScript。

## 集成

- 由插件安装器（`installCustomSkills`）通过 `src/cli/install.ts` 的 `installCustomSkill()` 安装。
- 权限面由 `src/hooks/filter-available-skills/index.ts` 中的钩子层（`permissionRules`）强制执行。
- 发布完整性：`scripts/verify-release-artifact.ts` 检查包 tarball 中是否存在 `src/skills/simplify/SKILL.md`。
- 在 `src/index.ts` 的编排中与 codemap/fixer 流程配合使用，用于功能完成后的可读性加固。
