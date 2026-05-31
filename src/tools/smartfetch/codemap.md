# src/tools/smartfetch/

## 职责

- 实现内置的 `webfetch` 工具：获取远程文档，执行重定向/来源策略，在合适时探测 `llms.txt`，并返回规范化的文本/markdown/html 输出（`tool.ts`、`network.ts`）。
- 处理围绕获取步骤的内容加工：HTML 提取、元数据/frontmatter 渲染、标题清理、缓存键构建、二进制持久化以及辅助模型回退（`utils.ts`、`cache.ts`、`binary.ts`、`secondary-model.ts`）。

## 设计模式与决策

- **单一编排入口：**`tool.ts` 中的 `createWebfetchTool` 负责权限提示、缓存查找/重新验证、llms.txt 偏好逻辑、二进制 vs 文本分支、元数据输出以及可选的辅助模型摘要。
- **传输/策略与渲染分离：**`network.ts` 专注于 URL 规范化、重定向白名单、字符集/正文解码、头部提取和 llms.txt 探测，而 `utils.ts` 专注于将获取的内容转换为清洗后的文本/markdown/html，以及 frontmatter 和面向用户的消息。
- **基于获取形状的缓存键：**`cache.ts` 以 URL 加上影响行为的选项（`extract_main`、`prefer_llms_txt`、`save_binary`）作为缓存键，而渲染格式从缓存的获取结果派生，因此 text/markdown/html 不会强制产生冗余的网络请求。
- **优雅降级：**缺失/无效的 `llms.txt`、被阻止的重定向、仅含元数据的二进制响应以及辅助模型失败，都能返回可用结果，而不是丢弃已获取的内容。

## 数据与控制流

1. `createWebfetchTool` 规范化请求的 URL，推导权限模式/允许的来源，请求 `webfetch` 权限，并计算缓存键（`tool.ts`、`network.ts`、`cache.ts`）。
2. 如果适用 `prefer_llms_txt`，`probeLlmsText` 会依次尝试 `/llms-full.txt` 和 `/llms.txt`，仅遵循允许的重定向，并拒绝 HTML/登录页响应（`network.ts`）。
3. 当工具回退到页面本身时，`fetchWithUpgradeFallback` 处理 HTTPS 升级回退、重定向执行、用于重新验证的条件请求头、二进制检测以及有界正文读取（`network.ts`、`tool.ts`）。
4. 文本/HTML 负载通过 `extractFromHtml`、`cleanFetchedMarkdown`、`extractHeadingsFromMarkdown`、`frontmatter` 和 `joinRenderedContent` 进行解码和规范化；二进制负载可选择通过 `saveBinary` 持久化，并返回一条元数据消息（`utils.ts`、`binary.ts`、`tool.ts`）。
5. 如果调用者提供了提示并配置了辅助模型，`runSecondaryModelWithFallback` 会将输入截断到有界大小，为辅助会话禁用工具访问，在配置的模型之间重试，如果该步骤失败，工具会降级回基础获取的内容（`secondary-model.ts`、`tool.ts`）。

## 集成点

- `src/index.ts` 以公共名称 `webfetch` 注册该工具，使代理能够在 council 和 AST-grep 工具旁调用它。
- `src/tools/smartfetch/index.ts` 重新导出工具工厂、描述和共享类型，供其他模块或文档导入，而无需深入到实现文件中。
- `secondary-model.ts` 依赖 OpenCode 插件客户端（`PluginInput['client']`）来生成一个隔离的辅助会话，从有效的 OpenCode 配置中解析 `small_model`，并从 slim 自己的插件配置加载器中解析 `explorer`/`librarian` 回退。
- `cache.ts`、`network.ts` 和 `utils.ts` 被有意设计为可复用的测试接缝：缓存行为、重定向策略、llms 探测、标题提取以及渲染/元数据辅助函数可以在不触及完整工具入口的情况下进行验证。
