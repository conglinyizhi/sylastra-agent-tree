import type { PluginInput } from '@opencode-ai/plugin';
import { log } from '../../utils/logger';
import {
  findPluginEntry,
  getCachedVersion,
  getLatestVersion,
  getLocalDevVersion,
  normalizeAutoUpdateConfig,
} from './checker';
import { CACHE_DIR } from './constants';
import type { AutoUpdateCheckerOptions } from './types';
import {
  activatePreparedUpdate,
  getUpdaterRoot,
  prepareArtifactUpdate,
  readUpdaterState,
  rollbackPreparedUpdate,
  runPreparedHealthcheck,
} from './updater';

/**
 * Creates an OpenCode hook that checks for plugin updates when a new session is created.
 * @param ctx The plugin input context.
 * @param options Configuration options for the update checker.
 * @returns A hook object for the session.created event.
 */
export function createAutoUpdateCheckerHook(
  ctx: PluginInput,
  options: AutoUpdateCheckerOptions = {},
) {
  const resolvedAutoUpdate = normalizeAutoUpdateConfig(options.autoUpdate);

  let hasChecked = false;

  return {
    event: ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== 'session.created') return;
      if (hasChecked) return;

      const props = event.properties as
        | { info?: { parentID?: string } }
        | undefined;
      if (props?.info?.parentID) return;

      hasChecked = true;

      setTimeout(async () => {
        await reconcilePreparedUpdate(ctx);

        const localDevVersion = getLocalDevVersion(ctx.directory);

        if (localDevVersion) {
          log('[auto-update-checker] Local development mode');
          return;
        }

        runBackgroundUpdateCheck(ctx, resolvedAutoUpdate).catch((err) => {
          log('[auto-update-checker] Background update check failed:', err);
        });
      }, 0);
    },
  };
}

async function reconcilePreparedUpdate(ctx: PluginInput): Promise<void> {
  const updaterState = readUpdaterState();
  if (!updaterState || updaterState.status !== 'prepared') {
    return;
  }

  showToast(
    ctx,
    'OMO-Slim Update',
    `检测到已准备更新 ${updaterState.preparedVersion ?? ''}，正在激活。`,
    'info',
    8000,
  );

  const activated = await activatePreparedUpdate();
  if (!activated.ok) {
    showToast(
      ctx,
      'OMO-Slim Update',
      `更新激活失败：${activated.reason ?? 'unknown error'}`,
      'error',
      8000,
    );
    return;
  }

  const healthy = await runPreparedHealthcheck();
  if (!healthy.ok) {
    await rollbackPreparedUpdate();
    showToast(
      ctx,
      'OMO-Slim Update',
      `更新健康检查失败，已回滚：${healthy.reason ?? 'unknown error'}`,
      'error',
      8000,
    );
    return;
  }

  showToast(
    ctx,
    'OMO-Slim Update Activated',
    `已激活更新 ${updaterState.preparedVersion ?? ''}。`,
    'success',
    8000,
  );
}

/**
 * Orchestrates the version comparison and update process in the background.
 * @param ctx The plugin input context.
 * @param autoUpdate Whether to automatically install updates.
 */
async function runBackgroundUpdateCheck(
  ctx: PluginInput,
  autoUpdate: ReturnType<typeof normalizeAutoUpdateConfig>,
): Promise<void> {
  const pluginInfo = findPluginEntry(ctx.directory);
  if (!pluginInfo) {
    log('[auto-update-checker] Plugin not found in config');
    return;
  }

  const cachedVersion = getCachedVersion();
  const currentVersion = cachedVersion ?? pluginInfo.pinnedVersion;
  if (!currentVersion) {
    log('[auto-update-checker] No version found (cached or pinned)');
    return;
  }

  const channel = autoUpdate.channel;
  const latestVersion = await getLatestVersion(autoUpdate);
  if (!latestVersion) {
    log(
      '[auto-update-checker] Failed to fetch latest version for channel:',
      channel,
    );
    return;
  }

  if (currentVersion === latestVersion) {
    log(
      '[auto-update-checker] Already on latest version for channel:',
      channel,
    );
    return;
  }

  log(
    `[auto-update-checker] Update available (${channel}): ${currentVersion} → ${latestVersion}`,
  );

  if (pluginInfo.isPinned) {
    showToast(
      ctx,
      `OMO-Slim ${latestVersion}`,
      `v${latestVersion} available.\nVersion is pinned. Update your plugin config to apply.`,
      'info',
      8000,
    );
    log(`[auto-update-checker] Version is pinned; skipping auto-update.`);
    return;
  }

  if (!autoUpdate.enabled || autoUpdate.policy === 'notify') {
    showToast(
      ctx,
      `OMO-Slim ${latestVersion}`,
      `v${latestVersion} available. 当前为通知模式。`,
      'info',
      8000,
    );
    log('[auto-update-checker] Notification-only mode');
    return;
  }

  showToast(
    ctx,
    `OMO-Slim ${latestVersion}`,
    `v${latestVersion} available. 正在准备下次启动激活的 artifact 更新。`,
    'info',
    8000,
  );

  const prepared = await prepareArtifactUpdate(latestVersion, autoUpdate);
  if (!prepared.ok) {
    showToast(
      ctx,
      `OMO-Slim ${latestVersion}`,
      `v${latestVersion} available，但 updater 准备失败：${prepared.reason ?? 'unknown error'}`,
      'error',
      8000,
    );
    log('[auto-update-checker] updater prepare failed:', prepared.reason);
    return;
  }

  showToast(
    ctx,
    'OMO-Slim Update Prepared',
    `v${currentVersion} → v${latestVersion}\n更新已准备，等待下次启动激活。`,
    'success',
    8000,
  );
  log('[auto-update-checker] artifact update prepared');
}

export function getAutoUpdateInstallDir(): string {
  return getUpdaterRoot() || CACHE_DIR;
}

/**
 * Helper to display a toast notification in the OpenCode TUI.
 * @param ctx The plugin input context.
 * @param title The toast title.
 * @param message The toast message.
 * @param variant The visual style of the toast.
 * @param duration How long to show the toast in milliseconds.
 */
function showToast(
  ctx: PluginInput,
  title: string,
  message: string,
  variant: 'info' | 'success' | 'error' = 'info',
  duration = 3000,
): void {
  ctx.client.tui
    .showToast({
      body: { title, message, variant, duration },
    })
    .catch(() => {});
}

export type { AutoUpdateCheckerOptions } from './types';
