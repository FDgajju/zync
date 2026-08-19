import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'components', 'plugins', 'PluginPanel.tsx'),
  'utf8',
);
const workerSource = fs.readFileSync(
  path.join(process.cwd(), 'src', 'context', 'PluginContext.tsx'),
  'utf8',
);
const confirmationSource = fs.readFileSync(
  path.join(process.cwd(), 'src', 'features', 'plugins', 'confirmPluginTerminalAction.ts'),
  'utf8',
);
const settingsPluginsSource = fs.readFileSync(
  path.join(process.cwd(), 'src', 'components', 'settings', 'hooks', 'useSettingsPlugins.ts'),
  'utf8',
);

assert.match(source, /handlePanelPluginCommand/, 'panel privileged messages must use the tested bridge');
assert.match(source, /confirmUi: options => useAppStore\.getState\(\)\.showConfirmDialog\(options\)/, 'panel confirmations must use the lifecycle-aware bridge');
assert.match(source, /frameGenerationRef\.current === generation/, 'approval must be tied to one loaded iframe document');
assert.match(source, /active\s*&&\s*iframeRef\.current\?\.contentWindow === requester/, 'unmounted or replaced frames must be rejected');
assert.match(source, /frameGenerationRef\.current \+= 1/, 'iframe loads must advance the lifecycle generation');
assert.match(source, /loadSshInvoker:[\s\S]*ipcRenderer\.invoke\([\s\S]*'ssh_exec'/, 'SSH IPC must be injected into the tested bridge');
assert.match(source, /sandbox="allow-scripts allow-modals"/, 'plugin iframe must not retain same-origin access');
assert.match(workerSource, /handlePluginMessage\(plugin\.manifest\.id, type, payload, worker\)/, 'worker identity must travel with its message');
assert.match(workerSource, /handleWorkerTerminalCommand/, 'worker terminal input must use the tested bridge');
assert.match(workerSource, /workers\.current\.get\(pluginId\) === candidate/, 'stale workers must be rejected after confirmation');
assert.match(workerSource, /workers\.current\.get\(pluginId\) !== requester\) return/, 'all messages from a terminated Worker must be rejected');
assert.match(workerSource, /resetPluginWorkers/, 'plugin reloads must reset the previous Worker generation');
assert.match(workerSource, /hostCompatiblePlugins\.filter\(plugin => plugin\.enabled\)/, 'disabled plugins must not register host modes');
assert.match(workerSource, /postCurrentWorkerResponse/, 'asynchronous Worker replies must target the captured requester');
assert.doesNotMatch(workerSource, /const worker = workers\.current\.get\(pluginId\);[\s\S]{0,120}worker\.postMessage\(\{ type: `\$\{type\}:response`/, 'responses must never look up a replacement Worker after await');
const workerBridge = workerSource.slice(
  workerSource.indexOf('const handlePluginMessage'),
  workerSource.indexOf('const executeCommand'),
);
for (const responseCall of workerBridge.matchAll(/\brespond\(([^,\n]+)/g)) {
  assert.equal(responseCall[1].trim(), 'requester', 'every Worker response must retain its requester');
}
assert.match(workerSource, /requester,[\s\S]{0,160}'api:window:showQuickPick'/, 'delayed quick-pick replies must retain Worker identity');
assert.match(workerSource, /if \(!isTrustedBuiltinTheme\(plugin\) \|\| !plugin\.style\) return;[\s\S]{0,240}document\.head\.appendChild\(style\)/, 'only app-owned built-in theme CSS may enter the host document');
assert.match(workerSource, /Third-party manifest\.style is never injected/, 'the third-party CSS compatibility boundary must remain documented');
assert.match(workerSource, /filterTrustedBuiltinThemeChoices/, 'theme-manager choices must be backed by trusted built-in packages');
assert.match(settingsPluginsSource, /activeTab === 'appearance'[\s\S]{0,100}filterUnsupportedHostThemes\(plugins\)\.filter\(plugin => plugin\.enabled\)/, 'Appearance must advertise only enabled trusted themes');
assert.match(confirmationSource, /showConfirmDialog/, 'all plugin command bridges must share the confirmation policy');

console.log('Plugin panel SSH confirmation tests passed.');
