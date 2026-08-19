import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'components', 'plugins', 'PluginPanel.tsx'),
  'utf8',
);

const confirmation = source.indexOf('const confirmed = await useAppStore.getState().showConfirmDialog');
const staleGuard = source.indexOf('if (!active || iframeRef.current?.contentWindow !== sourceWindow) return;', confirmation);
const denial = source.indexOf("code: 'SSH_EXEC_DENIED'");
const invoke = source.indexOf("ipcRenderer.invoke('ssh_exec'");

assert.ok(confirmation >= 0, 'plugin SSH execution must request confirmation');
assert.ok(staleGuard > confirmation, 'approval must remain bound to the requesting iframe lifecycle');
assert.ok(denial > confirmation, 'a declined confirmation must return a structured error');
assert.ok(invoke > denial, 'SSH execution must occur only after the denial branch');
assert.match(source, /active = false;[\s\S]*removeEventListener\('message', handler\)/, 'effect cleanup must invalidate pending approvals');
assert.match(source, /e\.source !== sourceWindow/, 'plugin messages must be tied to the panel iframe');
assert.match(source, /sandbox="allow-scripts allow-modals"/, 'plugin iframe must not retain same-origin access');

console.log('Plugin panel SSH confirmation tests passed.');
