import assert from 'node:assert/strict';
import {
  canSendTerminalInput,
  flushPendingInput,
  handleTerminalReady,
  queueTerminalInput,
} from '../.tmp-agent-tests/src/lib/terminal/inputPipeline.js';
import { terminalCache } from '../.tmp-agent-tests/src/lib/terminal/terminalCache.js';

const SESSION = 'input-pipeline-test';
/** Ordered IPC log: { channel, payload } — preserves write vs resize order. */
const ipcCalls = [];

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
    pendingInputBytes: 0,
    inputFlushTimer: null,
    desiredResize: null,
    lastResize: null,
    ligaturesEnabled: false,
    ...overrides,
  });
}

globalThis.window = {
  ipcRenderer: {
    send: (channel, payload) => {
      ipcCalls.push({ channel, payload });
    },
  },
  setTimeout: (fn) => {
    fn();
    return 1;
  },
  clearTimeout: () => {},
};

runTest('canSendTerminalInput is false while starting', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  seedCache({ starting: true });
  assert.equal(canSendTerminalInput(SESSION), false);
});

runTest('queueTerminalInput buffers without IPC while starting', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  seedCache({ starting: true });
  queueTerminalInput(SESSION, 'abc');
  assert.equal(terminalCache.get(SESSION).pendingInput, 'abc');
  assert.equal(ipcCalls.length, 0);
});

runTest('handleTerminalReady flushes buffered input before resize', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  seedCache({
    starting: true,
    pendingInput: 'ls\r',
    generation: 2,
    term: { rows: 48, cols: 140 },
    desiredResize: { rows: 48, cols: 140 },
  });
  assert.equal(handleTerminalReady(SESSION, 2), true);
  assert.equal(terminalCache.get(SESSION).starting, false);
  assert.equal(ipcCalls.length, 2);
  assert.equal(ipcCalls[0].channel, 'terminal:write');
  assert.equal(ipcCalls[0].payload.data, 'ls\r');
  assert.equal(ipcCalls[1].channel, 'terminal:resize');
  assert.deepEqual(ipcCalls[1].payload, { termId: SESSION, rows: 48, cols: 140 });
});

runTest('handleTerminalReady flushes retained terminal size', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  seedCache({
    starting: true,
    generation: 2,
    term: { rows: 50, cols: 160 },
    desiredResize: { rows: 50, cols: 160 },
    lastResize: null,
  });
  assert.equal(handleTerminalReady(SESSION, 2), true);
  const resizes = ipcCalls.filter((call) => call.channel === 'terminal:resize');
  assert.equal(resizes.length, 1);
  assert.deepEqual(resizes[0].payload, { termId: SESSION, rows: 50, cols: 160 });
  assert.deepEqual(terminalCache.get(SESSION).lastResize, { rows: 50, cols: 160 });
});

runTest('handleTerminalReady clears idle-suspend guard after successful spawn', () => {
  terminalCache.clear();
  seedCache({ starting: true, generation: 2, suspendedByIdle: true, idleSuspendNoticeShown: true });
  assert.equal(handleTerminalReady(SESSION, 2), true);
  assert.equal(terminalCache.get(SESSION).suspendedByIdle, false);
  assert.equal(terminalCache.get(SESSION).idleSuspendNoticeShown, false);
});

runTest('flushPendingInput is a no-op while starting', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  seedCache({ starting: true, pendingInput: 'pwd' });
  flushPendingInput(SESSION);
  assert.equal(ipcCalls.length, 0);
  assert.equal(terminalCache.get(SESSION).pendingInput, 'pwd');
});

runTest('queueTerminalInput buffers without IPC when PTY is suspended', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  seedCache({ spawned: false, starting: false });
  queueTerminalInput(SESSION, 'echo');
  assert.equal(terminalCache.get(SESSION).pendingInput, 'echo');
  assert.equal(ipcCalls.length, 0);
});

runTest('canSendTerminalInput is false when PTY is not spawned', () => {
  terminalCache.clear();
  seedCache({ spawned: false, starting: false });
  assert.equal(canSendTerminalInput(SESSION), false);
});

runTest('handleTerminalReady rejects stale generation', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  seedCache({ starting: true, pendingInput: 'pwd', generation: 3 });
  assert.equal(handleTerminalReady(SESSION, 2), false);
  assert.equal(terminalCache.get(SESSION).starting, true);
  assert.equal(ipcCalls.length, 0);
});

runTest('queueTerminalInput no-ops when cache entry is missing', () => {
  terminalCache.clear();
  ipcCalls.length = 0;
  queueTerminalInput(SESSION, 'echo hi');
  assert.equal(ipcCalls.length, 0);
});

console.log('Terminal input pipeline tests passed.');