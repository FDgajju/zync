import assert from 'node:assert/strict';
import { matchShortcut } from '../.tmp-agent-tests/src/lib/shortcuts.js';

function keyEvent(partial) {
  return {
    key: 'a',
    code: 'KeyA',
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
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}: ${message}`);
    throw error;
  }
}

runTest('matchShortcut resolves Mod to Ctrl on non-Mac platforms', () => {
  const previous = navigator.platform;
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
  try {
    assert.equal(
      matchShortcut(keyEvent({ key: 'p', ctrlKey: true }), 'Mod+P'),
      true,
    );
    assert.equal(
      matchShortcut(keyEvent({ key: 'p', metaKey: true }), 'Mod+P'),
      false,
    );
    assert.equal(
      matchShortcut(keyEvent({ key: 'p', ctrlKey: true, shiftKey: true }), 'Mod+Shift+P'),
      true,
    );
    assert.equal(
      matchShortcut(keyEvent({ key: 'i', ctrlKey: true }), 'Mod+I'),
      true,
    );
  } finally {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: previous });
  }
});
