import assert from 'node:assert/strict';
import {
  buildXtermOptions,
  shouldUseWindowsLocalPtyOptions,
  TERMINAL_SCROLLBACK_ROWS,
} from '../.tmp-agent-tests/src/lib/terminal/xtermOptions.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

const baseSettings = {
  fontSize: 14,
  fontFamily: 'monospace',
  cursorStyle: 'block',
  lineHeight: 1.2,
};

runTest('buildXtermOptions keeps reflowCursorLine false', () => {
  const options = buildXtermOptions({
    settings: baseSettings,
    theme: { background: '#000' },
  });
  assert.equal(options.reflowCursorLine, false);
  assert.equal(options.cursorInactiveStyle, 'outline');
});

runTest('buildXtermOptions sets scrollback above xterm default', () => {
  const options = buildXtermOptions({
    settings: baseSettings,
    theme: { background: '#000' },
  });
  assert.equal(options.scrollback, TERMINAL_SCROLLBACK_ROWS);
  assert.ok(options.scrollback > 1000);
});

runTest('buildXtermOptions adds windowsPty for local Windows ConPTY', () => {
  const options = buildXtermOptions({
    settings: baseSettings,
    theme: { background: '#000' },
    windowsLocalPty: true,
  });
  assert.deepEqual(options.windowsPty, { backend: 'conpty' });
});

runTest('buildXtermOptions omits windowsPty for remote sessions', () => {
  const options = buildXtermOptions({
    settings: baseSettings,
    theme: { background: '#000' },
    windowsLocalPty: false,
  });
  assert.equal(options.windowsPty, undefined);
});

runTest('shouldUseWindowsLocalPtyOptions is false for SSH hosts', () => {
  assert.equal(shouldUseWindowsLocalPtyOptions('ssh_host-1'), false);
});

runTest('shouldUseWindowsLocalPtyOptions is false without window', () => {
  const previous = global.window;
  // @ts-expect-error test cleanup
  delete global.window;
  try {
    assert.equal(shouldUseWindowsLocalPtyOptions('local'), false);
  } finally {
    global.window = previous;
  }
});

console.log('Terminal xterm options tests passed.');