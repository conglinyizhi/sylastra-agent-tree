# scripts/

## 职责

- 维护仓库级别的构建、打包和发布验证自动化。
- 从事实类型的类型/模式生成衍生工件，并验证发布的输出对宿主环境保持安全。
- 提供打包前和打包后的检查，防止泄露本地路径，并验证插件在外部 OpenCode 运行时中的可安装性。

## 设计

- `generate-schema.ts`
  - 从 `src/config/schema.ts` 导入 `PluginConfigSchema`，并通过 `z.toJSONSchema` 生成规范的 JSON Schema。
  - 写入 `sylastra-agent-tree.schema.json`，包含显式的 `$schema`、`title` 和插件描述。
- `verify-release-artifact.ts`
  - 使用 `spawnSync` + `npm pack --json --ignore-scripts`。
  - 扫描 `dist/**/*` 中泄露的机器路径（`/Users/*`、`/home/*`）。
  - 验证所需的包载荷键（`package.json`、`dist/index.js`、`README.md`、`LICENSE`、
    `src/skills/codemap/SKILL.md`、`src/skills/simplify/SKILL.md` 等）。
  - 通过在临时项目中导入已安装的 `dist/index.js` 默认导出，执行干净的安装冒烟测试。
- `verify-opencode-host-smoke.ts`
  - 构建临时 OpenCode 环境（通过 `bun add opencode-ai` 获取二进制），挂载插件 tarball，
    启动 `opencode serve`，并探测 `http://127.0.0.1:<port>/global/health`。
  - 捕获日志，并在出现 `failed to load plugin` 和 `cannot find module` 模式时失败。
- 所有脚本都是可执行的边界文件（`#!/usr/bin/env bun` / Node），具有显式的临时目录生命周期管理
  和通过 `rmSync(..., { force: true, recursive: true })` 的防御性清理。

## 流程

- `bun run build` 在类型声明生成后，通过 `package.json#generate-schema` 调用 `scripts/generate-schema.ts`。
- `bun run verify:release` 运行 `verify-release-artifact.ts`：清理 dist -> 打包工件 -> 验证文件 -> 安装/导入检查。
- `bun run verify:host-smoke` 运行 `verify-opencode-host-smoke.ts`：打包 tarball -> 启动隔离宿主 -> 等待健康检查 -> 验证无插件加载错误。
- 两个验证脚本都是非交互式的，专为 CI/CD 发布前门禁设计。

## 集成

- 通过 `package.json` 脚本绑定到本地开发和发布流水线。
- 发布验证依赖于 `bun run build:plugin` 和 `bun run build:cli` 的构建输出，因为它期望
  `dist/index.js`、`dist/cli/index.js` 和生成的 schema 存在。
- 包完整性期望值被测试和发布脚本镜像，这些脚本断言打包的技能元数据和
  运行时文件存在。
- 冒烟检查实例化与 `src/index.ts` 导出相同的插件入口点（`dist/index.js`），
  在发布前捕获运行时损坏。
