# src/skills/clonedeps/

## 职责

一个仅用于工作流的 OpenCode 内置技能，用于本地依赖源码镜像。它指导编排器使用 `@librarian` 进行依赖发现和源码 URL/引用解析，然后直接执行经过批准的 git/文件系统操作。

## 设计

- `SKILL.md` 是由 OpenCode 加载的 prompt 契约，且仅分配给编排器。
- 没有附带辅助脚本。该技能避免了脆弱的跨生态解析，并将仓库特定的判断保留在 librarian/编排器中。
- 状态存储在可追踪的项目元数据文件 `.slim/clonedeps.json` 中；克隆内容存放在 `.slim/clonedeps/repos/<安全的依赖名>/` 下，并被 git 忽略。
- 工作流会更新 `.gitignore`、`.ignore` 和根目录的 `AGENTS.md`，添加简洁的标记段，使克隆源码不出现在 git 中但对 OpenCode 可见，且可被未来的 agent 发现。

## 流程

1. 编排器首先检查 `.slim/clonedeps.json`，如果现有克隆满足当前任务则直接复用。
2. 编排器请求 librarian 根据仓库实际的语言/生态系统制定一个小型的源码解析计划。
3. 编排器在可能的情况下验证引用，并请求用户批准。
4. 编排器将每个获批的源码仓库克隆/拉取到 `.slim/clonedeps/repos/<安全的仓库名>/`。
5. 编排器写入 `.slim/clonedeps.json`，包含路径、引用和原因。
6. 编排器更新 `.gitignore`、`.ignore` 和根目录的 `AGENTS.md`；AGENTS 部分直接列出每个只读克隆路径及其一句话用途说明。

## 集成

- 在 `src/cli/custom-skills.ts` 中注册，仅限编排器权限。
- 通过 `scripts/verify-release-artifact.ts` 包含在发布验证中。
- 在 `docs/skills.md` 中有文档说明，并包含在 `src/skills/codemap.md` 中。
