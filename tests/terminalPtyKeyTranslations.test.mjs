import assert from 'node:assert/strict';
import { isCtrlSlash, ptyBytesForKeyEvent } from '../.tmp-agent-tests/src/lib/terminal/ptyKeyTranslations.js';

function keyEvent(partial) {
  return {
    type: 'keydown',
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  };
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

runTest('Ctrl+/ matches produced slash', () => {
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, key: '/', code: 'Slash' })), true);
  assert.equal(ptyBytesForKeyEvent(keyEvent({ ctrlKey: true, key: '/', code: 'Slash' })), '\x1f');
});

runTest('Ctrl+/ matches produced slash on a non-Slash physical key', () => {
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, key: '/', code: 'Minus' })), true);
  assert.equal(ptyBytesForKeyEvent(keyEvent({ ctrlKey: true, key: '/', code: 'Minus' })), '\x1f');
});

runTest('Ctrl+/ does not match physical Slash when the layout produces another character', () => {
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, key: '-', code: 'Slash' })), false);
  assert.equal(ptyBytesForKeyEvent(keyEvent({ ctrlKey: true, key: '-', code: 'Slash' })), null);
});

runTest('Ctrl+NumpadDivide still translates', () => {
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, key: '/', code: 'NumpadDivide' })), true);
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, key: 'Unidentified', code: 'NumpadDivide' })), true);
  assert.equal(
    ptyBytesForKeyEvent(keyEvent({ ctrlKey: true, key: 'Unidentified', code: 'NumpadDivide' })),
    '\x1f',
  );
});

runTest('Ctrl+/ ignores Shift/Alt/Meta', () => {
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, shiftKey: true, key: '/', code: 'Slash' })), false);
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, altKey: true, key: '/', code: 'Slash' })), false);
  assert.equal(isCtrlSlash(keyEvent({ ctrlKey: true, metaKey: true, key: '/', code: 'Slash' })), false);
});
