---
name: clonedeps
description: 将重要项目依赖的源代码克隆到被忽略的本地工作空间中，以便 OpenCode 可以检查库的内部实现。当用户要求克隆依赖、检查依赖/源码内部实现、从源码理解 SDK/框架行为、调试库实现细节，或使核心依赖仓库在本地可读时使用。对于普通的 API/文档问题（@librarian 已足够），请勿使用此技能。
---

# Clonedeps 技能

您帮助用户将一小组重要的依赖源码仓库
变为 OpenCode 可本地读取的状态。

这是一个工作流技能，而非命令包装器。请勿使用辅助脚本来进行
依赖检测、引用验证、克隆、状态检查或清理。
协调者（orchestrator）和 `@librarian` 负责仓库相关的分析；协调者
直接执行经审批的文件系统/git 操作。

## 工作流

### 步骤 1：检查现有状态

首先检查 `.slim/clonedeps.json` 是否存在。

如果存在：

1. 在向 librarian 请求新计划之前先读取它。
2. 检查列出的每个 `path` 是否存在于 `.slim/clonedeps/repos/` 下。
3. 如果现有的克隆仓库已满足用户的任务，则复用它们。
4. 仅当现有清单缺失、过期或不足以完成当前任务时，才向 librarian 请求新的推荐。

当清单中已有有效条目时，不要从头开始重新扫描/重新规划。

### 步骤 2：向 Librarian 请求克隆计划

将依赖发现和源码解析委托给 `@librarian`。

使用以下提示：

```md
Understand this project first, then recommend remote source repos that would
help a developer work on it.

Read enough of the current repo to understand:
- what the project does
- its main architecture
- the important integration points
- what external systems or libraries it depends on in practice

Think like a developer trying to debug or extend this project.

Which remote repositories, if cloned locally, would actually help understand the
codebase or solve likely implementation/debugging tasks?

Do not make a dependency dump. Most dependencies are not worth cloning.
Recommend a repo only when its source code would be more useful than docs or the
current repo alone.

For each recommendation, include:
- repo name
- repo URL
- suggested ref/tag/commit if known
- why cloning this source would help
- when it would be useful
- caveats

Also include:
- current-repo files/folders to inspect first
- repos/dependencies you considered but would not clone

Keep it small. Prefer 0–3 strong recommendations over 5 weak ones. If nothing
clearly needs cloning, say so.
```

Librarian 应返回一个精简计划，包含：

- 依赖名称；
- 当前版本/范围（如果可以获取到）；
- 官方源码仓库 URL；
- 要检出的标签/提交/引用；
- 如果是 monorepo，则包含包子目录；
- 本地源码有帮助的原因；
- 注意事项，如仓库过大、缺少标签或版本映射不确定。

优先选择最多 3-5 个核心依赖。包括用户提及的依赖以及
核心框架、SDK、ORM、运行时/插件 API 或构建/运行时工具。不要
克隆小型工具库、传递依赖或仅用于开发的工具，除非它们
与当前任务直接相关。

### 步骤 3：验证并确认计划

协调者拥有最终审批权。在克隆之前：

1. 在可行的情况下使用 `git ls-remote` 手动验证引用。
2. 优先使用固定的标签或提交 SHA。如果没有精确的标签，请让 librarian
   找到正确的模块特定标签/提交或说明回退方案。
3. 默认只使用 HTTPS 的 GitHub/GitLab 风格的仓库 URL。拒绝
   `file://`、SSH URL、本地路径、包含凭据的 URL 以及私有
   或需要认证的仓库，除非用户明确批准该情况。
4. 向用户展示计划，包括依赖、仓库 URL、引用、原因和
   注意事项。
5. 在进行网络克隆前请求确认，除非用户明确要求
   立即克隆。

### 步骤 4：手动克隆源码

为每个源码仓库创建一个文件夹，位于：

```text
.slim/clonedeps/repos/<safe-repo-name>/
```

安全名称从仓库的拥有者/名称派生，而非包名。
例如，`https://github.com/opencode-ai/opencode.git` 变为
`opencode-ai__opencode`。将 `/` 替换为 `__`，去除常见的 `.git` 后缀，
并将其他不安全的路径字符替换为 `_`。

如果多个包来自同一个 monorepo，则克隆一次仓库，
让每个清单条目指向同一个仓库路径，使用不同的 `packagePath`
值。不要创建生态系统文件夹、按包划分的克隆文件夹或
按版本划分的文件夹。如果两个不同的源码仓库归一化为相同的
安全名称，手动消除歧义并将所选路径记录在
`.slim/clonedeps.json` 中。

