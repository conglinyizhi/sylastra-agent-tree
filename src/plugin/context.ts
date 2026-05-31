import type { Plugin } from '@opencode-ai/plugin';
import type { MultiplexerConfig, PluginConfig } from '../config';

/**
 * All shared state produced during plugin initialization.
 *
 * Uses structural typing for hook instances to avoid fragile
 * ReturnType chains. Runtime values are correct at every usage site;
 * the compiler just needs to see the method shapes we actually call.
 */
export interface PluginContext {
  ctx: Parameters<Plugin>[0];
  config: PluginConfig;
  disabledAgents: Set<string>;
  agentDefs: Array<{
    name: string;
    config: { model?: string; prompt?: string };
    _modelArray?: Array<{ id: string; variant?: string }>;
  }>;
  agents: Record<string, unknown>;
  mcps: Record<string, unknown>;
  modelArrayMap: Record<string, Array<{ id: string; variant?: string }>>;
  runtimeChains: Record<string, string[]>;
  multiplexerConfig: MultiplexerConfig;
  multiplexerEnabled: boolean;
  depthTracker: {
    registerChild(parent: string, child: string): void;
    cleanup(sessionId: string): void;
  };
  multiplexerSessionManager: {
    onSessionCreated(event: unknown): Promise<void>;
    onSessionStatus(event: unknown): Promise<void>;
    onSessionDeleted(event: unknown): Promise<void>;
  };
  sessionAgentMap: Map<string, string>;
  councilTools: Record<string, unknown>;
  webfetch: Record<string, unknown>;
  rewriteDisplayNameMentions: (text: string) => string;
  subtaskState: unknown;
  subtaskCommandManager: {
    handleEvent(input: unknown): void;
    registerCommand(opencodeConfig: Record<string, unknown>): void;
  };
  toolCount: number;

  // ── Hook instances (structural types, not ReturnType chains) ──
  autoUpdateChecker: { event(input: unknown): void };
  phaseReminderHook: {
    'experimental.chat.messages.transform'(
      input: unknown,
      output: unknown,
    ): Promise<void>;
  };
  filterAvailableSkillsHook: {
    'experimental.chat.messages.transform'(
      input: unknown,
      output: unknown,
    ): Promise<void>;
  };
  postFileToolNudgeHook: {
    'tool.execute.after'(input: unknown, output: unknown): Promise<void>;
  };
  chatHeadersHook: Record<string, (...args: unknown[]) => unknown>;
  delegateTaskRetryHook: {
    'tool.execute.after'(input: unknown, output: unknown): Promise<void>;
  };
  applyPatchHook: {
    'tool.execute.before'(input: unknown, output: unknown): Promise<void>;
  };
  jsonErrorRecoveryHook: {
    'tool.execute.after'(input: unknown, output: unknown): Promise<void>;
  };
  foregroundFallback: { handleEvent(event: unknown): Promise<void> };
  todoContinuationHook: {
    handleEvent(input: unknown): Promise<void>;
    handleChatMessage(msg: { sessionID: string; agent?: string }): void;
    handleCommandExecuteBefore(input: unknown, output: unknown): Promise<void>;
    handleMessagesTransform(msg: { messages: unknown[] }): Promise<void>;
    handleToolExecuteAfter(input: unknown, output: unknown): Promise<void>;
    tool: Record<string, unknown>;
  };
  sessionGoalHook: {
    handleEvent(input: unknown): void;
    registerCommand(opencodeConfig: Record<string, unknown>): void;
    handleSystemTransform(input: unknown, output: { system: string[] }): void;
    handleCommandExecuteBefore(input: unknown, output: unknown): Promise<void>;
  };
  taskSessionManagerHook: {
    event(input: unknown): Promise<void>;
    'tool.execute.before'(input: unknown, output: unknown): Promise<void>;
    'experimental.chat.messages.transform'(
      input: unknown,
      output: unknown,
    ): Promise<void>;
    'tool.execute.after'(input: unknown, output: unknown): Promise<void>;
  };
  interviewManager: {
    handleEvent(input: unknown): Promise<void>;
    registerCommand(opencodeConfig: Record<string, unknown>): void;
    handleCommandExecuteBefore(input: unknown, output: unknown): Promise<void>;
  };
  presetManager: {
    registerCommand(opencodeConfig: Record<string, unknown>): void;
    handleCommandExecuteBefore(input: unknown, output: unknown): Promise<void>;
  };
  divoomManager: {
    onPluginLoad(): void;
    onUserInputRequired(info: { sessionId?: string; requestId?: string }): void;
    onUserInputResolved(info: { sessionId?: string; requestId?: string }): void;
    onOrchestratorStatus(info: {
      sessionId?: string;
      status?: string;
      isOrchestrator: boolean;
    }): void;
    onSessionDeleted(info: {
      sessionId?: string;
      isOrchestrator: boolean;
    }): void;
    onTaskStart(info: {
      parentSessionId?: string;
      callId?: string;
      args?: unknown;
    }): void;
    onTaskEnd(info: { parentSessionId?: string; callId?: string }): void;
  };
}
