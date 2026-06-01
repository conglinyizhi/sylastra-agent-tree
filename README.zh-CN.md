# sylastra-agent-tree

[English](README.md) | 简体中文

`sylastra-agent-tree` 是一个面向 OpenCode 的多智能体编排插件。它内置了
编排者和一组专家智能体，用于代码库侦察、文档查询、实现、审查和 UI 工作。

本项目 fork 自
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)，当前只通过
GitHub Releases 发布。安装与更新都围绕自包含 release artifact 进行，不再依赖
`bunx`、`npm publish` 或包管理器安装链路。

## 项目能力

- 由编排者将任务路由给不同专家智能体
- 内置预设与插件配置生成能力
- 技能与 MCP 集成随 release artifact 一起交付
- 提供 interview、council、task-session 等大任务工作流
- 基于 artifact 的自动更新检查，支持 prepare、activate、healthcheck 和 rollback

## 安装

从
[GitHub Releases](https://github.com/conglinyizhi/sylastra-agent-tree/releases)
下载最新 release artifact，解压后执行：

```bash
./install.sh
```

安装器会：

- 使用本地 `file://` 路径注册插件
- 在未跳过配置时写入 `~/.config/opencode/sylastra-agent-tree.json`
- 生成内置预设，或按需生成单模型预设
- 保持 release 安装行为与打包产物目录结构一致

也可以直接调用产物内置 CLI：

```bash
node dist/cli/index.js install
```

常用选项：

```bash
node dist/cli/index.js install --preset=opencode-go
node dist/cli/index.js install --model=openai/gpt-5.5
node dist/cli/index.js install --skip-config
node dist/cli/index.js install --skip-plugin-register
node dist/cli/index.js install --reset
```

`--preset` 与 `--model` 互斥。`--model` 会生成并激活一个覆盖全部默认智能体的
`single-model` 预设。

完整安装说明见 [docs/installation.md](docs/installation.md)。

## 安装后

1. 认证模型提供方：

   ```bash
   opencode auth login
   ```

2. 刷新模型列表：

   ```bash
   opencode models --refresh
   ```

3. 启动 OpenCode 后验证插件：

   ```text
   ping all agents
   ```

生成的配置默认会带上内置预设。你可以手动编辑
`~/.config/opencode/sylastra-agent-tree.json` 调整模型；如果希望首次安装后立即可运行，
也可以直接用 `--model=<provider/model>` 生成统一模型配置。

## 自动更新

插件会在启动时检查新的 release artifact。

- 本地 `file://` 开发安装会被识别为 dev mode，不参与自动更新
- 已固定版本的插件条目会保持固定
- 默认策略会在后台准备下一版本，并在下次启动时激活
- 激活后的健康检查失败会自动回滚

如果只想提示，不想自动准备更新：

```jsonc
{
  "autoUpdate": false
}
```

也支持对象模式：

```jsonc
{
  "autoUpdate": {
    "enabled": true,
    "policy": "prepare",
    "channel": "stable",
    "manifestUrl": "https://github.com/conglinyizhi/sylastra-agent-tree/releases/latest/download/manifest.json",
    "cohort": "default"
  }
}
```

完整更新与运行时配置说明见
[docs/configuration.md](docs/configuration.md)。

## Release Artifact

每个 GitHub release 都会产出一个自包含 artifact，内含：

- `dist/`
- `src/skills/`
- `package.json`
- `VERSION`
- `artifact-manifest.json`
- `sylastra-agent-tree.schema.json`
- 运行时依赖
- 对应平台的 updater 与辅助二进制

Go updater 会在 CI 中自动编译后直接打进 release artifact，终端用户无需在本地编译
Go 代码。

## 内置智能体

当前内置智能体包括：

- `orchestrator`：主协调者与委派入口
- `oracle`：高判断力审查与架构分析
- `explorer`：快速仓库侦察
- `librarian`：文档与网页信息查询
- `designer`：UI 与前端相关工作
- `fixer`：范围明确的实现与修复
- `council`、`observer`：按配置启用的可选工作流

具体 prompt 与实现见 [src/agents](src/agents)。

## 配置

主要配置文件：

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/sylastra-agent-tree.json`
- `.opencode/sylastra-agent-tree.json`

插件支持：

- 预设切换
- 按智能体配置模型
- 自定义智能体
- MCP 白名单/黑名单
- multiplexer 设置
- council 预设
- interview 设置
- fallback 链路
- 自动更新策略

建议从 [docs/configuration.md](docs/configuration.md) 开始。

## 开发

常用命令：

```bash
bun run build
bun run check:ci
bun run typecheck
bun test
bun run build:release
bun run verify:release
```

当前 release 流水线会构建 TypeScript artifact、在 CI 中编译 Go updater、打包平台相关辅助二进制、生成校验文件与 manifest，并在发布前校验最终产物。

## 许可证

MIT。
