import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'store', 'terminalSlice.ts'),
  'utf8',
);

const termDockStart = source.indexOf('if (payload.kind === \'term\')');
const termDockEnd = source.indexOf('const targetLayout', termDockStart);
assert.ok(termDockStart >= 0 && termDockEnd > termDockStart, 'term dock branch not found');
const termDock = source.slice(termDockStart, termDockEnd);

assert.match(termDock, /sameGroupTermDock\(groups, owner, payload\.termId\)/, 'same-group shell dock must use the tested helper');
assert.match(termDock, /if \(selfDock\) return selfDock/, 'same-group shell dock must return self with no store write');
assert.doesNotMatch(termDock, /\bset\(/, 'same-group shell dock must not write paneLayouts or activeTerminalIds');

console.log('dockInSplit same-group self contract tests passed.');
