import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripJsonComments } from '../../cli/config-manager';
import { log } from '../../utils/logger';
import {
  DEFAULT_MANIFEST_URL,
  MANIFEST_FETCH_TIMEOUT,
  PACKAGE_NAME,
  USER_OPENCODE_CONFIG,
  USER_OPENCODE_CONFIG_JSONC,
} from './constants';
import type {
  OpencodeConfig,
  PackageJson,
  PluginEntryInfo,
  ReleaseManifest,
  ResolvedAutoUpdateConfig,
} from './types';

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function getPluginEntries(config: OpencodeConfig): string[] {
  return Array.isArray(config.plugin) ? config.plugin.filter(isString) : [];
}

function getFileEntryPath(entry: string): string | null {
  if (!entry.startsWith('file://')) {
    return null;
  }

  try {
    return fileURLToPath(entry);
  } catch {
    return entry.slice('file://'.length);
  }
}

function isPluginPackageRoot(dirPath: string): boolean {
  const packageJsonPath = path.join(dirPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const pkg = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as PackageJson;
    return pkg.name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

function isPluginFileEntry(entry: string): boolean {
  const filePath = getFileEntryPath(entry);
  if (!filePath) {
    return false;
  }

  if (entry.includes(PACKAGE_NAME)) {
    return true;
  }

  return isPluginPackageRoot(filePath);
}

/**
 * Checks if a version string indicates a prerelease (contains a hyphen).
 */
function isPrereleaseVersion(version: string): boolean {
  return version.includes('-');
}

/**
 * Checks if a version string is an NPM dist-tag (does not start with a digit).
 */
function isDistTag(version: string): boolean {
  return !/^\d/.test(version);
}

/**
 * Extracts the update channel (latest, alpha, beta, etc.) from a version string.
 * @param version The version or tag to analyze.
 * @returns The channel name.
 */
export function extractChannel(version: string | null): string {
  if (!version) return 'latest';

  if (isDistTag(version)) return version;

  if (isPrereleaseVersion(version)) {
    const prereleasePart = version.split('-')[1];
    if (prereleasePart) {
      const channelMatch = prereleasePart.match(/^(alpha|beta|rc|canary|next)/);
      if (channelMatch) return channelMatch[1];
    }
  }

  return 'latest';
}

export function normalizeAutoUpdateConfig(
  autoUpdate: boolean | import('./types').AutoUpdateConfig | undefined,
): ResolvedAutoUpdateConfig {
  if (autoUpdate === false) {
    return {
      enabled: false,
      policy: 'notify',
      channel: 'stable',
      cohort: 'default',
      manifestUrl: DEFAULT_MANIFEST_URL,
      allowPrerelease: false,
    };
  }

  if (autoUpdate === true || autoUpdate === undefined) {
    return {
      enabled: true,
      policy: 'prepare',
      channel: 'stable',
      cohort: 'default',
      manifestUrl: DEFAULT_MANIFEST_URL,
      allowPrerelease: false,
    };
  }

  return {
    enabled: autoUpdate.enabled ?? true,
    policy: autoUpdate.policy ?? 'prepare',
    channel: autoUpdate.channel ?? 'stable',
    cohort: autoUpdate.cohort ?? 'default',
    manifestUrl: autoUpdate.manifestUrl ?? DEFAULT_MANIFEST_URL,
    allowPrerelease: autoUpdate.allowPrerelease ?? false,
    healthcheck: autoUpdate.healthcheck,
    rollback: autoUpdate.rollback,
  };
}

/**
 * Generates a list of potential OpenCode configuration file paths.
 * @param directory The current plugin directory to check for local .opencode folders.
 */
function getConfigPaths(directory: string): string[] {
  return [
    path.join(directory, '.opencode', 'opencode.json'),
    path.join(directory, '.opencode', 'opencode.jsonc'),
    USER_OPENCODE_CONFIG,
    USER_OPENCODE_CONFIG_JSONC,
  ];
}

/**
 * Attempts to find a local development path (file://) for the plugin in configs.
 */
function getLocalDevPath(directory: string): string | null {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig;
      const plugins = getPluginEntries(config);

      for (const entry of plugins) {
        if (entry.startsWith('file://') && entry.includes(PACKAGE_NAME)) {
          try {
            return fileURLToPath(entry);
          } catch {
            return entry.replace('file://', '');
          }
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Recursively searches upwards for a package.json belonging to this plugin.
 */
function findPackageJsonUp(startPath: string): string | null {
  try {
    const stat = fs.statSync(startPath);
    let dir = stat.isDirectory() ? startPath : path.dirname(startPath);

    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const content = fs.readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(content) as PackageJson;
          if (pkg.name === PACKAGE_NAME) return pkgPath;
        } catch {
          /* empty */
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* empty */
  }
  return null;
}

/**
 * Resolves the version of the plugin when running in local development mode.
 */
export function getLocalDevVersion(directory: string): string | null {
  const localPath = getLocalDevPath(directory);
  if (!localPath) return null;

  try {
    const pkgPath = findPackageJsonUp(localPath);
    if (!pkgPath) return null;
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content) as PackageJson;
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves the package.json for the currently running plugin bundle.
 */
export function getCurrentRuntimePackageJsonPath(
  currentModuleUrl: string = import.meta.url,
): string | null {
  try {
    const currentDir = path.dirname(fileURLToPath(currentModuleUrl));
    return findPackageJsonUp(currentDir);
  } catch (err) {
    log('[auto-update-checker] Failed to resolve runtime package path:', err);
    return null;
  }
}

/**
 * Searches across all config locations to find the current installation entry for this plugin.
 */
export function findPluginEntry(directory: string): PluginEntryInfo | null {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig;
      const plugins = getPluginEntries(config);

      for (const entry of plugins) {
        if (entry === PACKAGE_NAME) {
          return { entry, isPinned: false, pinnedVersion: null, configPath };
        }
        if (entry.startsWith(`${PACKAGE_NAME}@`)) {
          const pinnedVersion = entry.slice(PACKAGE_NAME.length + 1);
          const isPinned = pinnedVersion !== 'latest';
          return {
            entry,
            isPinned,
            pinnedVersion: isPinned ? pinnedVersion : null,
            configPath,
          };
        }
        if (isPluginFileEntry(entry)) {
          return {
            entry,
            isPinned: false,
            pinnedVersion: null,
            configPath,
          };
        }
      }
    } catch {}
  }
  return null;
}

let cachedPackageVersion: string | null = null;

/**
 * Resolves the active runtime version with memoization.
 */
export function getCachedVersion(): string | null {
  if (cachedPackageVersion) return cachedPackageVersion;

  try {
    const runtimePackageJsonPath = getCurrentRuntimePackageJsonPath();
    if (runtimePackageJsonPath && fs.existsSync(runtimePackageJsonPath)) {
      const content = fs.readFileSync(runtimePackageJsonPath, 'utf-8');
      const pkg = JSON.parse(content) as PackageJson;
      if (pkg.version) {
        cachedPackageVersion = pkg.version;
        return pkg.version;
      }
    }
  } catch {
    /* empty */
  }

  return null;
}

/**
 * Fetches the latest version for a specific channel from the NPM registry.
 */
export async function getLatestVersion(
  autoUpdate: ResolvedAutoUpdateConfig,
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    MANIFEST_FETCH_TIMEOUT,
  );

  try {
    const response = await fetch(autoUpdate.manifestUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as ReleaseManifest;
    const channelEntry = data[autoUpdate.channel];
    return channelEntry?.version ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
