# src/mcp/

## 职责

- 定义并暴露内置的 MCP 端点（websearch、context7、grep.app）以及共享类型别名，使应用程序能够统一处理远程和本地 MCP（`src/mcp/index.ts`、`src/mcp/types.ts`）。
- 提供单一入口点（`createBuiltinMcps`）用于实例化默认连接器，同时遵循功能开关/禁用列表。

## 设计

- `types.ts` 定义了判别联合类型 `McpConfig`，包含 `RemoteMcpConfig` 和 `LocalMcpConfig`，使每个连接器的结构都明确且易于在编译时校验。
- 每个服务文件导出一个 `RemoteMcpConfig` 字面量，指向远程 URL 并可选择提供从对应环境变量派生的头部信息，以避免泄露密钥（`websearch.ts`、`context7.ts`、`grep-app.ts`）。
- `index.ts` 将内置配置聚合在 `Record<McpName, McpConfig>` 中，并暴露辅助函数/类型供外部消费者使用，保持硬编码的 MCP 集合集中管理。

## 流程

- 启动时，`createBuiltinMcps` 遍历模块内注册表，过滤掉任何列在 `disabled_mcps` 中的 MCP，将剩余配置作为字符串键记录返回给上层栈（`src/index.ts`）。
- 每个远程配置被即时求值，因此唯一随请求变化的变量是 `disabled_mcps` 列表和环境提供的 API 密钥（用于头部）。

## 集成

- `src/index.ts` 导入 `createBuiltinMcps` 以构造运行时使用的 MCP 映射，传入用户/CLI 配置的 `disabled_mcps` 数组。
- 从 `src/mcp/types.ts` 导出的类型由 `src/mcp/index.ts` 重新导出，使其他模块可以引用 `McpConfig`、`LocalMcpConfig` 和 `RemoteMcpConfig`，而无需深入到单个文件。
- 远程配置是纯数据对象，由运行时的 MCP 执行层（通过 `McpConfig` 约定）消费，仅依赖环境提供的凭据和此处定义的 URL。
