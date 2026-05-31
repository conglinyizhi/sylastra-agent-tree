import type { AgentOverrideConfig } from '../config';
import { AGENT_ALIASES } from '../config/constants';
import {
  getActiveRuntimePreset,
  getPreviousRuntimePreset,
} from '../config/runtime-preset';
import { log } from '../utils/logger';
import type { PluginContext } from './context';

/**
 * Build the config() hook handler.
 *
 * The config hook merges plugin agent/MCP definitions into OpenCode's config,
 * resolves model arrays with fallback chains, applies runtime preset overrides,
 * and wires up per-agent MCP permissions.
 */
export function createConfigHook(ctx: PluginContext) {
  const {
    config,
    agents,
    agentDefs,
    mcps,
    modelArrayMap,
    runtimeChains,
    interviewManager,
    sessionGoalHook,
    presetManager,
    subtaskCommandManager,
  } = ctx;

  return async (opencodeConfig: Record<string, unknown>): Promise<void> => {
    // Only set default_agent if not already configured by the user
    if (
      config.setDefaultAgent !== false &&
      !(opencodeConfig as { default_agent?: string }).default_agent
    ) {
      (opencodeConfig as { default_agent?: string }).default_agent =
        'orchestrator';
    }

    // Merge Agent configs — per-agent shallow merge to preserve
    // user-supplied fields (e.g. tools, permission) from opencode.json
    if (!opencodeConfig.agent) {
      opencodeConfig.agent = { ...agents } as Record<string, unknown>;
    } else {
      for (const [name, pluginAgent] of Object.entries(agents)) {
        const existing = (opencodeConfig.agent as Record<string, unknown>)[
          name
        ] as Record<string, unknown> | undefined;
        if (existing) {
          (opencodeConfig.agent as Record<string, unknown>)[name] = {
            ...(pluginAgent as Record<string, unknown>),
            ...existing,
          };
        } else {
          (opencodeConfig.agent as Record<string, unknown>)[name] = {
            ...(pluginAgent as Record<string, unknown>),
          };
        }
      }
    }
    const configAgent = opencodeConfig.agent as Record<string, unknown>;

    // Model resolution for foreground agents: combine _modelArray
    // entries with fallback.chains config, then pick the first model in
    // the effective array for startup-time selection.
    const fallbackChainsEnabled = config.fallback?.enabled !== false;
    const fallbackChains = fallbackChainsEnabled
      ? ((config.fallback?.chains as Record<string, string[] | undefined>) ??
        {})
      : {};

    const effectiveArrays: Record<
      string,
      Array<{ id: string; variant?: string }>
    > = {};

    for (const [agentName, models] of Object.entries(modelArrayMap)) {
      effectiveArrays[agentName] = [...models];
    }

    for (const [agentName, chainModels] of Object.entries(fallbackChains)) {
      if (!chainModels || chainModels.length === 0) continue;

      if (!effectiveArrays[agentName]) {
        const entry = configAgent[agentName] as
          | Record<string, unknown>
          | undefined;
        const currentModel =
          typeof entry?.model === 'string' ? entry.model : undefined;
        effectiveArrays[agentName] = currentModel ? [{ id: currentModel }] : [];
      }

      const seen = new Set(effectiveArrays[agentName].map((m) => m.id));
      for (const chainModel of chainModels) {
        if (!seen.has(chainModel)) {
          seen.add(chainModel);
          effectiveArrays[agentName].push({ id: chainModel });
        }
      }
    }

    if (Object.keys(effectiveArrays).length > 0) {
      for (const [agentName, modelArray] of Object.entries(effectiveArrays)) {
        if (modelArray.length === 0) continue;

        const chosen = modelArray[0];
        const entry = configAgent[agentName] as
          | Record<string, unknown>
          | undefined;
        if (entry) {
          entry.model = chosen.id;
          if (chosen.variant) {
            entry.variant = chosen.variant;
          }
        } else {
          (configAgent as Record<string, unknown>)[agentName] = {
            model: chosen.id,
            ...(chosen.variant ? { variant: chosen.variant } : {}),
          };
        }
        log('[plugin] resolved model from array', {
          agent: agentName,
          model: chosen.id,
          variant: chosen.variant,
        });
      }
    }

    // Runtime preset override: if /preset switched to a runtime preset,
    // override the model/variant/temperature from the preset's agent config.
    const runtimePresetName = getActiveRuntimePreset();
    if (runtimePresetName && config.presets?.[runtimePresetName]) {
      const runtimePreset = config.presets[runtimePresetName];
      for (const [agentName, override] of Object.entries(runtimePreset)) {
        const resolvedName = AGENT_ALIASES[agentName] ?? agentName;
        const entry = configAgent[resolvedName] as
          | Record<string, unknown>
          | undefined;
        if (!entry) continue;

        if (typeof override.model === 'string') {
          entry.model = override.model;
        } else if (Array.isArray(override.model) && override.model.length > 0) {
          const first = override.model[0];
          entry.model = typeof first === 'string' ? first : first.id;
          if (typeof first !== 'string' && first.variant) {
            entry.variant = first.variant;
          }
        }
        if (typeof override.variant === 'string') {
          entry.variant = override.variant;
        } else if ('variant' in override) {
          delete entry.variant;
        }
        if (typeof override.temperature === 'number') {
          entry.temperature = override.temperature;
        } else if ('temperature' in override) {
          delete entry.temperature;
        }
        if (
          override.options &&
          typeof override.options === 'object' &&
          !Array.isArray(override.options)
        ) {
          entry.options = override.options;
        } else if ('options' in override) {
          delete entry.options;
        }
        log('[plugin] runtime preset override', {
          preset: runtimePresetName,
          agent: agentName,
          model: entry.model as string,
        });
      }

      // Reset agents from the previous preset that aren't in the new one.
      const prevPresetName = getPreviousRuntimePreset();
      if (prevPresetName && config.presets?.[prevPresetName]) {
        const prevPreset = config.presets[prevPresetName];
        const newPresetResolved = new Set(
          Object.keys(runtimePreset).map((k) => AGENT_ALIASES[k] ?? k),
        );
        for (const agentName of Object.keys(prevPreset)) {
          const resolvedName = AGENT_ALIASES[agentName] ?? agentName;
          if (newPresetResolved.has(resolvedName)) continue;
          const entry = configAgent[resolvedName] as
            | Record<string, unknown>
            | undefined;
          if (!entry) continue;

          const baseline = config.agents?.[resolvedName];
          const prevOverride = prevPreset[agentName] as
            | AgentOverrideConfig
            | undefined;
          if (typeof baseline?.model === 'string') {
            entry.model = baseline.model;
          }
          if (typeof baseline?.variant === 'string') {
            entry.variant = baseline.variant;
          } else if (prevOverride && 'variant' in prevOverride) {
            delete entry.variant;
          }
          if (typeof baseline?.temperature === 'number') {
            entry.temperature = baseline.temperature;
          } else if (prevOverride && 'temperature' in prevOverride) {
            delete entry.temperature;
          }
          if (
            baseline?.options &&
            typeof baseline.options === 'object' &&
            !Array.isArray(baseline.options)
          ) {
            entry.options = baseline.options;
          } else if (prevOverride && 'options' in prevOverride) {
            delete entry.options;
          }
          log('[plugin] runtime preset reset from previous', {
            previousPreset: prevPresetName,
            agent: resolvedName,
            model: entry.model as string,
          });
        }
      }
    }

    // Build TUI model map
    const tuiAgentModels: Record<string, string> = {};
    for (const agentDef of agentDefs) {
      if (agentDef.name === 'councillor') continue;
      const entry = configAgent[agentDef.name] as
        | Record<string, unknown>
        | undefined;
      const resolvedModel =
        typeof entry?.model === 'string'
          ? entry.model
          : runtimeChains[agentDef.name]?.[0]
            ? runtimeChains[agentDef.name][0]
            : typeof agentDef.config.model === 'string'
              ? agentDef.config.model
              : undefined;
      tuiAgentModels[agentDef.name] = resolvedModel ?? 'default';
    }
    const { recordTuiAgentModels } = await import('../tui-state');
    recordTuiAgentModels({ agentModels: tuiAgentModels });

    // Merge MCP configs
    const configMcp = opencodeConfig.mcp as Record<string, unknown> | undefined;
    if (!configMcp) {
      opencodeConfig.mcp = { ...mcps };
    } else {
      Object.assign(configMcp, mcps);
    }

    // Get all MCP names from the merged config
    const mergedMcpConfig = opencodeConfig.mcp as
      | Record<string, unknown>
      | undefined;
    const allMcpNames = Object.keys(mergedMcpConfig ?? mcps);

    // Create per-agent permission rules based on their MCP lists
    const { parseList } = await import('../config/agent-mcps');
    for (const [agentName, agentConfig] of Object.entries(agents)) {
      const agentMcps = (agentConfig as { mcps?: string[] })?.mcps;
      if (!agentMcps) continue;

      if (!configAgent[agentName]) {
        configAgent[agentName] = {
          ...(agentConfig as Record<string, unknown>),
        };
      }
      const agentConfigEntry = configAgent[agentName] as Record<
        string,
        unknown
      >;
      const agentPermission = (agentConfigEntry.permission ?? {}) as Record<
        string,
        unknown
      >;

      const allowedMcps = parseList(agentMcps, allMcpNames);
      for (const mcpName of allMcpNames) {
        const sanitizedMcpName = mcpName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const permissionKey = `${sanitizedMcpName}_*`;
        const action = allowedMcps.includes(mcpName) ? 'allow' : 'deny';
        if (!(permissionKey in agentPermission)) {
          agentPermission[permissionKey] = action;
        }
      }
      agentConfigEntry.permission = agentPermission;
    }

    // Register /auto-continue command
    const configCommand = opencodeConfig.command as
      | Record<string, unknown>
      | undefined;
    if (!configCommand?.['auto-continue']) {
      if (!opencodeConfig.command) {
        opencodeConfig.command = {};
      }
      (opencodeConfig.command as Record<string, unknown>)['auto-continue'] = {
        template: '调用 auto_continue 工具并设置 enabled=true',
        description: '启用自动继续 — 编排器会在未完成的待办事项上持续工作',
      };
    }

    interviewManager.registerCommand(opencodeConfig);
    sessionGoalHook.registerCommand(opencodeConfig);
    presetManager.registerCommand(opencodeConfig);
    subtaskCommandManager.registerCommand(opencodeConfig);
  };
}
