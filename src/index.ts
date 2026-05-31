import type { Plugin } from '@opencode-ai/plugin';
import { createAgents, getAgentConfigs, getDisabledAgents } from './agents';
import { deepMerge, loadPluginConfig, type MultiplexerConfig } from './config';
import {
  getActiveRuntimePreset,
  setActiveRuntimePreset,
} from './config/runtime-preset';
import { CouncilManager } from './council';
import { createDivoomManager } from './divoom/manager';
import {
  createApplyPatchHook,
  createAutoUpdateCheckerHook,
  createChatHeadersHook,
  createDelegateTaskRetryHook,
  createFilterAvailableSkillsHook,
  createJsonErrorRecoveryHook,
  createPhaseReminderHook,
  createPostFileToolNudgeHook,
  createSessionGoalHook,
  createTaskSessionManagerHook,
  createTodoContinuationHook,
  ForegroundFallbackManager,
} from './hooks';
import { createInterviewManager } from './interview';
import { createBuiltinMcps } from './mcp';
import {
  getMultiplexer,
  MultiplexerSessionManager,
  startAvailabilityCheck,
} from './multiplexer';
import { appLog, HEALTH_CHECK, probeJSDOM } from './plugin/app-log';
import { createConfigHook } from './plugin/config-hook';
import type { PluginContext } from './plugin/context';
import { createEventHandlers } from './plugin/event-handler';
import {
  ast_grep_replace,
  ast_grep_search,
  createCouncilTool,
  createPresetManager,
  createReadSessionTool,
  createSubtaskCommandManager,
  createSubtaskState,
  createSubtaskTool,
  createWebfetchTool,
} from './tools';
import { createDisplayNameMentionRewriter } from './utils';
import { initLogger, log } from './utils/logger';
import { SubagentDepthTracker } from './utils/subagent-depth';

