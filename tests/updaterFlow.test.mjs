import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

// 1. Check updaterService implementation
runTest('updaterService defines complete lifecycle methods', () => {
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

// 2. Check useAutoUpdater implementation
runTest('useAutoUpdater registers progress listener and notifies user with deduplicated id', () => {
  const hookPath = path.join(process.cwd(), 'src', 'features', 'updater', 'useAutoUpdater.ts');
  assert.ok(fs.existsSync(hookPath), 'useAutoUpdater.ts should exist');
  const content = fs.readFileSync(hookPath, 'utf8');

  assert.match(content, /addEventListener\('zync:update-progress'/, 'should listen to update progress');
  assert.match(content, /removeEventListener\('zync:update-progress'/, 'should clean up progress listener');
  assert.match(content, /id:\s*'zync-updater'/, 'should use stable notification id to prevent duplicate spam');
  assert.match(content, /notify\.success/, 'should notify when update is ready to install');
  assert.match(content, /startDownload\(\)/, 'should auto-start download in background');
});

// 3. Check StatusBarUpdateIndicator implementation
runTest('StatusBarUpdateIndicator provides progress, available download, and restart button', () => {
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
runTest('StatusBar integrates StatusBarUpdateIndicator', () => {
  const statusBarPath = path.join(process.cwd(), 'src', 'components', 'layout', 'StatusBar.tsx');
  assert.ok(fs.existsSync(statusBarPath), 'StatusBar.tsx should exist');
  const content = fs.readFileSync(statusBarPath, 'utf8');

  assert.match(content, /StatusBarUpdateIndicator/, 'StatusBar should import and render StatusBarUpdateIndicator');
});

// 5. Check Settings useSettingsUpdateFlow macOS in-app update support
runTest('useSettingsUpdateFlow enables auto-update across macOS, Linux, and Windows', () => {
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
runTest('AboutTab renders download progress bar and active status', () => {
  const aboutTabPath = path.join(process.cwd(), 'src', 'components', 'settings', 'tabs', 'AboutTab.tsx');
  assert.ok(fs.existsSync(aboutTabPath), 'AboutTab.tsx should exist');
  const content = fs.readFileSync(aboutTabPath, 'utf8');

  assert.match(content, /downloadProgress/, 'AboutTab should accept downloadProgress');
  assert.match(content, /Downloading\.\.\.\s*\$\{percent\}%/, 'AboutTab should render progress percentage');
  assert.match(content, /style=\{\{\s*width:\s*`\$\{percent\}%`\s*\}\}/, 'AboutTab should render animated progress bar');
});

// 7. Check tauri-ipc and backend relaunch
runTest('tauri-ipc supports app_relaunch and safe update handlers', () => {
  const ipcPath = path.join(process.cwd(), 'src', 'lib', 'tauri-ipc.ts');
  assert.ok(fs.existsSync(ipcPath), 'tauri-ipc.ts should exist');
  const content = fs.readFileSync(ipcPath, 'utf8');

  assert.match(content, /'app:relaunch':\s*'app_relaunch'/, 'channelMap should map app:relaunch');
  assert.match(content, /invoke\('app_relaunch'\)/, 'update:install should call app_relaunch');
  assert.match(content, /currentUpdate\.download\(/, 'update:download should use currentUpdate.download');
});

// 8. Check mockUpdater dev simulator
runTest('mockUpdater provides complete auto and manual simulation workflows', () => {
  const mockPath = path.join(process.cwd(), 'src', 'features', 'updater', 'mockUpdater.ts');
  assert.ok(fs.existsSync(mockPath), 'mockUpdater.ts should exist');
  const content = fs.readFileSync(mockPath, 'utf8');

  assert.match(content, /simulateAutoUpdateFlow/, 'should export simulateAutoUpdateFlow');
  assert.match(content, /simulateManualUpdateFlow/, 'should export simulateManualUpdateFlow');
  assert.match(content, /startSimulatedDownload/, 'should export startSimulatedDownload');
  assert.match(content, /mockPostUpdateCelebration/, 'should export mockPostUpdateCelebration');
  assert.match(content, /id:\s*'zync-updater'/, 'should use deduplicated notification id');
});

console.log('All comprehensive updater flow tests passed successfully.');
