import * as os from 'node:os';
import * as path from 'node:path';
import { getOpenCodeConfigPaths } from '../../cli/config-manager';

export const PACKAGE_NAME = 'sylastra-agent-tree';
export const DEFAULT_MANIFEST_URL =
  'https://github.com/conglinyizhi/sylastra-agent-tree/releases/latest/download/manifest.json';
export const MANIFEST_FETCH_TIMEOUT = 5000;
export const UPDATER_BINARY_NAME = 'sylastra-updater';

function getCacheDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'opencode');
  }
  return path.join(os.homedir(), '.cache', 'opencode');
}

/** The directory used by OpenCode to cache node_modules for plugins. */
export const CACHE_DIR = getCacheDir();
export const ARTIFACT_UPDATE_ROOT = path.join(CACHE_DIR, PACKAGE_NAME);

/** Path to this plugin's package.json within the OpenCode cache. */
export const INSTALLED_PACKAGE_JSON = path.join(
  CACHE_DIR,
  'node_modules',
  PACKAGE_NAME,
  'package.json',
);

const configPaths = getOpenCodeConfigPaths();

/** Primary OpenCode configuration file path (standard JSON). */
export const USER_OPENCODE_CONFIG = configPaths[0];

/** Alternative OpenCode configuration file path (JSON with Comments). */
export const USER_OPENCODE_CONFIG_JSONC = configPaths[1];
