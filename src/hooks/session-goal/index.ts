import * as fs from 'node:fs/promises';
import type { PluginInput } from '@opencode-ai/plugin';
import type { PluginConfig } from '../../config';
import {
  extractSummarySection,
  extractTitle,
  resolveExistingInterviewPath,
} from '../../interview/document';
import { createInternalAgentTextPart } from '../../utils';

const COMMAND_NAME = 'goal';
const MAX_GOAL_LENGTH = 4000;

interface GoalState {
  text: string;
  source?: 'manual' | 'interview';
  sourcePath?: string;
  inheritedFrom?: string;
  createdAt: number;
}

interface SystemTransformOutput {
  system: string[];
}

function normalizeGoalText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, MAX_GOAL_LENGTH);
}

function trimGoalText(text: string): string {
  return text.trim().slice(0, MAX_GOAL_LENGTH);
}

function pushText(
  output: { parts: Array<{ type: string; text?: string }> },
  text: string,
) {
  output.parts.push(createInternalAgentTextPart(text));
}

function formatGoal(state: GoalState, inherited: boolean): string {
  const tag = inherited ? 'parent_goal' : 'active_goal';
  const guidance = inherited
    ? '这仅提供上下文。你的委托提示词仍然是那个有边界的任务。'
    : '使用 todos 作为执行账本。确保规划、委托、编辑和验证与此目标保持一致。除非用户更改目标，否则不要扩大范围。';
  return `<${tag}>\n目标：${state.text}\n${guidance}\n</${tag}>`;
}

async function readInterviewGoal(
  directory: string,
  outputFolder: string,
  value: string,
): Promise<{ text: string; sourcePath: string } | null> {
  try {
    const sourcePath = resolveExistingInterviewPath(
      directory,
      outputFolder,
      value,
    );
    if (!sourcePath) return null;

    const content = await fs.readFile(sourcePath, 'utf8');
    const title = extractTitle(content);
    const summary = extractSummarySection(content);
    const text = trimGoalText(
      [title ? `From interview: ${title}` : '', summary]
        .filter(Boolean)
        .join('\n\n'),
    );
    return text ? { text, sourcePath } : null;
  } catch {
    return null;
  }
}

function resolveGoal(
  goals: Map<string, GoalState>,
  sessionID: string,
): { goal: GoalState; inherited: boolean } | null {
  const seen = new Set<string>();
  let currentSessionID = sessionID;
  let inherited = false;

  while (true) {
    if (seen.has(currentSessionID)) {
      goals.delete(sessionID);
      return null;
    }
    seen.add(currentSessionID);

    const goal = goals.get(currentSessionID);
    if (!goal) {
      goals.delete(sessionID);
      return null;
    }

    if (!goal.inheritedFrom) {
      return { goal, inherited };
    }

    inherited = true;
    currentSessionID = goal.inheritedFrom;
  }
}

export function createSessionGoalHook(
  ctx: PluginInput,
  config: PluginConfig,
  options?: { getAgentName?: (sessionID: string) => string | undefined },
): {
  registerCommand: (config: Record<string, unknown>) => void;
  handleCommandExecuteBefore: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ) => Promise<void>;
  handleEvent: (input: {
    event: { type: string; properties?: Record<string, unknown> };
  }) => void;
  handleSystemTransform: (
    input: { sessionID?: string },
    output: SystemTransformOutput,
  ) => void;
  getGoal: (sessionID: string) => GoalState | undefined;
} {
  const goals = new Map<string, GoalState>();
  const outputFolder = config.interview?.outputFolder ?? 'interview';

  return {
    registerCommand: (opencodeConfig) => {
      const commandConfig = opencodeConfig.command as
        | Record<string, unknown>
        | undefined;
      if (commandConfig?.[COMMAND_NAME]) return;
      if (!opencodeConfig.command) opencodeConfig.command = {};
      (opencodeConfig.command as Record<string, unknown>)[COMMAND_NAME] = {
        template: '设置或显示当前会话目标',
        description: '设定一个会话目标，使 todos、委托和验证保持对齐',
      };
    },

    handleCommandExecuteBefore: async (input, output) => {
      if (input.command !== COMMAND_NAME) return;

      output.parts.length = 0;

      const args = input.arguments.trim();
      if (!args) {
        const resolved = resolveGoal(goals, input.sessionID);
        pushText(
          output,
          resolved
            ? `当前目标：\n${resolved.goal.text}\n\n使用 todos 作为执行步骤。自动继续仅在仍有 todos 时持续。`
            : '没有活跃目标。使用 /goal <目标> 设置一个。',
        );
        return;
      }

      if (args === 'clear') {
        goals.delete(input.sessionID);
        pushText(output, '已清除此会话的活跃目标。');
        return;
      }

      if (args.startsWith('from ')) {
        const value = args.slice('from '.length).trim();
        const interviewGoal = await readInterviewGoal(
          ctx.directory,
          outputFolder,
          value,
        );
        if (!interviewGoal) {
          pushText(output, `无法为 "${value}" 找到可读的面试规格。`);
          return;
        }
        goals.set(input.sessionID, {
          text: interviewGoal.text,
          source: 'interview',
          sourcePath: interviewGoal.sourcePath,
          createdAt: Date.now(),
        });
        pushText(output, `已从面试中设置活跃目标：\n${interviewGoal.text}`);
        return;
      }

      const text = normalizeGoalText(args);
      goals.set(input.sessionID, {
        text,
        source: 'manual',
        createdAt: Date.now(),
      });
      pushText(output, `已设置活跃目标：\n${text}`);
    },

    handleEvent: (input) => {
      const event = input.event;
      if (event.type === 'session.created') {
        const info = event.properties?.info as
          | { id?: string; parentID?: string }
          | undefined;
        if (!info?.id || !info.parentID) return;
        const parentGoal = goals.get(info.parentID);
        if (!parentGoal) return;
        goals.set(info.id, {
          inheritedFrom: info.parentID,
          createdAt: Date.now(),
          text: '',
        });
        return;
      }

      if (event.type === 'session.deleted') {
        const props = event.properties as
          | { info?: { id?: string }; sessionID?: string }
          | undefined;
        const sessionID = props?.info?.id ?? props?.sessionID;
        if (sessionID) goals.delete(sessionID);
      }
    },

    handleSystemTransform: (input, output) => {
      if (!input.sessionID) return;
      const resolved = resolveGoal(goals, input.sessionID);
      if (!resolved) return;

      const agentName = options?.getAgentName?.(input.sessionID);
      const { goal, inherited } = resolved;
      if (!inherited && agentName && agentName !== 'orchestrator') return;

      const block = formatGoal(goal, inherited);
      if (output.system.some((entry) => entry.includes(block))) return;
      output.system.push(block);
    },

    getGoal: (sessionID) => resolveGoal(goals, sessionID)?.goal,
  };
}
