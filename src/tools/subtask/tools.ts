/**
 * Tool definitions for subtask functionality.
 *
 * Factory functions that create tool definitions with injected dependencies:
 * - createSubtaskTool: Create a new session with subtask prompt
 * - createReadSessionTool: Read conversation transcript from a session
 */

import type { PluginInput, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { extractSessionResult, promptWithTimeout } from '../../utils/session';
import type { SubagentDepthTracker } from '../../utils/subagent-depth';
import {
  buildSyntheticFileParts,
  cleanFileReference,
  parseFileReferences,
} from './files';
import type { SubtaskState } from './state';

export type OpencodeClient = PluginInput['client'];
export const DEFAULT_SUBTASK_TIMEOUT_MS = 5 * 60 * 1000;
const SUBTASK_SUMMARY_TAG_REGEX = /<\/?subtask_summary>/g;

export interface CreateSubtaskToolOptions {
  /** Worker timeout in ms. 0 disables the timeout. */
  timeoutMs?: number;
}

function normalizeSubtaskSummary(text: string): string {
  return text.replace(SUBTASK_SUMMARY_TAG_REGEX, '').trim();
}

function getAbortSignal(context: unknown): AbortSignal | undefined {
  if (!context || typeof context !== 'object' || !('abort' in context)) {
    return undefined;
  }

  const signal = (context as { abort?: unknown }).abort;
  return signal &&
    typeof signal === 'object' &&
    'addEventListener' in signal &&
    'removeEventListener' in signal &&
    'aborted' in signal
    ? (signal as AbortSignal)
    : undefined;
}

/**
 * Create the subtask tool.
 *
 * Takes the OpenCode client as a dependency for TUI and session operations.
 */
export function createSubtaskTool(
  ctx: PluginInput,
  state: SubtaskState,
  depthTracker?: SubagentDepthTracker,
  options: CreateSubtaskToolOptions = {},
): ToolDefinition {
  const client = ctx.client;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SUBTASK_TIMEOUT_MS;

  return tool({
    description: '运行一个子工作会话，并将其完成摘要返回给调用方',
    args: {
      prompt: tool.schema.string().describe('生成的子任务提示词'),
      files: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe('要加载到新会话上下文中的文件路径数组'),
    },
    async execute(args, context) {
      const directory =
        context &&
        typeof context === 'object' &&
        'directory' in context &&
        typeof (context as { directory?: unknown }).directory === 'string'
          ? (context as { directory: string }).directory
          : ctx.directory;
      const sessionID =
        context && typeof context === 'object' && 'sessionID' in context
          ? (context as { sessionID: string }).sessionID
          : 'unknown';
      const abortSignal = getAbortSignal(context);
      if (state.isSubtaskSession(sessionID)) {
        return '嵌套子任务已禁用：此会话已经是子任务工作器。请完成此工作器，将其摘要返回给父会话。';
      }
      if (
        sessionID !== 'unknown' &&
        depthTracker &&
        depthTracker.getDepth(sessionID) + 1 > depthTracker.maxDepth
      ) {
        return `子任务工作器被阻止：将超过最大子 agent 深度 ${depthTracker.maxDepth}。`;
      }

      const sessionReference = `你是一个由父会话 ${sessionID} 生成的子任务工作器。

你的工作是有边界的：仅完成以下任务。不要扩大范围。
如果缺少必要的上下文，请使用 read_session 查看父会话。
不要生成另一个子任务。`;
      const files = new Set([
        ...parseFileReferences(args.prompt),
        ...(args.files ?? []).map(cleanFileReference),
      ]);
      const fileRefs =
        files.size > 0 ? [...files].map((f) => `@${f}`).join(' ') : '';
      const fullPrompt = fileRefs
        ? `${sessionReference}\n\nTASK:\n${args.prompt}\n\nFILES PROVIDED:\n${fileRefs}`
        : `${sessionReference}\n\nTASK:\n${args.prompt}`;

      let childSessionID: string | undefined;
      try {
        const session = await client.session.create({
          responseStyle: 'data',
          throwOnError: true,
          query: { directory },
          body: {
            parentID: sessionID === 'unknown' ? undefined : sessionID,
            title: `Subtask worker from ${sessionID}`,
          },
        });

        childSessionID =
          (session as { data?: { id?: string }; id?: string })?.data?.id ??
          (session as { data?: { id?: string }; id?: string })?.id;
        if (!childSessionID) {
          throw new Error('Subtask worker session did not return an id');
        }
        if (sessionID !== 'unknown' && depthTracker) {
          const registered = depthTracker.registerChild(
            sessionID,
            childSessionID,
          );
          if (!registered) {
            throw new Error(
              'Subtask worker blocked: max subagent depth exceeded',
            );
          }
        }
        state.markSession(childSessionID, sessionID);

        await promptWithTimeout(
          client,
          {
            responseStyle: 'data',
            throwOnError: true,
            query: { directory },
            path: { id: childSessionID },
            body: {
              agent: 'orchestrator',
              parts: [
                {
                  type: 'text',
                  text: `${fullPrompt}\n\n说明：\n1. 理解任务和相关文件上下文。\n2. 仅进行必要的更改。\n3. 在可行时运行最相关的验证检查。\n4. 请求的任务完成后停止。\n\n以以下格式返回最终响应：\n\n<subtask_summary>\n状态：completed（已完成） | blocked（受阻） | partial（部分完成）\n\n变更内容：\n- ...\n\n涉及文件：\n- ...\n\n验证结果：\n- ...\n\n风险/后续事项：\n- ...\n</subtask_summary>`,
                },
                ...(await buildSyntheticFileParts(directory, files)),
              ],
            },
          },
          timeoutMs,
          abortSignal,
        );

        const extraction = await extractSessionResult(client, childSessionID, {
          directory,
          includeReasoning: false,
        });
        if (extraction.empty) {
          throw new Error('子任务工作器未返回摘要');
        }
        const summary = normalizeSubtaskSummary(extraction.text);

        return [
          `task_id: ${childSessionID}`,
          '',
          '<subtask_summary>',
          summary,
          '</subtask_summary>',
        ].join('\n');
      } finally {
        if (childSessionID) {
          try {
            await client.session.abort({
              path: { id: childSessionID },
              query: { directory },
            });
            state.unmarkSession(childSessionID);
          } catch {
            // Keep the subtask marker if abort fails; session.deleted cleanup
            // will remove it when OpenCode eventually deletes the session.
          }
        }
      }
    },
  });
}

/**
 * Format a conversation transcript for display.
 *
 * @param messages - Array of messages from session.messages()
 * @param limit - Optional limit to indicate if results are truncated
 * @returns Formatted transcript with user/assistant sections
 */
function formatTranscript(
  messages: Array<{ info: { role?: string }; parts: unknown[] }>,
  limit?: number,
): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.info?.role;
    const parts = msg.parts as Array<{
      type: string;
      text?: string;
      ignored?: boolean;
      filename?: string;
      tool?: string;
      state?: { status: string; title?: string };
    }>;

    if (role === 'user') {
      lines.push('## 用户');
      for (const part of parts) {
        if (
          part.type === 'text' &&
          !part.ignored &&
          typeof part.text === 'string'
        ) {
          lines.push(part.text);
        }
        if (part.type === 'file') {
          lines.push(`[已附加：${part.filename || 'file'}]`);
        }
      }
      lines.push('');
    }

    if (role === 'assistant') {
      lines.push('## 助手');
      for (const part of parts) {
        if (part.type === 'text' && typeof part.text === 'string') {
          lines.push(part.text);
        }
        if (
          part.type === 'tool' &&
          part.state?.status === 'completed' &&
          part.tool
        ) {
          lines.push(`[工具：${part.tool}] ${part.state.title ?? ''}`);
        }
      }
      lines.push('');
    }
  }

  const output = lines.join('\n').trim();

  if (messages.length >= (limit ?? 100)) {
    return (
      output +
      `\n\n（显示最近的 ${messages.length} 条消息。使用更大的 'limit' 值查看更多内容。）`
    );
  }

  return `${output}\n\n（会话结束 - 共 ${messages.length} 条消息）`;
}

