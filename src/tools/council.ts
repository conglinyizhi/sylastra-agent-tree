import {
  type PluginInput,
  type ToolDefinition,
  tool,
} from '@opencode-ai/plugin';
import type { CouncilManager } from '../council/council-manager';
import { shortModelLabel } from '../utils/session';

const z = tool.schema;

/**
 * Formats the model composition string for the council footer.
 * Shows short model labels per councillor: "α: gpt-5.4-mini, β: gemini-3-pro"
 */
function formatModelComposition(
  councillorResults: Array<{ name: string; model: string }>,
): string {
  return councillorResults
    .map((cr) => {
      const shortModel = shortModelLabel(cr.model);
      return `${cr.name}: ${shortModel}`;
    })
    .join(', ');
}

/**
 * Creates the council_session tool for multi-LLM orchestration.
 *
 * This tool triggers a full council session: parallel councillors →
 * formatted results returned to the council agent for synthesis.
 * Available to the council agent.
 */
export function createCouncilTool(
  _ctx: PluginInput,
  councilManager: CouncilManager,
): Record<string, ToolDefinition> {
  const council_session = tool({
    description: `启动一个多 LLM 委员会会话，进行基于共识的分析。

将提示词并行发送给多个模型（ councillor ），并返回它们的格式化响应供你综合。

返回 councillor 响应及摘要页脚。`,
    args: {
      prompt: z.string().describe('发送给所有 councillor 的提示词'),
      preset: z
        .string()
        .optional()
        .describe(
          '要使用的委员会预设（默认值："default"）。必须与委员会配置中的某个预设匹配。',
        ),
    },
    async execute(args, toolContext) {
      if (
        !toolContext ||
        typeof toolContext !== 'object' ||
        !('sessionID' in toolContext)
      ) {
        throw new Error('无效的 toolContext：缺少 sessionID');
      }

      // Guard: Only the council agent can invoke council sessions.
      // If agent is missing from context, allow through (backward compatible).
      const allowedAgents = ['council'];
      const callingAgent = (toolContext as { agent?: string }).agent;
      if (callingAgent && !allowedAgents.includes(callingAgent)) {
        throw new Error(
          `委员会会话只能由委员会 agent 调用。当前 agent：${callingAgent}`,
        );
      }

      const prompt = String(args.prompt);
      const preset = typeof args.preset === 'string' ? args.preset : undefined;
      const parentSessionId = (toolContext as { sessionID: string }).sessionID;

      const result = await councilManager.runCouncil(
        prompt,
        preset,
        parentSessionId,
      );

      if (!result.success) {
        return `Council session failed: ${result.error}`;
      }

      let output = result.result ?? '(No output)';

      // Append councillor summary for transparency
      const completed = result.councillorResults.filter(
        (cr) => cr.status === 'completed',
      ).length;
      const total = result.councillorResults.length;
      const composition = formatModelComposition(result.councillorResults);

      output += `\n\n---\n*Council: ${completed}/${total} councillors responded (${composition})*`;

      // Warn about deprecated config fields if detected
      const deprecated = councilManager.getDeprecatedFields();
      if (deprecated && deprecated.length > 0) {
        const legacyMasterModel = councilManager.getLegacyMasterModel();
        const hasMaster = deprecated.includes('master');
        const trulyIgnored =
          hasMaster && !legacyMasterModel
            ? deprecated // master has no model → treat as ignored too
            : deprecated.filter((f) => f !== 'master');
        const parts: string[] = [];
        if (hasMaster && legacyMasterModel) {
          parts.push(
            `\`council.master\` is deprecated and will be removed in a future version. Its \`model\` is currently used as a fallback for the council agent — add a \`council\` entry to your preset to make this explicit.`,
          );
        }
        if (trulyIgnored.length > 0) {
          parts.push(
            `${trulyIgnored.map((f) => `\`council.${f}\``).join(', ')} ${
              trulyIgnored.length === 1 ? 'is' : 'are'
            } deprecated and ignored — remove ${
              trulyIgnored.length === 1 ? 'it' : 'them'
            } from your config.`,
          );
        }
        output += `\n⚠ Config warning: ${parts.join(' ')}`;
      }

      return output;
    },
  });

  return { council_session };
}
