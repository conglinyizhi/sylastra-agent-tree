import { buildOrchestratorPrompt } from '../agents/orchestrator';
import { processImageAttachments } from '../hooks/image-hook';
import { recordTuiAgentModel } from '../tui-state';
import { resolveRuntimeAgentName } from '../utils';
import { log } from '../utils/logger';
import { collapseSystemInPlace } from '../utils/system-collapse';
import type { PluginContext } from './context';

/**
 * Build the event(), tool.*, command.*, and chat.* hook handlers.
 */
export function createEventHandlers(ctx: PluginContext) {
  const {
    config,
    sessionAgentMap,
    depthTracker,
    multiplexerSessionManager,
    foregroundFallback,
    todoContinuationHook,
    sessionGoalHook,
    autoUpdateChecker,
    interviewManager,
    taskSessionManagerHook,
    subtaskCommandManager,
    divoomManager,
    applyPatchHook,
    presetManager,
    chatHeadersHook,
    agentDefs,
    disabledAgents,
    rewriteDisplayNameMentions,
    postFileToolNudgeHook,
    delegateTaskRetryHook,
    jsonErrorRecoveryHook,
    phaseReminderHook,
    filterAvailableSkillsHook,
  } = ctx;

  return {
    // ── event() ───────────────────────────────────────────────────────
    event: async (input: {
      event: { type: string; properties?: Record<string, unknown> };
    }) => {
      const event = input.event as {
        type: string;
        properties?: {
          info?: {
            id?: string;
            parentID?: string;
            title?: string;
            agent?: string;
            providerID?: string;
            modelID?: string;
            sessionID?: string;
          };
          sessionID?: string;
          id?: string;
          requestID?: string;
          status?: { type: string };
        };
      };

      if (event.type === 'message.updated') {
        const info = event.properties?.info;
        if (
          typeof info?.agent === 'string' &&
          typeof info.providerID === 'string' &&
          typeof info.modelID === 'string'
        ) {
          recordTuiAgentModel({
            agentName: resolveRuntimeAgentName(config, info.agent),
            model: `${info.providerID}/${info.modelID}`,
          });
        }
      }

      if (event.type === 'session.created') {
        const childSessionId = event.properties?.info?.id;
        const parentSessionId = event.properties?.info?.parentID;
        if (depthTracker && childSessionId && parentSessionId) {
          depthTracker.registerChild(parentSessionId, childSessionId);
        }
      }

      await multiplexerSessionManager.onSessionCreated(event);
      await multiplexerSessionManager.onSessionStatus(event);
      await multiplexerSessionManager.onSessionDeleted(event);
      await foregroundFallback.handleEvent(input.event);
      await todoContinuationHook.handleEvent(input);
      sessionGoalHook.handleEvent(
        input as {
          event: { type: string; properties?: Record<string, unknown> };
        },
      );
      await autoUpdateChecker.event(input);
      await interviewManager.handleEvent(
        input as {
          event: { type: string; properties?: Record<string, unknown> };
        },
      );
      await taskSessionManagerHook.event(
        input as {
          event: {
            type: string;
            properties?: { info?: { id?: string }; sessionID?: string };
          };
        },
      );
      subtaskCommandManager.handleEvent(
        input as {
          event: {
            type: string;
            properties?: {
              info?: { id?: string; parentID?: string };
              sessionID?: string;
            };
          };
        },
      );

      if (
        event.type === 'permission.asked' ||
        event.type === 'question.asked'
      ) {
        const props = event.properties as
          | { sessionID?: string; id?: string; requestID?: string }
          | undefined;
        divoomManager.onUserInputRequired({
          sessionId: props?.sessionID,
          requestId: props?.id ?? props?.requestID,
        });
      }

      if (
        event.type === 'permission.replied' ||
        event.type === 'question.replied' ||
        event.type === 'question.rejected'
      ) {
        const props = event.properties as
          | { sessionID?: string; requestID?: string; id?: string }
          | undefined;
        divoomManager.onUserInputResolved({
          sessionId: props?.sessionID,
          requestId: props?.requestID ?? props?.id,
        });
      }

      if (input.event.type === 'session.status') {
        const props = input.event.properties as
          | { sessionID?: string; status?: { type?: string } }
          | undefined;
        const sessionID = props?.sessionID;
        divoomManager.onOrchestratorStatus({
          sessionId: sessionID,
          status: props?.status?.type,
          isOrchestrator: sessionID
            ? sessionAgentMap.get(sessionID) === 'orchestrator'
            : false,
        });
      }

      if (input.event.type === 'session.deleted') {
        const props = input.event.properties as
          | { info?: { id?: string }; sessionID?: string }
          | undefined;
        const sessionID = props?.info?.id ?? props?.sessionID;
        divoomManager.onSessionDeleted({
          sessionId: sessionID,
          isOrchestrator: sessionID
            ? sessionAgentMap.get(sessionID) === 'orchestrator'
            : false,
        });
      }

      if (input.event.type === 'session.deleted') {
        const props = input.event.properties as
          | { info?: { id?: string }; sessionID?: string }
          | undefined;
        const sessionID = props?.info?.id ?? props?.sessionID;

        if (depthTracker && sessionID) {
          depthTracker.cleanup(sessionID);
        }
        if (sessionID) {
          sessionAgentMap.delete(sessionID);
        }
      }
    },

    // ── tool.execute.before ───────────────────────────────────────────
    'tool.execute.before': async (
      input: Record<string, unknown>,
      output: Record<string, unknown>,
    ) => {
      await applyPatchHook['tool.execute.before'](
        input as {
          tool: string;
          directory?: string;
        },
        output as {
          args?: { patchText?: unknown; [key: string]: unknown };
        },
      );

      await taskSessionManagerHook['tool.execute.before'](
        input as {
          tool: string;
          sessionID?: string;
          callID?: string;
        },
        output as { args?: unknown },
      );

      if ((input.tool as string)?.toLowerCase() === 'task') {
        divoomManager.onTaskStart({
          parentSessionId: input.sessionID as string,
          callId: input.callID as string,
          args: output.args,
        });
      }
    },

    // ── command.execute.before ────────────────────────────────────────
    'command.execute.before': async (
      input: Record<string, unknown>,
      output: Record<string, unknown>,
    ) => {
      await todoContinuationHook.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );

      await interviewManager.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );

      await presetManager.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );

      await sessionGoalHook.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );
    },

    // ── chat.headers ──────────────────────────────────────────────────
    'chat.headers': chatHeadersHook['chat.headers'],

    // ── chat.message ──────────────────────────────────────────────────
    'chat.message': async (
      input: { sessionID: string; agent?: string },
      output?: { message?: { agent?: string } },
    ) => {
      const rawAgent = input.agent ?? output?.message?.agent;
      const agent = rawAgent
        ? resolveRuntimeAgentName(config, rawAgent)
        : undefined;

      if (
        agent &&
        output?.message &&
        typeof output.message.agent === 'string'
      ) {
        output.message.agent = agent;
      }

      if (agent) {
        sessionAgentMap.set(input.sessionID, agent);
      }
      todoContinuationHook.handleChatMessage({
        sessionID: input.sessionID,
        agent,
      });
    },

    // ── experimental.chat.system.transform ────────────────────────────
    'experimental.chat.system.transform': async (
      input: { sessionID?: string },
      output: { system: string[] },
    ): Promise<void> => {
      const agentName = input.sessionID
        ? sessionAgentMap.get(input.sessionID)
        : undefined;
      if (agentName === 'orchestrator') {
        const alreadyInjected = output.system.some(
          (s) =>
            typeof s === 'string' &&
            s.includes('<Role>') &&
            s.includes('orchestrator'),
        );
        if (!alreadyInjected) {
          const orchestratorDef = agentDefs.find(
            (a) => a.name === 'orchestrator',
          );
          const orchestratorPrompt =
            typeof orchestratorDef?.config?.prompt === 'string'
              ? orchestratorDef.config.prompt
              : buildOrchestratorPrompt(disabledAgents);
          output.system[0] =
            orchestratorPrompt +
            (output.system[0] ? `\n\n${output.system[0]}` : '');
        }
      }

      sessionGoalHook.handleSystemTransform(input, output);
      collapseSystemInPlace(output.system);
    },

    // ── experimental.chat.messages.transform ──────────────────────────
    'experimental.chat.messages.transform': async (
      input: Record<string, never>,
      output: { messages: unknown[] },
    ): Promise<void> => {
      const typedOutput = output as {
        messages: Array<{
          info: { role: string; agent?: string; sessionID?: string };
          parts: Array<{
            type: string;
            text?: string;
            [key: string]: unknown;
          }>;
        }>;
      };

      for (const message of typedOutput.messages) {
        if (message.info.role !== 'user') continue;
        for (const part of message.parts) {
          if (part.type !== 'text' || typeof part.text !== 'string') continue;
          part.text = rewriteDisplayNameMentions(part.text);
        }
      }

      processImageAttachments({
        messages: typedOutput.messages,
        workDir: (input as { workDir?: string }).workDir ?? '',
        disabledAgents,
        log,
      });

      await todoContinuationHook.handleMessagesTransform({
        messages: typedOutput.messages,
      });
      await taskSessionManagerHook['experimental.chat.messages.transform'](
        input,
        typedOutput,
      );
      await phaseReminderHook['experimental.chat.messages.transform'](
        input,
        typedOutput,
      );
      await filterAvailableSkillsHook['experimental.chat.messages.transform'](
        input,
        typedOutput,
      );
    },

    // ── tool.execute.after ────────────────────────────────────────────
    'tool.execute.after': async (
      input: Record<string, unknown>,
      output: Record<string, unknown>,
    ) => {
      const meta = input as {
        tool?: string;
        sessionID?: string;
        callID?: string;
      };
      const runPostToolHook = async (
        name: string,
        fn: () => Promise<void>,
      ): Promise<void> => {
        try {
          await fn();
        } catch (error) {
          log('[plugin] post-tool hook failed open', {
            hook: name,
            tool: meta.tool,
            sessionID: meta.sessionID,
            callID: meta.callID,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      await runPostToolHook('delegate-task-retry', () =>
        delegateTaskRetryHook['tool.execute.after'](
          input as { tool: string },
          output as { output: unknown },
        ),
      );

      await runPostToolHook('json-error-recovery', () =>
        jsonErrorRecoveryHook['tool.execute.after'](
          input as {
            tool: string;
            sessionID: string;
            callID: string;
          },
          output as {
            title: string;
            output: unknown;
            metadata: unknown;
          },
        ),
      );

      await runPostToolHook('todo-continuation', () =>
        todoContinuationHook.handleToolExecuteAfter(
          input as {
            tool: string;
            sessionID?: string;
          },
          output as { output?: unknown },
        ),
      );

      await runPostToolHook('post-file-tool-nudge', () =>
        postFileToolNudgeHook['tool.execute.after'](
          input as {
            tool: string;
            sessionID?: string;
            callID?: string;
          },
          output as {
            title: string;
            output: string;
            metadata: Record<string, unknown>;
          },
        ),
      );

      await runPostToolHook('task-session-manager', () =>
        taskSessionManagerHook['tool.execute.after'](
          input as { tool: string; sessionID?: string; callID?: string },
          output as { output: unknown },
        ),
      );

      if ((input.tool as string)?.toLowerCase() === 'task') {
        divoomManager.onTaskEnd({
          parentSessionId: input.sessionID as string,
          callId: input.callID as string,
        });
      }
    },
  };
}
