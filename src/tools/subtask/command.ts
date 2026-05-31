/**
 * Command registration manager for subtask functionality.
 *
 * Manages the /subtask slash command registration and the SUBTASK_COMMAND
 * template that guides the AI in generating subtask prompts.
 */

import type { PluginInput } from '@opencode-ai/plugin';
import type { SubtaskState } from './state';

const COMMAND_NAME = 'subtask';

/**
 * The subtask command template that guides the AI in generating subtask
 * prompts.
 */
const SUBTASK_COMMAND_TEMPLATE = `启动一个聚焦的子任务工作器。

以下用户的请求是该工作器的全部范围。不要扩大范围。
创建一个自包含的工作器提示词，包括：
- 精确的目标
- 来自此会话的相关上下文
- 相关的具体文件/路径
- 预期交付物
- 工作器应运行的验证（如适用）

用户请求：
$ARGUMENTS

然后调用 subtask 工具：
\`subtask(prompt="...", files=["src/foo.ts", "docs/bar.md"])\`

仅包含明确相关的文件。如果不需要文件，则省略 files 参数。`;

/**
 * Creates a subtask command manager.
 *
 * Handles registration of the /subtask command and processing of chat
 * messages to inject synthetic file parts for subtask sessions.
 */
export function createSubtaskCommandManager(
  _ctx: PluginInput,
  state: SubtaskState,
) {
  /**
   * Register the /subtask command in the OpenCode config.
   */
  function registerCommand(opencodeConfig: Record<string, unknown>): void {
    const configCommand = opencodeConfig.command as
      | Record<string, unknown>
      | undefined;
    if (!configCommand?.[COMMAND_NAME]) {
      if (!opencodeConfig.command) {
        opencodeConfig.command = {};
      }
      (opencodeConfig.command as Record<string, unknown>)[COMMAND_NAME] = {
        description: '为新的会话创建一个聚焦的子任务提示词',
        template: SUBTASK_COMMAND_TEMPLATE,
      };
    }
  }

  return {
    registerCommand,
    handleEvent(input: {
      event: {
        type: string;
        properties?: {
          info?: { id?: string; parentID?: string };
          sessionID?: string;
        };
      };
    }): void {
      if (input.event.type === 'session.created') {
        const info = input.event.properties?.info;
        if (!info?.id || !info.parentID) return;

        const source = state.sourceFor(info.parentID);
        if (source) state.markSession(info.id, source);
        return;
      }

      if (input.event.type !== 'session.deleted') return;
      const sessionID =
        input.event.properties?.info?.id ?? input.event.properties?.sessionID;
      if (sessionID) state.unmarkSession(sessionID);
    },
  };
}

export type SubtaskCommandManager = ReturnType<
  typeof createSubtaskCommandManager
>;
