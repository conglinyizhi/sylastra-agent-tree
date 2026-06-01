import { AGENT_ALIASES, ALL_AGENT_NAMES } from './constants';
import type { AgentOverrideConfig, PluginConfig } from './schema';

/**
 * Get agent override config by name, supporting backward-compatible aliases.
 * Checks both the current name and any legacy alias names.
 *
 * @param config - The plugin configuration
 * @param name - The current agent name
 * @returns The agent-specific override configuration if found
 */
export function getAgentOverride(
  config: PluginConfig | undefined,
  name: string,
): AgentOverrideConfig | undefined {
  const overrides = config?.agents ?? {};
  if (overrides[name] !== undefined) {
    return overrides[name];
  }

  for (const [alias, canonicalName] of Object.entries(AGENT_ALIASES)) {
    if (canonicalName !== name) {
      continue;
    }
    if (overrides[alias] !== undefined) {
      return overrides[alias];
    }
  }

  return undefined;
}

/**
 * Get custom agent names declared in config.agents.
 *
 * Custom agents are unknown keys that are neither built-in agent names nor
 * legacy aliases.
 */
export function getCustomAgentNames(
  config: PluginConfig | undefined,
): string[] {
  const overrides = config?.agents ?? {};
  return Object.keys(overrides).filter((name) => {
    if (AGENT_ALIASES[name] !== undefined) {
      return false;
    }

    return !(ALL_AGENT_NAMES as readonly string[]).includes(name);
  });
}
