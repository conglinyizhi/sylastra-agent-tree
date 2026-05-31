# Codemap 技能

Codemap 是一个与此仓库绑定的**自定义技能**。

它通过生成结构化的 *codemap* 并随时间追踪变更，帮助代理快速构建对陌生代码库的高质量心智模型。

## 功能

Codemap 专为仓库理解和分层 codemap 生成而设计：

1. 使用 LLM 判断选择相关的代码/配置文件
2. 创建 `.slim/codemap.json` 用于变更追踪
3. 生成 `codemap.md` 模板（每个文件夹一个），供 fixer 类型代理填写
4. 迁移遗留的 `.slim/cartography.json` 状态到 `.slim/codemap.json`

## 使用方法

当自定义技能启用时，`sylastra-agent-tree` 的安装程序会自动安装 Codemap。

### 运行（手动 / 本地）

从仓库根目录（或使用显式的 `--root` 参数）：

```bash
# 初始化映射
node codemap.mjs init --root /repo --include "src/**/*.ts" --exclude "node_modules/**"

# 检查变更
node codemap.mjs changes --root /repo

# 更新哈希
node codemap.mjs update --root /repo
```

## 输出

### `.slim/codemap.json`

一个包含文件/文件夹哈希的变更追踪文件。

### `codemap.md`（每个文件夹）

在每个文件夹中创建的空模板，供 Fixer 类型代理填写：

- 职责
- 设计模式
- 数据/控制流
- 集成点

## 截图

现有截图位于 `img/cartography.png`。

![Codemap 截图](../img/cartography.png)

## 相关内容

- `src/skills/codemap/README.md` 和 `src/skills/codemap/SKILL.md` 包含技能的内部文档。
- 仓库根目录的 `codemap.md` 是一个示例输出/起点。
