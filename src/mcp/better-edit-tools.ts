import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LocalMcpConfig } from './types';

/**
 * Default installation path for better-edit-tools binary.
 *
 * Resolution order:
 * 1. BETTER_EDIT_TOOLS_PATH environment variable (user override)
 * 2. ~/.local/share/sylastra-agent-tree/bin/better-edit-tools (auto-installed)
 */
function getBinaryPath(): string {
  const envPath = process.env.BETTER_EDIT_TOOLS_PATH?.trim();
  if (envPath) return envPath;

  return join(
    homedir(),
    '.local/share/sylastra-agent-tree/bin/better-edit-tools',
  );
}

/**
 * better-edit-tools MCP — high-performance file editing toolkit in Go.
 *
 * Provides be-read, be-replace, be-insert, be-delete, be-write, be-balance,
 * be-func-range, be-tag-range, and be-insert-chip tools with atomic writes,
 * smart batch sorting, and intelligent function-scope detection.
 *
 * @see https://github.com/conglinyizhi/better-edit-tools-mcp
 */
export const betterEditTools: LocalMcpConfig = {
  type: 'local',
  command: [getBinaryPath(), '--lang', 'zh'],
  environment: {
    // Pass through so the binary can read project files
    HOME: homedir(),
  },
};
