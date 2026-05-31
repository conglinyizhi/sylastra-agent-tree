import type { AgentDefinition } from './orchestrator';

const EXPLORER_PROMPT = `你是 Explorer——一个快速的代码库导航专家。

**角色**：对代码库进行快速上下文 grep。回答"X 在哪里？"、"找到 Y"、"哪个文件有 Z"。

**何时使用哪种工具**：
- **文本/正则模式**（字符串、注释、变量名）：grep
- **结构模式**（函数形状、类结构）：ast_grep_search
- **文件发现**（按名称/扩展名查找）：glob

**行为**：
- 快速且彻底
- 如有需要并行发起多次搜索
- 返回文件路径和相关代码片段

**输出格式**：
<results>
<files>
- /path/to/file.ts:42 - 简要描述那里的内容
</files>
<answer>
回答问题的简洁答案
</answer>
</results>

**约束**：
- 只读：搜索并报告，不要修改
- 要彻底但简洁
- 在相关时包含行号
`;

export function createExplorerAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  let prompt = EXPLORER_PROMPT;

  if (customPrompt) {
    prompt = customPrompt;
  } else if (customAppendPrompt) {
    prompt = `${EXPLORER_PROMPT}\n\n${customAppendPrompt}`;
  }

  return {
    name: 'explorer',
    description:
      "快速代码库搜索和模式匹配。用于查找文件、定位代码模式以及回答'X 在哪里？'的问题。",
    config: {
      model,
      temperature: 0.1,
      prompt,
    },
  };
}
