import * as fs from 'node:fs';
import * as path from 'node:path';
import { crossSpawn } from '../../utils/compat';
import { log } from '../../utils/logger';
import {
  ARTIFACT_UPDATE_ROOT,
  PACKAGE_NAME,
  UPDATER_BINARY_NAME,
} from './constants';
import type { ResolvedAutoUpdateConfig, UpdaterState } from './types';

function candidatePaths(): string[] {
  const envPath = process.env.SYLASTRA_UPDATER_PATH?.trim();
  const cwdPath = path.join(
    process.cwd(),
    'updater',
    'bin',
    UPDATER_BINARY_NAME,
  );
  const repoBuildPath = path.join(
    process.cwd(),
    'updater',
    'cmd',
    UPDATER_BINARY_NAME,
    UPDATER_BINARY_NAME,
  );
  const releasePath = path.join(process.cwd(), 'bin', UPDATER_BINARY_NAME);

  return [envPath, releasePath, cwdPath, repoBuildPath].filter(
    (value): value is string => Boolean(value),
  );
}

export function resolveUpdaterBinary(): string | null {
  for (const candidate of candidatePaths()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getUpdaterRoot(): string {
  return ARTIFACT_UPDATE_ROOT;
}

function statePath(): string {
  return path.join(getUpdaterRoot(), 'state.json');
}

export function readUpdaterState(): UpdaterState | null {
  const filePath = statePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as UpdaterState;
  } catch (error) {
    log('[auto-update-checker] failed to read updater state:', error);
    return null;
  }
}

async function runUpdaterCommand(
  command: 'activate' | 'healthcheck' | 'rollback',
): Promise<{ ok: boolean; reason?: string }> {
  const updaterBinary = resolveUpdaterBinary();
  if (!updaterBinary) {
    return { ok: false, reason: 'updater binary not found' };
  }

  try {
    const proc = crossSpawn(
      [updaterBinary, '--root', getUpdaterRoot(), '--json', command],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    await proc.exited;
    if (proc.exitCode !== 0) {
      const stderr = await proc.stderr();
      return { ok: false, reason: stderr.trim() || `${command} failed` };
    }
    return { ok: true };
  } catch (error) {
    log(`[auto-update-checker] updater ${command} failed:`, error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function prepareArtifactUpdate(
  version: string,
  config: ResolvedAutoUpdateConfig,
): Promise<{ ok: boolean; reason?: string }> {
  const updaterBinary = resolveUpdaterBinary();
  if (!updaterBinary) {
    return { ok: false, reason: 'updater binary not found' };
  }

  try {
    const proc = crossSpawn(
      [
        updaterBinary,
        '--root',
        getUpdaterRoot(),
        '--json',
        '--version',
        version,
        '--manifest-url',
        config.manifestUrl,
        '--channel',
        config.channel,
        'prepare',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    await proc.exited;
    if (proc.exitCode !== 0) {
      const stderr = await proc.stderr();
      return { ok: false, reason: stderr.trim() || 'prepare failed' };
    }
    return { ok: true };
  } catch (error) {
    log('[auto-update-checker] updater prepare failed:', error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function activatePreparedUpdate() {
  return runUpdaterCommand('activate');
}

export async function runPreparedHealthcheck() {
  return runUpdaterCommand('healthcheck');
}

export async function rollbackPreparedUpdate() {
  return runUpdaterCommand('rollback');
}

export function isArtifactManagedRuntime(runtimeDir: string): boolean {
  const normalized = runtimeDir.replaceAll('\\', '/');
  return normalized.includes(`/${PACKAGE_NAME}/releases/`);
}
