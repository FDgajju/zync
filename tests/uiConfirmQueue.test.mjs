import assert from 'node:assert/strict';
import { createUiSlice } from '../.tmp-agent-tests/src/store/uiSlice.js';
import { handlePanelPluginCommand } from '../.tmp-agent-tests/src/features/plugins/pluginCommandBridge.js';

function createUiHarness() {
  let state;
  const get = () => state;
  const set = update => {
    const patch = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...patch };
  };
  state = createUiSlice(set, get);
  return { get };
}

function panelCommand(ui, requester, text, dispatches) {
  return handlePanelPluginCommand({
    event: { source: requester, data: { type: 'zync:terminal:send', payload: { text } } },
    pluginId: 'queue.test',
    connectionId: 'conn-queue',
    getRequester: () => requester,
    isCurrent: candidate => candidate === requester,
    confirm: (_pluginId, action, command) => ui.get().showConfirmDialog({
      title: 'Allow plugin terminal action?',
      message: `${action}: ${command}`,
      confirmText: 'Allow',
      cancelText: 'Cancel',
      variant: 'danger',
    }),
    dispatch: (type, detail) => dispatches.push({ type, detail }),
    post: () => {},
    loadSshInvoker: async () => async () => undefined,
  });
}

const ui = createUiHarness();
const firstPromise = ui.get().showConfirmDialog({ title: 'First', message: 'first command' });
const firstDialog = ui.get().confirmDialog;
const secondPromise = ui.get().showConfirmDialog({ title: 'Second', message: 'second command' });

assert.equal(ui.get().confirmDialog, firstDialog, 'a second request must not replace visible content');
assert.equal(ui.get().confirmDialogQueue.length, 1);
assert.equal(ui.get().confirmDialogQueue[0].title, 'Second');

firstDialog.onConfirm();
assert.equal(await firstPromise, true);
assert.equal(ui.get().confirmDialog.title, 'Second');

firstDialog.onCancel();
assert.equal(ui.get().confirmDialog.title, 'Second', 'a stale click must not settle the next dialog');
ui.get().confirmDialog.onCancel();
assert.equal(await secondPromise, false);
assert.equal(ui.get().confirmDialog, null);

const pluginUi = createUiHarness();
const requester = {};
const dispatches = [];
const firstCommand = panelCommand(pluginUi, requester, 'first\r', dispatches);
const firstPluginDialog = pluginUi.get().confirmDialog;
const secondCommand = panelCommand(pluginUi, requester, 'second\r', dispatches);

assert.match(firstPluginDialog.message, /first/);
assert.doesNotMatch(firstPluginDialog.message, /second/);
assert.match(pluginUi.get().confirmDialogQueue[0].message, /second/);

firstPluginDialog.onConfirm();
await firstCommand;
assert.deepEqual(dispatches, [{
  type: 'zync:terminal:send',
  detail: { text: 'first\r', connectionId: 'conn-queue' },
}]);
assert.match(pluginUi.get().confirmDialog.message, /second/);

firstPluginDialog.onConfirm();
assert.equal(dispatches.length, 1, 'the first button must not approve the queued command');
pluginUi.get().confirmDialog.onConfirm();
await secondCommand;
assert.deepEqual(dispatches[1], {
  type: 'zync:terminal:send',
  detail: { text: 'second\r', connectionId: 'conn-queue' },
});

console.log('Confirmation queue and plugin command binding tests passed.');
