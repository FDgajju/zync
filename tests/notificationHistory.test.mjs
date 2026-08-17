import assert from 'node:assert/strict';
import {
  defaultToastDuration,
  loadPersistedHistory,
  markHistoryRead,
  normalizeNotificationSettings,
  notificationStackClass,
  persistHistory,
  prependHistory,
  pruneHistory,
  sanitizeHistory,
  shouldStoreInHistory,
  toNotificationRecord,
  unreadCount,
  NOTIFICATION_HISTORY_MAX_AGE_MS,
} from '../.tmp-agent-tests/src/features/notifications/notificationHistory.js';
import {
  namespacePluginNotificationId,
  parsePluginUiNotify,
} from '../.tmp-agent-tests/src/features/notifications/pluginNotify.js';
import {
  createPluginNotifyActionRequestId,
  resolvePluginNotifyActionResponse,
  waitForPluginNotifyActionResult,
} from '../.tmp-agent-tests/src/features/notifications/pluginNotifyAction.js';

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}: ${message}`);
    process.exitCode = 1;
  }
}

const tests = [
  () => runTest('default durations by type', () => {
    assert.equal(defaultToastDuration('success'), 4000);
    assert.equal(defaultToastDuration('info'), 4000);
    assert.equal(defaultToastDuration('warning'), 6000);
    assert.equal(defaultToastDuration('error'), 8000);
    assert.equal(defaultToastDuration('error', 0), 0);
    assert.equal(defaultToastDuration('success', 1200), 1200);
  }),

  () => runTest('ephemeral success/info stay out of history; errors and sticky go in', () => {
    assert.equal(shouldStoreInHistory('success'), false);
    assert.equal(shouldStoreInHistory('info'), false);
    assert.equal(shouldStoreInHistory('warning'), true);
    assert.equal(shouldStoreInHistory('error'), true);
    assert.equal(shouldStoreInHistory('success', { persist: true }), true);
    assert.equal(shouldStoreInHistory('info', { duration: 0 }), true);
    assert.equal(shouldStoreInHistory('success', { hasActions: true }), true);
    assert.equal(shouldStoreInHistory('error', { history: false }), false);
    assert.equal(shouldStoreInHistory('info', { history: true }), true);
    assert.equal(shouldStoreInHistory('success', { channel: 'inbox' }), true);
    assert.equal(shouldStoreInHistory('error', { channel: 'toast' }), false);
  }),

  () => runTest('prependHistory caps and dedupes by id', () => {
    const now = Date.now();
    // Cap larger than the record set so truncation cannot hide a stale duplicate.
    const cap = 10;
    const first = { id: 'a', type: 'info', message: 'one', createdAt: now - 2, read: false };
    const second = { id: 'b', type: 'error', message: 'two', createdAt: now - 1, read: false };
    const updated = { id: 'a', type: 'info', message: 'one-updated', createdAt: now, read: true };
    const next = prependHistory(prependHistory([], first, cap), second, cap);
    assert.deepEqual(next.map(item => item.id), ['b', 'a']);
    const replaced = prependHistory(next, updated, cap);
    assert.deepEqual(replaced.map(item => item.id), ['a', 'b']);
    assert.equal(replaced[0].message, 'one-updated');
    assert.equal(replaced.length, 2);
  }),

  () => runTest('unreadCount and markHistoryRead', () => {
    const history = [
      toNotificationRecord({ id: '1', type: 'info', message: 'a', duration: 4000, createdAt: 1, storeInHistory: false }, false),
      toNotificationRecord({ id: '2', type: 'error', message: 'b', duration: 0, createdAt: 2, storeInHistory: true }, true),
    ];
    assert.equal(unreadCount(history), 1);
    assert.equal(unreadCount(markHistoryRead(history)), 0);
  }),

  () => runTest('sanitizeHistory drops invalid rows', () => {
    const cleaned = sanitizeHistory([
      { id: 'ok', type: 'info', message: 'hello', createdAt: Date.now(), read: false },
      { id: '', type: 'info', message: 'bad' },
      { type: 'info', message: 'no-id' },
      { id: 'x', type: 'nope', message: 'bad-type' },
      null,
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, 'ok');
  }),

  () => runTest('sanitizeHistory prunes expired before applying cap', () => {
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < 50; i += 1) {
      rows.push({
        id: `old-${i}`,
        type: 'error',
        message: 'expired',
        createdAt: now - NOTIFICATION_HISTORY_MAX_AGE_MS - 1000 - i,
        read: false,
      });
    }
    rows.push({
      id: 'fresh',
      type: 'error',
      message: 'kept',
      createdAt: now,
      read: false,
    });
    const cleaned = sanitizeHistory(rows);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, 'fresh');
  }),

  () => runTest('persist and load history without actions', () => {
    const store = new Map();
    const storage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => { store.set(key, value); },
      removeItem: (key) => { store.delete(key); },
    };
    persistHistory([
      { id: '1', type: 'info', message: 'saved', createdAt: Date.now(), read: false, actions: [{ id: 'retry', label: 'Retry' }] },
    ], storage);
    const loaded = loadPersistedHistory(storage);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].message, 'saved');
    assert.equal(loaded[0].actions, undefined);
  }),

  () => runTest('pruneHistory drops aged entries', () => {
    const now = Date.now();
    const pruned = pruneHistory([
      { id: 'old', type: 'error', message: 'old', createdAt: now - NOTIFICATION_HISTORY_MAX_AGE_MS - 1000, read: false },
      { id: 'new', type: 'error', message: 'new', createdAt: now, read: false },
    ], 50, NOTIFICATION_HISTORY_MAX_AGE_MS, now);
    assert.deepEqual(pruned.map(item => item.id), ['new']);
  }),

  () => runTest('normalizeNotificationSettings and stack class', () => {
    assert.deepEqual(normalizeNotificationSettings(undefined), {
      position: 'bottom-right',
      doNotDisturb: false,
      playSound: false,
    });
    assert.equal(normalizeNotificationSettings({ position: 'top-left', doNotDisturb: true }).position, 'top-left');
    assert.match(notificationStackClass('top-left'), /top-12 left-3/);
    assert.match(notificationStackClass('bottom-right'), /bottom-10 right-3/);
  }),

  () => runTest('parsePluginUiNotify namespaces ids and maps options', () => {
    const parsed = parsePluginUiNotify('my-plugin', {
      type: 'error',
      body: 'Deploy failed',
      persist: true,
      history: true,
      channel: 'both',
      id: 'deploy-1',
      actions: [{ id: 'retry', label: 'Retry' }, { id: '', label: 'bad' }],
    });
    assert.equal(parsed.type, 'error');
    assert.equal(parsed.message, 'Deploy failed');
    assert.equal(parsed.options.source, 'plugin:my-plugin');
    assert.equal(parsed.options.persist, true);
    assert.equal(parsed.options.history, true);
    assert.equal(parsed.options.channel, 'both');
    assert.equal(parsed.options.id, 'plugin:my-plugin:deploy-1');
    assert.equal(namespacePluginNotificationId('my-plugin', 'plugin:my-plugin:deploy-1'), 'plugin:my-plugin:deploy-1');
    assert.deepEqual(parsed.actionSpecs, [{ id: 'retry', label: 'Retry' }]);
  }),

  () => runTest('plugin notify action response resolves waiters', async () => {
    const requestId = createPluginNotifyActionRequestId();
    const wait = waitForPluginNotifyActionResult(requestId, 'my-plugin', 2000);
    const handled = resolvePluginNotifyActionResponse({
      requestId,
      result: { ok: false, error: 'retry failed' },
    });
    assert.equal(handled, true);
    const result = await wait;
    assert.equal(result.ok, false);
    assert.equal(result.error, 'retry failed');
  }),
];

for (const run of tests) {
  await run();
}
