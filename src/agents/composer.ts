import { shortModelLabel } from '../utils/session';
import { type AgentDefinition, resolvePrompt } from './orchestrator';

// 注意：评审员（Councillor）的系统提示位于 councillor agent 工厂中。
// 下面的格式化函数仅组织 USER 消息内容——agent 工厂提供系统提示。

const COUNCIL_AGENT_PROMPT = `思考内容以简体中文为主，你可以偶尔夹杂一些专有技术名词或者函数但主题需要简体中文优先

<instruction name="todo_hygiene">
If the active task changed or finished, update the todo list to match the current work state.
</instruction>

你是 Composer agent——一个多 LLM 编排系统，用于在多个模型之间运行共识。

**工具**：你可以使用 \`council_session\` 工具。

**何时使用**：
- 当用户通过请求调用时
- 当你希望就复杂问题获得多个专家意见时
- 当需要通过模型共识获得更高可信度时

**用法**：
1. 使用用户提示调用 \`council_session\` 工具
2. 可选地指定预设（默认："default"）
3. 接收格式化后的评审员响应以进行综合
4. 遵循下面的综合流程
5. 向用户呈现结果

**综合流程**（强制——按顺序执行）：
1. 阅读原始用户提示
2. 逐一审查每位评审员的响应——按名称记录每位评审员的关键见解和独特贡献
3. 识别评审员之间的一致意见和分歧
4. 通过明确推理解决分歧
5. 综合出最佳最终答案
6. 按照下面的所需输出格式格式化输出

**行为**：
- 直接将请求委托给 council_session
- 在调用 council_session 之前不要预先分析或过滤提示
- 使用评审员的姓名标明其具体见解
- 如果评审员存在分歧，解释为何选择一种方案而非另一种
- 不要在最终回复中省略每位评审员的详细信息
- 不要将输出仅压缩为一个最终摘要
- 当不同方案各有合理利弊时，应透明地说明权衡
- 不要仅仅取平均——选择最佳方案并加以改进

**所需输出格式**：
始终在最终回复中包含以下部分：

## Composer 响应
提供最佳综合答案。整合评审员的最强观点，解决分歧，为用户提供清晰的最终建议或答案。包含相关代码示例和具体细节。

## 评审员详情
单独包含每位评审员的响应。

使用工具结果中提供的每位评审员的确切名称。

每位评审员的格式如下：

### <评审员名称>
<该评审员的响应>

如果某位评审员失败或超时，简要说明状态。

## Composer 总结
总结评审员的一致之处、分歧之处、为何选择最终答案，以及任何剩余的不确定性。包含共识置信度评级：一致、多数或分裂。`;

export function createComposerAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = resolvePrompt(
    COUNCIL_AGENT_PROMPT,
    customPrompt,
    customAppendPrompt,
  );

  const definition: AgentDefinition = {
    name: 'composer',
    description: '多 LLM 合成代理，综合多个模型的响应以生成更高质量的输出',
    config: {
      temperature: 0.1,
      prompt,
    },
  };

  // Composer 的模型来自配置覆盖或运行时解析；
  // 仅在提供非空字符串时设置。
  if (model) {
    definition.config.model = model;
  }

  return definition;
}

/**
 * 构建特定评审员会话的提示。
 *
 * 返回原始用户提示——agent 工厂（councillor.ts）提供
 * 包含工具感知指令的系统提示。无重复内容。
 *
 * 如果提供了按评审员设置的提示覆盖，它会作为
 * 角色/指导上下文预先附加到用户问题之前。
 */
export function formatCouncillorPrompt(
  userPrompt: string,
  councillorPrompt?: string,
): string {
  if (!councillorPrompt) return userPrompt;
  return `${councillorPrompt}\n\n---\n\n${userPrompt}`;
}

/**
 * 格式化评审员结果供 composer agent 进行综合。
 *
 * 将评审员结果格式化为结构化数据，composer agent
 *（调用该工具的 agent）将作为工具响应接收。
 * composer agent 的系统提示包含综合指令。
 * 当所有评审员均未产生输出时返回特殊消息。
 */
export function formatCouncillorResults(
  originalPrompt: string,
  councillorResults: Array<{
    name: string;
    model: string;
    status: string;
    result?: string;
    error?: string;
  }>,
): string {
  const completedWithResults = councillorResults.filter(
    (cr) => cr.status === 'completed' && cr.result,
  );

  const councillorSection = completedWithResults
    .map((cr) => {
      const shortModel = shortModelLabel(cr.model);
      return `**${cr.name}** (${shortModel}):\n${cr.result}`;
    })
    .join('\n\n');

  const failedSection = councillorResults
    .filter((cr) => cr.status !== 'completed')
    .map((cr) => `**${cr.name}**: ${cr.status} — ${cr.error ?? 'Unknown'}`)
    .join('\n');

  // 防御性保护：调用方（runCouncil）在所有评审员失败时会短路处理，
  // 但此函数可能在其它上下文中重用。
  if (completedWithResults.length === 0) {
    const errorDetails = councillorResults
      .map(
        (cr) =>
          `**${cr.name}** (${shortModelLabel(cr.model)}): ${cr.status} — ${
            cr.error ?? 'Unknown'
          }`,
      )
      .join('\n');

    return `---\n\n**原始提示**:\n${originalPrompt}\n\n---\n\n**评审员响应**:\n所有评审员均未产生输出：\n${errorDetails}\n\n请仅根据原始提示生成响应。`;
  }

  let prompt = `---\n\n**原始提示**:\n${originalPrompt}\n\n---\n\n**评审员响应**:\n${councillorSection}`;

  if (failedSection) {
    prompt += `\n\n---\n\n**失败/超时的评审员**:\n${failedSection}`;
  }

  prompt +=
    '\n\n---\n\n在生成输出之前，你必须遵循综合流程的步骤：逐一审查每位评审员的响应，然后生成所需的输出，包括综合后的 Composer 响应、使用确切名称的每位评审员详情，以及带有共识置信度评级（一致、多数或分裂）的 Composer 总结。';

  return prompt;
}
