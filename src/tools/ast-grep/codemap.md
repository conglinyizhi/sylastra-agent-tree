# src/tools/ast-grep/

## 职责

- 封装外部的 `ast-grep` CLI，使更广泛的系统能够调用 AST 感知的搜索与替换，而无需关心二进制发现或参数细节（`cli.ts`、`tools.ts`）。
- 提供类型完备的工具原语（`types.ts`）以及格式化的用户输出提示/摘要辅助函数（`utils.ts`），可供 CLI 命令或插件 UI 层复用。
- 管理 CLI 使用中的脆弱部分：从缓存、npm 包或 Homebrew 中定位二进制文件，在需要时下载平台特定版本，并呈现环境状态/限制（`constants.ts`、`downloader.ts`）。

## 设计模式与决策

- **带重试的单例初始化：**`getAstGrepPath` 缓存了一个初始化 Promise，使并发请求共享发现/下载工作，并从本地二进制文件回退到下载（`cli.ts`）。
- **作为声明式元数据的工具定义：**`tools.ts` 通过 OpenCode 工具注册表导出 `ast_grep_search` 和 `ast_grep_replace`，将描述、模式和执行逻辑集中在一处。
- **关注点分离：**`cli.ts` 专注于进程启动和 JSON 解析，`constants.ts` 负责二进制路径解析以及环境检查/格式化，`utils.ts` 格式化结果，而 `downloader.ts` 处理平台映射、缓存目录和获取/解压。
- **快速失败并给出提示：**针对每种语言定制的空匹配提示（例如，帮助移除 Python 中的尾随冒号）在保持 AST 要求明确的同时改善了搜索体验。

## 数据与控制流

- 工具（`ast_grep_search`、`ast_grep_replace`）调用 `runSg`，填充 CLI 参数（pattern、rewrite、globs、context），并将输出通过 `formatSearchResult`/`formatReplaceResult` 处理后，再通过 `showOutputToUser` 报告（`tools.ts`）。
- `runSg` 构造命令，确保 CLI 二进制文件存在（通过 `getAstGrepPath` 重置，该函数可能调用 `findSgCliPathSync` 或触发下载），启动进程并设置超时处理，解析紧凑 JSON，同时防范截断输出和 CLI 错误（`cli.ts`）。
- 二进制解析使用 `constants.ts` 中的辅助函数检测缓存的二进制文件、已安装的包、平台特定的包或 Homebrew 路径，并向上游调用者暴露环境检查/格式化信息（`constants.ts`）。
- `downloader.ts` 是回退路径：它推断平台标识，下载匹配的 GitHub 发布包，解压 `sg`，设置可执行权限，并将其缓存到 `~/.cache/sylastra-agent-tree/bin`（或 Windows AppData）下，以便后续命令复用该二进制文件。

## 集成点

- `index.ts` 重新导出 `ast_grep_search`、`ast_grep_replace`、运行时辅助函数（`ensureCliAvailable`、`checkEnvironment` 等）以及下载器工具，使其他模块在共享诊断信息的同时接入工具层（`index.ts`）。
- OpenCode 插件层从 `src/tools/ast-grep/index.ts` 导入 `builtinTools`，以通过 CLI 工具注册表公开搜索/替换能力。
- `constants.ts` 和 `downloader.ts` 被 `cli.ts` 用于决定在何处执行 `sg`，同时环境辅助函数为入门 UI 或设置脚本提供关于缺失二进制文件的信息。
- `types.ts` 定义了共享的 `CliLanguage`、`CliMatch` 和 `SgResult` 类型形状，为 CLI 调用、格式化工具和工具模式提供类型安全。
