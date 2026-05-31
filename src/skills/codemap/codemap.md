# src/skills/codemap/

## 职责

- 提供一个命令式的技能包，标准化对不熟悉代码库的仓库映射工作流。
- 通过 `SKILL.md` 定义编排器/fixer agent 使用的任务契约，以及通过 `README.md` 提供操作指南。
- 生成和演进能感知变更的 codemap 状态产物（`.slim/codemap.json`）并搭建占位模板（`codemap.md`）。

## 设计

- 契约层：`SKILL.md`（机器 prompt 契约）+ `README.md`（面向人类读者的操作说明）。
- 执行层：`scripts/codemap.mjs` 导出确定性辅助函数：
  - `parseArgs(argv)`
  - `cmdInit`、`cmdChanges`、`cmdUpdate`
  - `selectFiles`、`computeFileHash`、`computeFolderHash`、`createEmptyCodemap`
  - `loadState`、`saveState`、`migrateLegacyState`
- 持久化模型：JSON 状态文件 `.slim/codemap.json`，包含 `metadata`、`file_hashes` 和 `folder_hashes`。
- 测试层：`scripts/codemap.test.ts` 验证模式匹配、哈希确定性和迁移行为。
- 脚本有意避免网络请求，仅修改文件系统本地状态和 codemap 模板。

## 流程

- 入口 `main(argv)` 解析命令和参数（`init|changes|update`、`--root`、`--include`、`--exclude`、`--exception`），并通过严格的分支进行分发。
- `cmdInit()` 使用 `selectFiles()` 计算包含/排除的候选集，并写入：
  1) 通过 `saveState()` 生成 `.slim/codemap.json`
  2) 通过 `createEmptyCodemap()` 为每个发现的文件夹生成一个 `codemap.md`。
- `cmdChanges()` 重新加载状态（`loadState()` + `migrateLegacyState()`），重新计算当前哈希值，输出新增/删除/修改的差异和受影响的文件夹列表，如果状态不存在则非零退出。
- `cmdUpdate()` 根据现有元数据重新计算完整状态并持久化，用于目标 fixer 完成更新后调用。
- `codemap` 技能在 SKILL 工作流中的调用路径是明确的：步骤 1 检查 `.slim/codemap.json` 或 `.slim/cartography.json`，然后步骤 2/3 选择初始化或增量路径。

## 集成

- 通过 `src/cli/custom-skills.ts` 安装到 OpenCode 中，`name: 'codemap'`，`sourcePath: 'src/skills/codemap'`。
- `src/cli/install.ts` 将此目录复制到用户技能目录；OpenCode 从该上下文中执行 `scripts/codemap.mjs`。
- `src/hooks/filter-available-skills/index.ts` 通过 `getSkillPermissionsForAgent()` 中的名称应用 agent 级别的技能门控。
- `scripts/verify-release-artifact.ts` 包含 codemap 技能元数据和运行时检查，作为必需的打包文件。