使用普通的 git 命令进行克隆/拉取。对于已有的克隆，首先验证
`git remote get-url origin` 是否与批准的仓库 URL 匹配。如果不匹配，
停止并询问是否要清理/重新克隆。

安全的手动 git 模式：

1. `git ls-remote <repoUrl> <ref>` 在实际可行时验证引用。
2. 不克隆子模块/递归行为。
3. 在实际可行时优先使用浅层拉取/克隆。
4. 克隆到 `.slim/clonedeps/repos/` 下的临时目录，然后在检出生效后
   移动到最终的安全名称路径。
5. 删除失败的临时克隆。

不要运行从克隆仓库中安装/构建/测试依赖的脚本。

### 步骤 5：写入本地状态

写入 `.slim/clonedeps.json`，以便未来的 agent 知道存在哪些内容：

```json
{
  "version": "1.0.0",
  "updatedAt": "2026-05-12T00:00:00.000Z",
  "dependencies": [
    {
      "name": "@opencode-ai/plugin",
      "resolvedVersion": "1.3.17",
      "repoUrl": "https://github.com/opencode-ai/opencode.git",
      "ref": "v1.3.17",
      "path": ".slim/clonedeps/repos/opencode-ai__opencode",
      "packagePath": "packages/plugin",
      "reason": "Plugin API source used by the project"
    },
    {
      "name": "@opencode-ai/sdk",
      "resolvedVersion": "1.3.17",
      "repoUrl": "https://github.com/opencode-ai/opencode.git",
      "ref": "v1.3.17",
      "path": ".slim/clonedeps/repos/opencode-ai__opencode",
      "packagePath": "packages/sdk/js",
      "reason": "Core SDK source used to inspect runtime behavior"
    }
  ]
}
```

如果某个克隆在之前的克隆成功后失败，仍然为成功的克隆写入状态，
这样未来的检查不会产生误导。

不要将 `.slim/clonedeps.json` 添加到 `.gitignore`。它是小型、可审查的
项目元数据，可以提交。只有克隆的仓库内容
位于 `.slim/clonedeps/repos/` 下才应被忽略。

### 步骤 6：更新忽略文件

使用幂等的标记块更新 `.gitignore`：

```gitignore
# BEGIN sylastra-agent-tree clonedeps
.slim/clonedeps/repos/
# END sylastra-agent-tree clonedeps
```

更新 `.ignore`，以便 OpenCode 可以读取克隆的源码，同时 git 仍然忽略它：

```ignore
# BEGIN sylastra-agent-tree clonedeps
!.slim/
!.slim/clonedeps.json
!.slim/clonedeps/
!.slim/clonedeps/repos/
!.slim/clonedeps/repos/**
.slim/clonedeps/repos/**/.git/
.slim/clonedeps/repos/**/.git/**
# END sylastra-agent-tree clonedeps
```

只编辑这些标记块内部的内容。

### 步骤 7：在 AGENTS.md 中注册依赖源码

克隆成功后，更新仓库根目录的 `AGENTS.md`，以便未来的
agent 知道依赖源码存在的原因以及在哪里查找。

如果 `AGENTS.md` 已有 `## 克隆的依赖源码` 部分，则更新该
部分。否则追加此部分：

使用以下格式，直接列出实际的仓库。每项保持一句话，
这样未来的 agent 无需额外读取就能知道有什么内容：

```markdown
## 克隆的依赖源码

只读的依赖源码仓库可在
`.slim/clonedeps/repos/` 下查看。不要编辑这些克隆。

- `.slim/clonedeps/repos/<safe-name>/` — `<repo>` at `<ref>`；<一句话说明
  此源码有何用途>。
- `.slim/clonedeps/repos/<safe-name-2>/` — `<repo>` at `<ref>`；<一句话说明
  此源码有何用途>。
```

同时保持 `.slim/clonedeps.json` 作为结构化清单的更新，但不要
让 agent 为了获取基本的仓库列表而去读取它。

## 清理

当用户要求清理克隆的依赖时，移除：

- `.slim/clonedeps/repos/`
- 来自 `.gitignore` 和 `.ignore` 的被管理的 clonedeps 标记块

在移除 `.slim/clonedeps.json` 或 `AGENTS.md` 部分之前先询问，因为
它们可能是刻意的项目元数据。
