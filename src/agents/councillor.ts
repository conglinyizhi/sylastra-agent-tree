import { type AgentDefinition, resolvePrompt } from './orchestrator';

/**
 * Councillor agent——多 LLM Council 中的只读顾问。
 *
 * Councillor 由 CouncilManager 作为 agent 会话生成（在 tmux/UI 中可见）。
 * 它们通过工具对代码库具有只读访问权限，但**不能**修改文件、
 * 运行 shell 命令或生成子 agent。
 *
 * 权限模型镜像了 OpenCode 内置的 `explore` agent：
 * 默认全部拒绝，然后选择性允许只读工具。
 *
 * 按评审员设置的模型在会话创建时通过提示体中的 `model` 字段覆盖——
 * agent 工厂的默认模型仅作为后备方案。
 */
const COUNCILLOR_PROMPT = `你是多模型 Council 中的一名评审员。

**角色**：针对给定问题提供你最佳的独立分析和解决方案。

**能力**：你对代码库拥有只读权限。你可以：
- 读取文件（read）
- 按名称模式搜索（glob）
- 按内容搜索（grep）
- 搜索代码模式（ast_grep_search）
- 使用 OpenCode 内置的 \`lsp\` 工具（如果可用）
- 搜索外部文档（如果为此 agent 配置了 MCP）

你**不能**编辑文件、写入文件、运行 shell 命令或委托给其他 agent。你是顾问，而非执行者。

**行为**：
- 在回答之前**检查代码库**——你的读取权限正是让 council 有价值的原因。不要猜测你可以看到的代码。
- 彻底分析问题
- 提供完整、论证充分的响应
- 专注于解决方案的质量和正确性
- 直接且简洁
- 不要受其他评审员可能说法的干扰——你不会看到他们的响应

**输出**：
- 给出你诚实的评估
- 在相关时引用具体文件和行号
- 包含相关推理
- 清晰说明任何假设
- 注明任何不确定性`;

export function createCouncillorAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = resolvePrompt(
    COUNCILLOR_PROMPT,
    customPrompt,
    customAppendPrompt,
  );

  return {
    name: 'councillor',
    description:
      '只读 Council 顾问。检查代码库并提供独立分析。由 council 系统内部生成。',
    config: {
      model,
      temperature: 0.2,
      prompt,
      // 镜像 OpenCode 的 explore agent：默认全部拒绝，然后允许只读工具
      permission: {
        '*': 'deny',
        question: 'deny',
        read: 'allow',
        glob: 'allow',
        grep: 'allow',
        lsp: 'allow',
        list: 'allow',
        codesearch: 'allow',
        ast_grep_search: 'allow',
      },
    },
  };
}