/**
 * Create the read_session tool.
 *
 * Takes the OpenCode client as a dependency for session.messages() calls.
 */
export function createReadSessionTool(
  client: OpencodeClient,
  state: SubtaskState,
): ToolDefinition {
  return tool({
    description:
      '读取之前会话的对话记录。当来自源会话的特定信息未包含在子任务摘要中时使用。',
    args: {
      sessionID: tool.schema
        .string()
        .describe('完整的会话 ID（例如 sess_01jxyz...）'),
      limit: tool.schema
        .number()
        .optional()
        .describe('读取的最大消息数（默认为 100，最大 500）'),
    },
    async execute(args, context) {
      const limit = Math.min(args.limit ?? 100, 500);
      const directory =
        context &&
        typeof context === 'object' &&
        'directory' in context &&
        typeof (context as { directory?: unknown }).directory === 'string'
          ? (context as { directory: string }).directory
          : undefined;
      const callerSessionID =
        context && typeof context === 'object' && 'sessionID' in context
          ? (context as { sessionID?: string }).sessionID
          : undefined;
      if (!callerSessionID || !state.isSubtaskSession(callerSessionID)) {
        return 'read_session 仅在子任务工作器会话中可用。';
      }
      if (state.sourceFor(callerSessionID) !== args.sessionID) {
        return 'read_session 只能读取此子任务工作器的源会话。';
      }

      try {
        const response = (await client.session.messages({
          path: { id: args.sessionID },
          query: { limit, ...(directory ? { directory } : {}) },
        })) as { data?: Array<{ info: { role?: string }; parts: unknown[] }> };

        if (!response.data || response.data.length === 0) {
          return '会话没有消息或不存在。';
        }

        return formatTranscript(response.data, limit);
      } catch (error) {
        return `无法读取会话 ${args.sessionID}：${error instanceof Error ? error.message : '未知错误'}`;
      }
    },
  });
}
