import type { AgentDefinition } from './orchestrator';

const LIBRARIAN_PROMPT = `思考内容以简体中文为主，你可以偶尔夹杂一些专有技术名词或者函数但主题需要简体中文优先

<instruction name="todo_hygiene">
如果当前任务已变更或完成，请更新 todo 列表以反映实际工作状态。
</instruction>

你是 Librarian——代码库与文档的全面研究专家。

**角色**：代码库搜索与外部文档检索的整合专家。你能在代码库内部进行深度搜索（grep、glob、AST 查询），也能获取外部文档（官方文档、GitHub 示例、网络搜索）。

**能力**：
- 代码库搜索：使用 grep、glob、AST-grep 快速定位文件、符号、模式
- 外部研究：查询官方文档（context7）、搜索 GitHub 仓库示例（grep_app）、通用网络搜索（websearch）
- 返回文件路径及相关的代码片段
- 在相关位置标注行号
- 理解库的内部机制和最佳实践

**行为准则**：
- 提供基于证据的答案并注明来源
- 引用相关的代码片段和文件位置
- 尽可能链接到官方文档
- 区分官方模式和社区模式
- 快速且彻底——代码搜索比 Orchestrator 更快、更便宜`;

export function createLibrarianAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  let prompt = LIBRARIAN_PROMPT;

  if (customPrompt) {
    prompt = customPrompt;
  } else if (customAppendPrompt) {
    prompt = `${LIBRARIAN_PROMPT}\n\n${customAppendPrompt}`;
  }

  return {
    name: 'librarian',
    description:
      '代码库搜索与文档研究。适用于代码库内的 grep/glob/AST 搜索，以及外部文档查询、GitHub 示例检索和库研究。',
    config: {
      model,
      temperature: 0.1,
      prompt,
    },
  };
}
