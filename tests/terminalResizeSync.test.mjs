import assert from 'node:assert/strict';
import {
  clearTerminalResizeState,
  flushTerminalResize,
  syncTerminalResize,
} from '../.tmp-agent-tests/src/lib/terminal/terminalResizeSync.js';
import { terminalCache } from '../.tmp-agent-tests/src/lib/terminal/terminalCache.js';

const SESSION = 'resize-sync-test';
const ipcResizes = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

function seedCache(overrides = {}) {
  terminalCache.set(SESSION, {
    term: { rows: 24, cols: 80 },
    fitAddon: {},
    searchAddon: {},
    generation: 1,
    spawned: true,
    starting: false,
    listenerAttached: false,
    pendingInput: '',
    inputFlushTimer: null,
    desiredResize: null,
    lastResize: null,
    ligaturesEnabled: false,
    ...overrides,
  });
}

const originalWindow = globalThis.window;
globalThis.window = {
  ipcRenderer: {
    send: (_channel, payload) => {
      ipcResizes.push(payload);
    },
  },
};

runTest('syncTerminalResize skips IPC when cache entry is missing', () => {
  terminalCache.clear();
  ipcResizes.length = 0;
  syncTerminalResize(SESSION, { rows: 24, cols: 80 });
  assert.equal(ipcResizes.length, 0);
});

runTest('syncTerminalResize retains desired size while PTY is not spawned', () => {
  terminalCache.clear();
  ipcResizes.length = 0;
  seedCache({ spawned: false, starting: false, term: { rows: 24, cols: 80 } });
  syncTerminalResize(SESSION, { rows: 40, cols: 120 });
  assert.equal(ipcResizes.length, 0);
  assert.deepEqual(terminalCache.get(SESSION).desiredResize, { rows: 40, cols: 120 });
});

runTest('syncTerminalResize retains desired size while PTY is starting', () => {
  terminalCache.clear();
  ipcResizes.length = 0;
  seedCache({
    spawned: true,
    starting: true,
    term: { rows: 24, cols: 80 },
  });
  syncTerminalResize(SESSION, { rows: 50, cols: 160 });
  assert.equal(ipcResizes.length, 0);
  assert.deepEqual(terminalCache.get(SESSION).desiredResize, { rows: 50, cols: 160 });
  assert.equal(terminalCache.get(SESSION).lastResize, null);
});

runTest('syncTerminalResize sends IPC when PTY is live', () => {
  terminalCache.clear();
  ipcResizes.length = 0;
  seedCache({
    spawned: true,
    starting: false,
    term: { rows: 24, cols: 80 },
  });
  syncTerminalResize(SESSION, { rows: 24, cols: 80 });
  assert.equal(ipcResizes.length, 1);
  assert.deepEqual(ipcResizes[0], { termId: SESSION, rows: 24, cols: 80 });
  assert.deepEqual(terminalCache.get(SESSION).lastResize, { rows: 24, cols: 80 });
  assert.deepEqual(terminalCache.get(SESSION).desiredResize, { rows: 24, cols: 80 });
});

runTest('flushTerminalResize sends retained size after PTY becomes live', () => {
  terminalCache.clear();
  ipcResizes.length = 0;
  const term = { rows: 48, cols: 140 };
  seedCache({
    spawned: true,
    starting: false,
    term,
    fitAddon: {},
    desiredResize: { rows: 48, cols: 140 },
    lastResize: null,
  });
  assert.equal(flushTerminalResize(SESSION), true);
  assert.equal(ipcResizes.length, 1);
  assert.deepEqual(ipcResizes[0], { termId: SESSION, rows: 48, cols: 140 });
  assert.deepEqual(terminalCache.get(SESSION).lastResize, { rows: 48, cols: 140 });
});

runTest('flushTerminalResize is a no-op while starting', () => {
  terminalCache.clear();
  ipcResizes.length = 0;
  seedCache({
    spawned: true,
    starting: true,
    term: { rows: 48, cols: 140 },
    desiredResize: { rows: 48, cols: 140 },
  });
  assert.equal(flushTerminalResize(SESSION), false);
  assert.equal(ipcResizes.length, 0);
});

runTest('flushTerminalResize skips duplicate size', () => {
  terminalCache.clear();
  ipcResizes.length = 0;
  seedCache({
    spawned: true,
    starting: false,
    term: { rows: 30, cols: 100 },
    lastResize: { rows: 30, cols: 100 },
    desiredResize: { rows: 30, cols: 100 },
  });
  assert.equal(flushTerminalResize(SESSION), false);
  assert.equal(ipcResizes.length, 0);
});

runTest('clearTerminalResizeState resets desired and last-sent', () => {
  terminalCache.clear();
  seedCache({
    desiredResize: { rows: 40, cols: 120 },
    lastResize: { rows: 24, cols: 80 },
  });
  clearTerminalResizeState(SESSION);
  assert.equal(terminalCache.get(SESSION).desiredResize, null);
  assert.equal(terminalCache.get(SESSION).lastResize, null);
});

globalThis.window = originalWindow;
console.log('Terminal resize sync tests passed.');
