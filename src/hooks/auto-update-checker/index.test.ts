import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const logMock = mock(() => {});

const checkerMocks = {
  extractChannel: mock(() => 'latest'),
  findPluginEntry: mock(() => null),
  getCachedVersion: mock(() => null),
  getLatestVersion: mock(async () => null),
  getLocalDevVersion: mock(() => null),
  getCurrentRuntimePackageJsonPath: mock(() => null),
  normalizeAutoUpdateConfig: mock((value?: unknown) => ({
    enabled: value !== false,
    policy: value === false ? 'notify' : 'prepare',
    channel: 'stable',
    cohort: 'default',
    manifestUrl: 'https://example.com/manifest.json',
    allowPrerelease: false,
  })),
};

const updaterMocks = {
  getUpdaterRoot: mock(() => '/tmp/opencode/sylastra-agent-tree'),
  readUpdaterState: mock(() => null),
  prepareArtifactUpdate: mock(async () => ({ ok: true })),
  activatePreparedUpdate: mock(async () => ({ ok: true })),
  runPreparedHealthcheck: mock(async () => ({ ok: true })),
  rollbackPreparedUpdate: mock(async () => ({ ok: true })),
};

mock.module('../../utils/logger', () => ({
  log: logMock,
}));

mock.module('./checker', () => checkerMocks);
mock.module('./updater', () => updaterMocks);

let importCounter = 0;

function createCtx() {
  const showToast = mock(() => Promise.resolve(undefined));

  return {
    ctx: {
      directory: '/test',
      client: {
        tui: {
          showToast,
        },
      },
    },
    showToast,
  };
}

