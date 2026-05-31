# src/skills/

## 职责

- 掌管与本包一起发布的、基于元数据的 OpenCode 自定义技能。
- 维护技能契约工件（`SKILL.md`、`README.md`、每个技能的辅助文件），这些文件在安装时被复制到
  `${configDir}/skills`。
- 维护规范的注册边界：运行时代码将技能定义作为数据消费，而非可执行
  的插件依赖。

## 设计

- `src/cli/custom-skills.ts` 中的 `CUSTOM_SKILLS` 是捆绑技能的权威清单；
  每个条目将文件夹名称 + `sourcePath` 映射到安装时的消费者。
- `install.ts` 运行 `installCustomSkill()`，递归地将捆绑的技能
  目录复制到 OpenCode 的技能目录中。
- 该目录按技能划分：
  - `src/skills/codemap/`（命令式仓库映射技能）
  - `src/skills/clonedeps/`（依赖源镜像的工作流技能）
  - `src/skills/simplify/`（可读性/重构指导技能）
- 文件被视为静态运行时负载。`src/` 中没有插件 TS 模块直接导入这些文件；
  它们由 OpenCode 通过文件系统安装加载。

## 流程

- `bun run install` 委托给 `src/cli/install.ts`，其中 `installCustomSkills` 控制每个
  `CUSTOM_SKILLS` 条目的复制。
- `installCustomSkill()` 计算 `packageRoot`，验证 `sourcePath`，然后通过
  `copyDirRecursive()` 执行递归目录复制。
- 在插件发布期间，`package.json` 中的 `files` 白名单必须包含 `src/skills`，以确保
  `src/skills/**` 在 `npm pack` 中保留。
- OpenCode 插件启动时会发现这些安装的文件夹，并将每个 `SKILL.md` 作为提示级别的契约读取。

## 集成

- `src/cli/custom-skills.ts`：安装程序和权限辅助工具使用的权威注册表。
- `src/cli/skills.ts:getSkillPermissionsForAgent()`：当代理策略从内置推荐派生时，
  自动为捆绑技能填充权限规则。
- `verify-release-artifact.ts`：通过断言关键捆绑技能负载（如 `src/skills/simplify/SKILL.md`、
  `src/skills/codemap/SKILL.md` 和 `src/skills/clonedeps/SKILL.md`）存在于
  tarball 中来强制执行工件的完整性。
- `package.json` 脚本（`verify:release`、`build`）依赖这些资产来确保安装时的技能可用性。
