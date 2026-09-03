import assert from 'node:assert/strict';
import { resolveShellExitConnectionId } from '../.tmp-agent-tests/src/lib/terminal/shellExit.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

runTest('resolveShellExitConnectionId finds hidden split panes even without cache id', () => {
  const terminals = {
    host: [
      { id: 'term-owner' },
      { id: 'term-extra' },
    ],
    other: [{ id: 'term-other' }],
  };
  assert.equal(resolveShellExitConnectionId('term-extra', 'host', terminals), 'host');
  assert.equal(resolveShellExitConnectionId('term-extra', undefined, terminals), 'host');
  assert.equal(resolveShellExitConnectionId('term-extra', 'missing', terminals), 'host');
  assert.equal(resolveShellExitConnectionId('term-missing', 'host', terminals), undefined);
});

console.log('Shell exit connection id tests passed.');
