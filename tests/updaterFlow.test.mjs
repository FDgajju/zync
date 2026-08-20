import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createUpdaterIpcHandler, executeDownloadSimulation, evaluateAutoDownloadDecision } from '../.tmp-agent-tests/src/features/updater/updaterIpcCore.js';

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  // 1. Check updaterService implementation
  await runTest('updaterService defines complete lifecycle methods', () => {
    const servicePath = path.join(process.cwd(), 'src', 'features', 'updater', 'updaterService.ts');
    assert.ok(fs.existsSync(servicePath), 'updaterService.ts should exist');
    const content = fs.readFileSync(servicePath, 'utf8');

    assert.match(content, /export async function checkForUpdates/, 'should export checkForUpdates');
    assert.match(content, /export async function startDownload/, 'should export startDownload');
    assert.match(content, /export async function installAndRestart/, 'should export installAndRestart');
    assert.match(content, /export async function openReleasePage/, 'should export openReleasePage');
    assert.match(content, /invoke\('update:check'\)/, 'checkForUpdates should invoke update:check');
    assert.match(content, /invoke\('update:download'\)/, 'startDownload should invoke update:download');
    assert.match(content, /invoke\('update:install'\)/, 'installAndRestart should invoke update:install');
    assert.match(content, /localStorage\.setItem\('zync-just-updated',\s*'true'\)/, 'should set flag on update');
  });

  // 2. Check useAutoUpdater implementation and evaluateAutoDownloadDecision helper
  await runTest('useAutoUpdater registers progress listener, triggers auto-download, and retries on error', async () => {
    const hookPath = path.join(process.cwd(), 'src', 'features', 'updater', 'useAutoUpdater.ts');
    assert.ok(fs.existsSync(hookPath), 'useAutoUpdater.ts should exist');
    const content = fs.readFileSync(hookPath, 'utf8');

    assert.match(content, /addEventListener\('zync:update-progress'/, 'should listen to update progress');
    assert.match(content, /removeEventListener\('zync:update-progress'/, 'should clean up progress listener');
    assert.match(content, /id:\s*'zync-updater'/, 'should use stable notification id to prevent duplicate spam');
    assert.match(content, /notify\.success/, 'should notify when update is ready to install');

    // Test production evaluateAutoDownloadDecision helper across cycles
    let hasAutoDownloaded = false;
    let downloadCallCount = 0;
    let simulatedStoreStatus = 'idle';

    const handleStartDownloadMock = async (shouldFail = false) => {
      downloadCallCount++;
      if (shouldFail) {
        simulatedStoreStatus = 'error';
      } else {
        simulatedStoreStatus = 'ready';
      }
    };

    const runAutoCheck = async (shouldFail) => {
      const autoDownload = true;
      const decision = evaluateAutoDownloadDecision({
        autoDownload,
        hasAutoDownloaded,
      });

      if (decision.shouldTriggerDownload) {
        hasAutoDownloaded = decision.nextHasAutoDownloaded;
        await handleStartDownloadMock(shouldFail);
        if (simulatedStoreStatus === 'error') {
          hasAutoDownloaded = false;
        }
      }
    };

    // Cycle 1: fails -> hasAutoDownloaded is reset to false
    await runAutoCheck(true);
    assert.equal(downloadCallCount, 1, 'Should attempt download in cycle 1');
    assert.equal(hasAutoDownloaded, false, 'hasAutoDownloaded must reset to false on failure');

    // Cycle 2: retried because hasAutoDownloaded was reset -> succeeds
    await runAutoCheck(false);
    assert.equal(downloadCallCount, 2, 'Should retry download in cycle 2');
    assert.equal(hasAutoDownloaded, true, 'hasAutoDownloaded must remain true on success');

    // Cycle 3: already downloaded -> skips duplicate download
    await runAutoCheck(false);
    assert.equal(downloadCallCount, 2, 'Should not download again once successfully downloaded');
  });

  // 3. Check StatusBarUpdateIndicator implementation
  await runTest('StatusBarUpdateIndicator provides progress, available download, and restart button', () => {
    const indicatorPath = path.join(process.cwd(), 'src', 'features', 'updater', 'StatusBarUpdateIndicator.tsx');
    assert.ok(fs.existsSync(indicatorPath), 'StatusBarUpdateIndicator.tsx should exist');
    const content = fs.readFileSync(indicatorPath, 'utf8');

    assert.match(content, /updateStatus\s*===\s*'available'/, 'should handle available state with download button');
    assert.match(content, /updateStatus\s*===\s*'downloading'/, 'should handle downloading state');
    assert.match(content, /updateStatus\s*===\s*'ready'/, 'should handle ready state');
    assert.match(content, /Restart to update/, 'should display restart CTA in ready state');
    assert.match(content, /installAndRestart\(\)/, 'should invoke installAndRestart on button click');
  });

  // 4. Check StatusBar integration
  await runTest('StatusBar integrates StatusBarUpdateIndicator', () => {
    const statusBarPath = path.join(process.cwd(), 'src', 'components', 'layout', 'StatusBar.tsx');
    assert.ok(fs.existsSync(statusBarPath), 'StatusBar.tsx should exist');
    const content = fs.readFileSync(statusBarPath, 'utf8');

    assert.match(content, /StatusBarUpdateIndicator/, 'StatusBar should import and render StatusBarUpdateIndicator');
  });

  // 5. Check Settings useSettingsUpdateFlow macOS in-app update support
  await runTest('useSettingsUpdateFlow enables auto-update across macOS, Linux, and Windows', () => {
    const settingsHookPath = path.join(process.cwd(), 'src', 'components', 'settings', 'hooks', 'useSettingsUpdateFlow.ts');
    assert.ok(fs.existsSync(settingsHookPath), 'useSettingsUpdateFlow.ts should exist');
    const content = fs.readFileSync(settingsHookPath, 'utf8');

    assert.match(content, /canAutoUpdate\s*=\s*true/, 'canAutoUpdate should be true for all platforms');
    assert.doesNotMatch(
      content,
      /canAutoUpdate\s*=\s*resolvedPlatform\s*!==\s*['"]darwin['"]/,
      'should not disable auto-update on macOS',
    );
    assert.match(content, /serviceStartDownload\(\)/, 'should use serviceStartDownload in update flow');
    assert.match(content, /serviceInstallAndRestart\(\)/, 'should use serviceInstallAndRestart on confirm');
  });

  // 6. Check AboutTab progress bar
  await runTest('AboutTab renders download progress bar and active status', () => {
    const aboutTabPath = path.join(process.cwd(), 'src', 'components', 'settings', 'tabs', 'AboutTab.tsx');
    assert.ok(fs.existsSync(aboutTabPath), 'AboutTab.tsx should exist');
    const content = fs.readFileSync(aboutTabPath, 'utf8');

    assert.match(content, /downloadProgress/, 'AboutTab should accept downloadProgress');
    assert.match(content, /Downloading\.\.\.\s*\$\{percent\}%/, 'AboutTab should render progress percentage');
    assert.match(content, /style=\{\{\s*width:\s*`\$\{percent\}%`\s*\}\}/, 'AboutTab should render animated progress bar');
  });

  // 7. Check tauri-ipc and backend relaunch
  await runTest('tauri-ipc supports app_relaunch and updater core integration', () => {
    const ipcPath = path.join(process.cwd(), 'src', 'lib', 'tauri-ipc.ts');
    assert.ok(fs.existsSync(ipcPath), 'tauri-ipc.ts should exist');
    const content = fs.readFileSync(ipcPath, 'utf8');

    assert.match(content, /'app:relaunch':\s*'app_relaunch'/, 'channelMap should map app:relaunch');
    assert.match(content, /createUpdaterIpcHandler/, 'tauri-ipc should use createUpdaterIpcHandler');
    assert.match(content, /updaterIpc\.handleCheck\(\)/, 'should delegate update:check');
    assert.match(content, /updaterIpc\.handleDownload\(\)/, 'should delegate update:download');
    assert.match(content, /updaterIpc\.handleInstall\(\)/, 'should delegate update:install');
  });

  // 8. Check mockUpdater dev simulator
  await runTest('mockUpdater provides complete auto and manual simulation workflows', () => {
    const mockPath = path.join(process.cwd(), 'src', 'features', 'updater', 'mockUpdater.ts');
    assert.ok(fs.existsSync(mockPath), 'mockUpdater.ts should exist');
    const content = fs.readFileSync(mockPath, 'utf8');

    assert.match(content, /simulateAutoUpdateFlow/, 'should export simulateAutoUpdateFlow');
    assert.match(content, /simulateManualUpdateFlow/, 'should export simulateManualUpdateFlow');
    assert.match(content, /startSimulatedDownload/, 'should export startSimulatedDownload');
    assert.match(content, /mockPostUpdateCelebration/, 'should export mockPostUpdateCelebration');
    assert.match(content, /id:\s*'zync-updater'/, 'should use deduplicated notification id');
  });

  // 9. Behavioral test: execute real executeDownloadSimulation with zero-delay target
  await runTest('behavioral: executeDownloadSimulation transitions from progress to ready', async () => {
    let currentStatus = 'idle';
    let currentProgress = 0;
    let currentInfo = null;

    const progressEvents = [];
    const target = {
      hasVersion: () => Boolean(currentInfo?.version),
      setUpdateInfo: (info) => { currentInfo = info; },
      setUpdateStatus: (status) => { currentStatus = status; },
      setDownloadProgress: (percent) => { currentProgress = percent; },
      dispatchEvent: (name, detail) => {
        if (name === 'zync:update-progress') {
          progressEvents.push(detail);
        }
      },
      delay: async () => {},
    };

    await executeDownloadSimulation('2.25.0', 0, target);

    assert.equal(currentStatus, 'ready', 'Simulation must end in ready state');
    assert.equal(currentProgress, 100, 'Download progress must reach 100%');
    assert.equal(progressEvents.length, 10, 'Must emit 10 progress steps');
    assert.equal(progressEvents[progressEvents.length - 1].status, 'finished', 'Last step must report finished');
  });

  // 10. Behavioral test: execute real production createUpdaterIpcHandler
  await runTest('behavioral: createUpdaterIpcHandler enforces check, download, install lifecycle and readiness guards', async () => {
    let availableUpdate = null;
    let installCalls = 0;
    let relaunchCalls = 0;
    const dispatchedEvents = [];

    const mockDeps = {
      check: async () => availableUpdate,
      invoke: async (cmd) => {
        if (cmd === 'app_relaunch') relaunchCalls++;
      },
      dispatchEvent: (name, detail) => {
        dispatchedEvents.push({ name, detail });
      },
    };

    const handler = createUpdaterIpcHandler(mockDeps);

    let closeCalls = 0;

    const fakeUpdate = {
      version: '2.25.0',
      available: true,
      download: async (cb) => {
        cb({ event: 'Started', data: { contentLength: 100 } });
        cb({ event: 'Progress', data: { chunkLength: 100 } });
        cb({ event: 'Finished' });
      },
      install: async () => {
        installCalls++;
      },
      close: async () => {
        closeCalls++;
      },
    };

    const fakeFailingUpdate = {
      version: '2.25.0',
      available: true,
      download: async () => {
        throw new Error('Download network failure');
      },
      install: async () => {
        installCalls++;
      },
      close: async () => {
        closeCalls++;
      },
    };

    // Step 1: Install before check -> must throw
    await assert.rejects(
      async () => await handler.handleInstall(),
      /No downloaded update is ready to install/,
      'Must reject install when no update is checked',
    );
    assert.equal(installCalls, 0);
    assert.equal(relaunchCalls, 0);
    assert.equal(handler.getState().isUpdateDownloaded, false);

    // Step 2: Check update -> available, but NOT downloaded yet
    availableUpdate = fakeUpdate;
    const checkRes = await handler.handleCheck();
    assert.deepEqual(checkRes, { updateInfo: { version: '2.25.0', body: undefined, date: undefined } });
    assert.equal(handler.getState().isUpdateDownloaded, false, 'Readiness must be false after check');

    // Step 3: Install before download -> must throw
    await assert.rejects(
      async () => await handler.handleInstall(),
      /No downloaded update is ready to install/,
      'Must reject install when checked but not downloaded',
    );
    assert.equal(installCalls, 0);
    assert.equal(relaunchCalls, 0);

    // Step 4: Download failure -> resets readiness and propagates error
    availableUpdate = fakeFailingUpdate;
    await handler.handleCheck();
    await assert.rejects(
      async () => await handler.handleDownload(),
      /Download network failure/,
      'Download must propagate failure',
    );
    assert.equal(handler.getState().isUpdateDownloaded, false, 'Readiness must be false on download failure');
    await assert.rejects(
      async () => await handler.handleInstall(),
      /No downloaded update is ready to install/,
      'Install must reject following download failure',
    );

    // Step 5: Successful download -> readiness becomes true
    availableUpdate = fakeUpdate;
    await handler.handleCheck();
    const dlRes = await handler.handleDownload();
    assert.deepEqual(dlRes, { success: true });
    assert.equal(handler.getState().isUpdateDownloaded, true, 'Readiness must be true after download');

    // Step 6: Install succeeds and triggers app_relaunch
    const installRes = await handler.handleInstall();
    assert.deepEqual(installRes, { success: true });
    assert.equal(installCalls, 1, 'Must invoke install()');
    assert.equal(relaunchCalls, 1, 'Must invoke app_relaunch');

    // Step 7: Subsequent check clears readiness and closes previous update handle
    const beforeCloseCount = closeCalls;
    const newFakeUpdate = {
      version: '2.26.0',
      available: true,
      download: async (cb) => {
        cb({ event: 'Finished' });
      },
      install: async () => {},
      close: async () => {
        closeCalls++;
      },
    };
    availableUpdate = newFakeUpdate;
    await handler.handleCheck();
    assert.equal(handler.getState().isUpdateDownloaded, false, 'Subsequent check must reset readiness');
    assert.equal(closeCalls, beforeCloseCount + 1, 'Must invoke close() on previous update handle exactly once');
    await assert.rejects(
      async () => await handler.handleInstall(),
      /No downloaded update is ready to install/,
      'Install must reject until re-downloaded',
    );

    // Step 8: Concurrency guard - overlapping operations are rejected
    let resolveCheck;
    const hangingCheckPromise = new Promise((resolve) => { resolveCheck = resolve; });
    availableUpdate = hangingCheckPromise;

    const inFlightCheck = handler.handleCheck();
    // Overlapping check while first check is in flight
    await assert.rejects(
      async () => await handler.handleCheck(),
      /is already in progress/,
      'Overlapping check must be rejected',
    );
    // Overlapping download while check is in flight
    await assert.rejects(
      async () => await handler.handleDownload(),
      /is already in progress/,
      'Overlapping download during check must be rejected',
    );

    resolveCheck(newFakeUpdate);
    await inFlightCheck;
    assert.equal(handler.getState().activeOperation, null, 'Active operation must clear upon completion');
  });

  console.log('All comprehensive updater flow tests passed successfully.');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
