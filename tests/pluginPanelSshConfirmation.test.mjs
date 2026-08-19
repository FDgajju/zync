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

const confirmation = source.indexOf('const confirmed = await confirmPluginTerminalAction', source.indexOf("type === 'zync:ssh:exec'"));
const staleGuard = source.indexOf('if (!active || iframeRef.current?.contentWindow !== sourceWindow) return;', confirmation);
const denial = source.indexOf("code: 'SSH_EXEC_DENIED'");
const invoke = source.indexOf("ipcRenderer.invoke('ssh_exec'");
const panelSend = source.indexOf("type === 'zync:terminal:send'");
const panelSendConfirmation = source.indexOf('await confirmPluginTerminalAction', panelSend);
const panelSendDispatch = source.indexOf("new CustomEvent('zync:terminal:send'", panelSend);
const panelOpen = source.indexOf("type === 'zync:terminal:opentab'");
const panelOpenConfirmation = source.indexOf('await confirmPluginTerminalAction', panelOpen);
const panelOpenDispatch = source.indexOf("new CustomEvent('ssh-ui:new-terminal-tab'", panelOpen);
const workerSend = workerSource.indexOf("case 'api:terminal:send'");
const workerSendConfirmation = workerSource.indexOf('await confirmPluginTerminalAction', workerSend);
const workerSendDispatch = workerSource.indexOf("new CustomEvent('zync:terminal:send'", workerSend);

assert.ok(confirmation >= 0, 'plugin SSH execution must request confirmation');
assert.ok(staleGuard > confirmation, 'approval must remain bound to the requesting iframe lifecycle');
assert.ok(denial > confirmation, 'a declined confirmation must return a structured error');
assert.ok(invoke > denial, 'SSH execution must occur only after the denial branch');
assert.match(source, /active = false;[\s\S]*removeEventListener\('message', handler\)/, 'effect cleanup must invalidate pending approvals');
assert.match(source, /e\.source !== sourceWindow/, 'plugin messages must be tied to the panel iframe');
assert.match(source, /sandbox="allow-scripts allow-modals"/, 'plugin iframe must not retain same-origin access');
assert.ok(panelSend < panelSendConfirmation && panelSendConfirmation < panelSendDispatch, 'panel terminal input must be confirmed before dispatch');
assert.ok(panelOpen < panelOpenConfirmation && panelOpenConfirmation < panelOpenDispatch, 'panel terminal commands must be confirmed before opening a tab');
assert.ok(workerSend < workerSendConfirmation && workerSendConfirmation < workerSendDispatch, 'worker terminal input must be confirmed before dispatch');
assert.match(confirmationSource, /showConfirmDialog/, 'all plugin command bridges must share the confirmation policy');

console.log('Plugin panel SSH confirmation tests passed.');