async function waitForCalls(
  fn: { mock: { calls: unknown[] } },
  minCalls = 1,
): Promise<void> {
  const deadline = Date.now() + 1000;

  while (fn.mock.calls.length < minCalls) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for async hook work');
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('auto-update-checker/index', () => {
  beforeEach(() => {
    logMock.mockClear();

    checkerMocks.extractChannel.mockReset();
    checkerMocks.extractChannel.mockImplementation(() => 'latest');
    checkerMocks.findPluginEntry.mockReset();
    checkerMocks.findPluginEntry.mockImplementation(() => null);
    checkerMocks.getCachedVersion.mockReset();
    checkerMocks.getCachedVersion.mockImplementation(() => null);
    checkerMocks.getLatestVersion.mockReset();
    checkerMocks.getLatestVersion.mockImplementation(async () => null);
    checkerMocks.getLocalDevVersion.mockReset();
    checkerMocks.getLocalDevVersion.mockImplementation(() => null);
    checkerMocks.normalizeAutoUpdateConfig.mockReset();
    checkerMocks.normalizeAutoUpdateConfig.mockImplementation(
      (value?: unknown) => ({
        enabled: value !== false,
        policy: value === false ? 'notify' : 'prepare',
        channel: 'stable',
        cohort: 'default',
        manifestUrl: 'https://example.com/manifest.json',
        allowPrerelease: false,
      }),
    );
    updaterMocks.getUpdaterRoot.mockReset();
    updaterMocks.getUpdaterRoot.mockImplementation(
      () => '/tmp/opencode/sylastra-agent-tree',
    );
    updaterMocks.readUpdaterState.mockReset();
    updaterMocks.readUpdaterState.mockImplementation(() => null);
    updaterMocks.prepareArtifactUpdate.mockReset();
    updaterMocks.prepareArtifactUpdate.mockImplementation(async () => ({
      ok: true,
    }));
    updaterMocks.activatePreparedUpdate.mockReset();
    updaterMocks.activatePreparedUpdate.mockImplementation(async () => ({
      ok: true,
    }));
    updaterMocks.runPreparedHealthcheck.mockReset();
    updaterMocks.runPreparedHealthcheck.mockImplementation(async () => ({
      ok: true,
    }));
    updaterMocks.rollbackPreparedUpdate.mockReset();
    updaterMocks.rollbackPreparedUpdate.mockImplementation(async () => ({
      ok: true,
    }));
  });

  afterEach(() => {
    // Mocks are automatically cleared by Bun's test runner between tests
  });

  test('returns artifact updater root', async () => {
    const { getAutoUpdateInstallDir } = await import(
      `./index?test=${importCounter++}`
    );

    expect(getAutoUpdateInstallDir()).toBe('/tmp/opencode/sylastra-agent-tree');
  });

  test('skips background update for local dev installs without startup toast', async () => {
    checkerMocks.getLocalDevVersion.mockImplementation(() => '0.9.11-dev');

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never);
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(logMock);

    expect(showToast).not.toHaveBeenCalled();
    expect(checkerMocks.findPluginEntry).not.toHaveBeenCalled();
    expect(checkerMocks.getLatestVersion).not.toHaveBeenCalled();
  });

  test('activates prepared update on startup when updater state is prepared', async () => {
    updaterMocks.readUpdaterState.mockImplementation(() => ({
      status: 'prepared',
      preparedVersion: '0.9.11',
    }));

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never);
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(showToast, 2);

    expect(updaterMocks.activatePreparedUpdate).toHaveBeenCalled();
    expect(updaterMocks.runPreparedHealthcheck).toHaveBeenCalled();
    expect(showToast.mock.calls[0]?.[0]).toEqual({
      body: {
        title: 'sylastra-agent-tree Update',
        message: '检测到已准备更新 0.9.11，正在激活。',
        variant: 'info',
        duration: 8000,
      },
    });
    expect(showToast.mock.calls[1]?.[0]).toEqual({
      body: {
        title: 'sylastra-agent-tree Update Activated',
        message: '已激活更新 0.9.11。',
        variant: 'success',
        duration: 8000,
      },
    });
  });

  test('rolls back prepared update when healthcheck fails', async () => {
    updaterMocks.readUpdaterState.mockImplementation(() => ({
      status: 'prepared',
      preparedVersion: '0.9.11',
    }));
    updaterMocks.runPreparedHealthcheck.mockImplementation(async () => ({
      ok: false,
      reason: 'module load failed',
    }));

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never);
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(showToast, 2);

    expect(updaterMocks.rollbackPreparedUpdate).toHaveBeenCalled();
    expect(showToast.mock.calls[1]?.[0]).toEqual({
      body: {
        title: 'sylastra-agent-tree Update',
        message: '更新健康检查失败，已回滚：module load failed',
        variant: 'error',
        duration: 8000,
      },
    });
  });

  test('prepares artifact update and shows success toast when an update is available', async () => {
    checkerMocks.findPluginEntry.mockImplementation(() => ({
      pinnedVersion: null,
      isPinned: false,
    }));
    checkerMocks.getCachedVersion.mockImplementation(() => '0.9.1');
    checkerMocks.getLatestVersion.mockImplementation(async () => '0.9.11');

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never);
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(showToast, 2);

    expect(updaterMocks.prepareArtifactUpdate).toHaveBeenCalledWith('0.9.11', {
      enabled: true,
      policy: 'prepare',
      channel: 'stable',
      cohort: 'default',
      manifestUrl: 'https://example.com/manifest.json',
      allowPrerelease: false,
    });
    expect(showToast.mock.calls[0]?.[0]).toEqual({
      body: {
        title: 'sylastra-agent-tree 0.9.11',
        message: 'v0.9.11 available. 正在准备下次启动激活的 artifact 更新。',
        variant: 'info',
        duration: 8000,
      },
    });
    expect(showToast.mock.calls[1]?.[0]).toEqual({
      body: {
        title: 'sylastra-agent-tree Update Prepared',
        message: 'v0.9.1 → v0.9.11\n更新已准备，等待下次启动激活。',
        variant: 'success',
        duration: 8000,
      },
    });
  });

  test('shows notification-only toast when auto-update is disabled', async () => {
    checkerMocks.findPluginEntry.mockImplementation(() => ({
      pinnedVersion: null,
      isPinned: false,
    }));
    checkerMocks.getCachedVersion.mockImplementation(() => '0.9.1');
    checkerMocks.getLatestVersion.mockImplementation(async () => '0.9.11');

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never, {
      autoUpdate: false,
    });
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(showToast);

    expect(showToast).toHaveBeenCalledWith({
      body: {
        title: 'sylastra-agent-tree 0.9.11',
        message: 'v0.9.11 available. 当前为通知模式。',
        variant: 'info',
        duration: 8000,
      },
    });
  });

  test('uses notification mode when policy is notify', async () => {
    checkerMocks.findPluginEntry.mockImplementation(() => ({
      pinnedVersion: null,
      isPinned: false,
    }));
    checkerMocks.getCachedVersion.mockImplementation(() => '0.9.1');
    checkerMocks.getLatestVersion.mockImplementation(async () => '0.9.11');
    checkerMocks.normalizeAutoUpdateConfig.mockImplementation(() => ({
      enabled: true,
      policy: 'notify',
      channel: 'stable',
      cohort: 'default',
      manifestUrl: 'https://example.com/manifest.json',
      allowPrerelease: false,
    }));

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never);
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(showToast);

    expect(showToast).toHaveBeenCalledWith({
      body: {
        title: 'sylastra-agent-tree 0.9.11',
        message: 'v0.9.11 available. 当前为通知模式。',
        variant: 'info',
        duration: 8000,
      },
    });
  });

  test('shows pinned-version toast and skips updater path', async () => {
    checkerMocks.findPluginEntry.mockImplementation(() => ({
      pinnedVersion: '0.9.1',
      isPinned: true,
    }));
    checkerMocks.getCachedVersion.mockImplementation(() => '0.9.1');
    checkerMocks.getLatestVersion.mockImplementation(async () => '0.9.11');

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never);
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(showToast);

    expect(showToast).toHaveBeenCalledWith({
      body: {
        title: 'sylastra-agent-tree 0.9.11',
        message:
          'v0.9.11 available.\nVersion is pinned. Update your plugin config to apply.',
        variant: 'info',
        duration: 8000,
      },
    });
  });

  test('shows updater failure toast when prepare step fails', async () => {
    checkerMocks.findPluginEntry.mockImplementation(() => ({
      pinnedVersion: null,
      isPinned: false,
    }));
    checkerMocks.getCachedVersion.mockImplementation(() => '0.9.1');
    checkerMocks.getLatestVersion.mockImplementation(async () => '0.9.11');
    updaterMocks.prepareArtifactUpdate.mockImplementation(async () => ({
      ok: false,
      reason: 'updater binary not found',
    }));

    const { createAutoUpdateCheckerHook } = await import(
      `./index?test=${importCounter++}`
    );
    const { ctx, showToast } = createCtx();

    const hook = createAutoUpdateCheckerHook(ctx as never);
    hook.event({ event: { type: 'session.created', properties: {} } });
    await waitForCalls(showToast, 2);

    expect(showToast.mock.calls[1]?.[0]).toEqual({
      body: {
        title: 'sylastra-agent-tree 0.9.11',
        message:
          'v0.9.11 available，但 updater 准备失败：updater binary not found',
        variant: 'error',
        duration: 8000,
      },
    });
  });
});
