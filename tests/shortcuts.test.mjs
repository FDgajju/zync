import assert from 'node:assert/strict';
import { formatShortcutLabel, matchShortcut } from '../.tmp-agent-tests/src/lib/shortcuts.js';

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { platform: 'Win32' };
}

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

runTest('formatShortcutLabel maps Mod to Ctrl on Windows and Command on macOS', () => {
  assert.equal(formatShortcutLabel('Mod+T', false), 'Ctrl+T');
  assert.equal(formatShortcutLabel('Mod+T', true), '⌘T');
  assert.equal(formatShortcutLabel('Ctrl+T', true), '⌃T');
});

runTest('matchShortcut accepts Ctrl+Shift+Arrow chords for split panes', () => {
  assert.equal(
    matchShortcut(
      keyEvent({ key: 'ArrowRight', ctrlKey: true, shiftKey: true }),
      'Ctrl+Shift+ArrowRight',
    ),
    true,
  );
  assert.equal(
    matchShortcut(
      keyEvent({ key: 'ArrowDown', ctrlKey: true, shiftKey: true }),
      'Ctrl+Shift+ArrowDown',
    ),
    true,
  );
  assert.equal(
    matchShortcut(keyEvent({ key: 'ArrowRight', ctrlKey: true }), 'Ctrl+Shift+ArrowRight'),
    false,
  );
});

runTest('formatShortcutLabel shortens arrow key names', () => {
  assert.equal(formatShortcutLabel('Ctrl+Shift+ArrowRight', false), 'Ctrl+Shift+Right');
  assert.equal(formatShortcutLabel('Ctrl+Shift+ArrowDown', true), '⌃⇧Down');
});

runTest('matchShortcut accepts Ctrl+Alt+Arrow chords for pane focus', () => {
  assert.equal(
    matchShortcut(
      keyEvent({ key: 'ArrowRight', ctrlKey: true, altKey: true }),
      'Ctrl+Alt+ArrowRight',
    ),
    true,
  );
  assert.equal(
    matchShortcut(
      keyEvent({ key: 'ArrowLeft', ctrlKey: true, altKey: true }),
      'Ctrl+Alt+ArrowLeft',
    ),
    true,
  );
  assert.equal(
    matchShortcut(
      keyEvent({ key: 'ArrowRight', ctrlKey: true, shiftKey: true }),
      'Ctrl+Alt+ArrowRight',
    ),
    false,
  );
  assert.equal(
    matchShortcut(
      keyEvent({ key: 'ArrowRight', ctrlKey: true, altKey: true, shiftKey: true }),
      'Ctrl+Alt+ArrowRight',
    ),
    false,
  );
  assert.equal(formatShortcutLabel('Ctrl+Alt+ArrowRight', false), 'Ctrl+Alt+Right');
});
