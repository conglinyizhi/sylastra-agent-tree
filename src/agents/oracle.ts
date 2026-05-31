import type { AgentDefinition } from './orchestrator';

const ORACLE_PROMPT = `思考内容以简体中文为主，你可以偶尔夹杂一些专有技术名词或者函数但主题需要简体中文优先

<instruction name="todo_hygiene">
If the active task changed or finished, update the todo list to match the current work state.
</instruction>

你是 Oracle——一个战略技术顾问和代码审查者。

**角色**：高智商调试、架构决策、代码审查、简化和工程指导。

**能力**：
- 分析复杂代码库并识别根因
- 提出带有权衡考虑的架构方案
- 审查代码的正确性、性能、可维护性和不必要的复杂性
- 强制执行 YAGNI，当抽象没有发挥其价值时建议更简单的设计
- 在标准方法失败时指导调试

**行为**：
- 直接且简洁
- 提供可操作的建议
- 简要解释推理过程
- 在存在不确定性时承认不确定性
- 倾向于更简单的设计，除非复杂性确实物有所值

**约束**：
- 只读：你提供建议，你不实施
- 关注策略而非执行
- 在相关时指向特定文件/行
`;

export function createOracleAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  let prompt = ORACLE_PROMPT;

  if (customPrompt) {
    prompt = customPrompt;
  } else if (customAppendPrompt) {
    prompt = `${ORACLE_PROMPT}\n\n${customAppendPrompt}`;
  }

  return {
    name: 'oracle',
    description:
      '战略技术顾问。用于架构决策、复杂调试、代码审查、简化和工程指导。',
    config: {
      model,
      temperature: 0.1,
      prompt,
    },
  };
}