const SylastraAgentTree: Plugin = async (ctx) => {
  const sessionId = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  initLogger(sessionId);

  // ── Declare all shared state ───────────────────────────────────
  let pluginCtx: PluginContext;

  try {
    const config = loadPluginConfig(ctx.directory);

    // Safety net: runtime preset override for plugin re-init
    const runtimePreset = getActiveRuntimePreset();
    if (runtimePreset && config.presets?.[runtimePreset]) {
      config.preset = runtimePreset;
      const presetAgents = config.presets[runtimePreset];
      config.agents = deepMerge(config.agents, presetAgents);
    } else if (runtimePreset) {
      setActiveRuntimePreset(null);
    }

    const disabledAgents = getDisabledAgents(config);
    const rewriteDisplayNameMentions = createDisplayNameMentionRewriter(config);
    const agentDefs = createAgents(config);
    const agents = getAgentConfigs(config);

    // Build model array map and runtime fallback chains
    const modelArrayMap: Record<
      string,
      Array<{ id: string; variant?: string }>
    > = {};
    for (const agentDef of agentDefs) {
      if (agentDef._modelArray && agentDef._modelArray.length > 0) {
        modelArrayMap[agentDef.name] = agentDef._modelArray;
      }
    }
    const runtimeChains: Record<string, string[]> = {};
    for (const agentDef of agentDefs) {
      if (agentDef._modelArray?.length) {
        runtimeChains[agentDef.name] = agentDef._modelArray.map((m) => m.id);
      }
    }
    if (config.fallback?.enabled !== false) {
      const chains =
        (config.fallback?.chains as Record<string, string[] | undefined>) ?? {};
      for (const [agentName, chainModels] of Object.entries(chains)) {
        if (!chainModels?.length) continue;
        const existing = runtimeChains[agentName] ?? [];
        const seen = new Set(existing);
        for (const m of chainModels) {
          if (!seen.has(m)) {
            seen.add(m);
            existing.push(m);
          }
        }
        runtimeChains[agentName] = existing;
      }
    }

    // Multiplexer
    const multiplexerConfig: MultiplexerConfig = {
      type: config.multiplexer?.type ?? 'none',
      layout: config.multiplexer?.layout ?? 'main-vertical',
      main_pane_size: config.multiplexer?.main_pane_size ?? 60,
    };
    const multiplexer = getMultiplexer(multiplexerConfig);
    const multiplexerEnabled =
      multiplexerConfig.type !== 'none' &&
      multiplexer !== null &&
      multiplexer.isInsideSession();

    log('[plugin] initialized with multiplexer config', {
      multiplexerConfig,
      enabled: multiplexerEnabled,
      directory: ctx.directory,
    });
    if (multiplexerEnabled) {
      startAvailabilityCheck(multiplexerConfig);
    }

    // Core instances
    const depthTracker = new SubagentDepthTracker();
    const councilTools = config.composer
      ? createCouncilTool(
          ctx,
          new CouncilManager(ctx, config, depthTracker, multiplexerEnabled),
        )
      : {};
    const mcps = createBuiltinMcps(config.disabled_mcps, config.websearch);
    const webfetch = createWebfetchTool(ctx);
    const multiplexerSessionManager = new MultiplexerSessionManager(
      ctx,
      multiplexerConfig,
    );
    const sessionAgentMap = new Map<string, string>();
    const subtaskState = createSubtaskState();
    const subtaskCommandManager = createSubtaskCommandManager(
      ctx,
      subtaskState,
    );

    // Hook instances
    const autoUpdateChecker = createAutoUpdateCheckerHook(ctx, {
      autoUpdate: config.autoUpdate ?? true,
    });
    const phaseReminderHook = createPhaseReminderHook();
    const filterAvailableSkillsHook = createFilterAvailableSkillsHook(
      ctx,
      config,
    );
    const postFileToolNudgeHook = createPostFileToolNudgeHook({
      shouldInject: (sessionID) =>
        sessionAgentMap.get(sessionID) === 'orchestrator',
    });
    const chatHeadersHook = createChatHeadersHook(ctx);
    const delegateTaskRetryHook = createDelegateTaskRetryHook(ctx);
    const applyPatchHook = createApplyPatchHook(ctx);
    const jsonErrorRecoveryHook = createJsonErrorRecoveryHook(ctx);
    const foregroundFallback = new ForegroundFallbackManager(
      ctx.client,
      runtimeChains,
      config.fallback?.enabled !== false &&
        Object.keys(runtimeChains).length > 0,
    );
    const todoContinuationHook = createTodoContinuationHook(ctx, {
      maxContinuations: config.todoContinuation?.maxContinuations ?? 5,
      cooldownMs: config.todoContinuation?.cooldownMs ?? 3000,
      autoEnable: config.todoContinuation?.autoEnable ?? false,
      autoEnableThreshold: config.todoContinuation?.autoEnableThreshold ?? 4,
    });
    const sessionGoalHook = createSessionGoalHook(ctx, config, {
      getAgentName: (sessionID) => sessionAgentMap.get(sessionID),
    });
    const taskSessionManagerHook = createTaskSessionManagerHook(ctx, {
      maxSessionsPerAgent: config.sessionManager?.maxSessionsPerAgent ?? 2,
      readContextMinLines: config.sessionManager?.readContextMinLines ?? 10,
      readContextMaxFiles: config.sessionManager?.readContextMaxFiles ?? 8,
      shouldManageSession: (sessionID) =>
        sessionAgentMap.get(sessionID) === 'orchestrator',
    });
    const interviewManager = createInterviewManager(ctx, config);
    const presetManager = createPresetManager(ctx, config);
    const divoomManager = createDivoomManager(config.divoom);

    // Tool count for health check
    const toolCount =
      Object.keys(councilTools).length +
      Object.keys(todoContinuationHook.tool).length +
      1 + // webfetch
      2 + // ast_grep_search, ast_grep_replace
      2; // subtask, read_session

    // Assemble context
    pluginCtx = {
      ctx,
      config,
      disabledAgents,
      agentDefs,
      agents: agents as PluginContext['agents'],
      mcps: mcps as unknown as Record<string, unknown>,
      modelArrayMap,
      runtimeChains,
      multiplexerConfig,
      multiplexerEnabled,
      depthTracker,
      multiplexerSessionManager,
      sessionAgentMap,
      councilTools,
      webfetch: webfetch as Record<string, unknown>,
      rewriteDisplayNameMentions,
      subtaskState: subtaskState as PluginContext['subtaskState'],
      subtaskCommandManager,
      toolCount,
      autoUpdateChecker:
        autoUpdateChecker as PluginContext['autoUpdateChecker'],
      phaseReminderHook,
      filterAvailableSkillsHook,
      postFileToolNudgeHook,
      chatHeadersHook: chatHeadersHook as PluginContext['chatHeadersHook'],
      delegateTaskRetryHook,
      applyPatchHook,
      jsonErrorRecoveryHook,
      foregroundFallback,
      todoContinuationHook,
      sessionGoalHook,
      taskSessionManagerHook,
      interviewManager,
      presetManager,
      divoomManager,
    };
  } catch (err) {
    log('[plugin] FATAL: init failed', String(err));
    await appLog(
      ctx,
      'error',
      `INIT FAILED: ${String(err)}. Report at github.com/conglinyizhi/sylastra-agent-tree/issues/310`,
    );
    throw err;
  }

  // ── Health check ────────────────────────────────────────────────
  const agentCount = Object.keys(pluginCtx.agents).length;
  const mcpCount = Object.keys(pluginCtx.mcps).length;
  const mcpThreshold =
    pluginCtx.config.disabled_mcps && pluginCtx.config.disabled_mcps.length > 0
      ? 0
      : HEALTH_CHECK.minMcps;

  if (
    agentCount < HEALTH_CHECK.minAgents ||
    pluginCtx.toolCount < HEALTH_CHECK.minTools ||
    mcpCount < mcpThreshold
  ) {
    const msg = [
      'Health check: registrations suspiciously low.',
      `  agents: ${agentCount} (expected >=${HEALTH_CHECK.minAgents})`,
      `  tools:  ${pluginCtx.toolCount} (expected >=${HEALTH_CHECK.minTools})`,
      `  mcps:   ${mcpCount} (expected >=${mcpThreshold})`,
      'This usually means a dependency failed to resolve (jsdom, etc).',
      'If you recently updated opencode, see:',
      '  github.com/conglinyizhi/sylastra-agent-tree/issues/310',
    ].join('\n');
    log(`[plugin] WARN: ${msg}`);
    await appLog(ctx, 'warn', msg);
  } else {
    log('[plugin] health check passed', {
      agents: agentCount,
      tools: pluginCtx.toolCount,
      mcps: mcpCount,
    });
  }

  // ── Probe jsdom (async, non-blocking) ──────────────────────────
  probeJSDOM().then((err) => {
    if (err) {
      const msg = `jsdom probe failed; webfetch tool will not work: ${err}`;
      log(`[plugin] WARN: ${msg}`);
      appLog(ctx, 'warn', msg).catch(() => {});
    }
  });

  pluginCtx.divoomManager.onPluginLoad();

  // ── Build handlers ─────────────────────────────────────────────
  const configHook = createConfigHook(pluginCtx);
  const eventHandlers = createEventHandlers(pluginCtx);
  return {
    name: 'sylastra-agent-tree',

    agent: pluginCtx.agents,

    tool: {
      ...pluginCtx.councilTools,
      webfetch: pluginCtx.webfetch as never,
      ...pluginCtx.todoContinuationHook.tool,
      ast_grep_search,
      ast_grep_replace,
      subtask: createSubtaskTool(
        pluginCtx.ctx,
        pluginCtx.subtaskState as never,
        pluginCtx.depthTracker as never,
        {
          timeoutMs: pluginCtx.config.subtask?.timeoutMs,
        },
      ),
      read_session: createReadSessionTool(
        pluginCtx.ctx.client,
        pluginCtx.subtaskState as never,
      ),
    } as never,

    mcp: pluginCtx.mcps,

    config: configHook,

    event: eventHandlers.event,
    'tool.execute.before': eventHandlers['tool.execute.before'],
    'command.execute.before': eventHandlers['command.execute.before'],
    'chat.headers': eventHandlers['chat.headers'],
    'chat.message': eventHandlers['chat.message'],
    'experimental.chat.system.transform':
      eventHandlers['experimental.chat.system.transform'],
    'experimental.chat.messages.transform':
      eventHandlers['experimental.chat.messages.transform'],
    'tool.execute.after': eventHandlers['tool.execute.after'],
  } as unknown as ReturnType<Plugin>;
};

export default SylastraAgentTree;

export type {
  AgentName,
  AgentOverrideConfig,
  McpName,
  MultiplexerConfig,
  MultiplexerLayout,
  MultiplexerType,
  PluginConfig,
  TmuxConfig,
  TmuxLayout,
} from './config';
export type { RemoteMcpConfig } from './mcp';
