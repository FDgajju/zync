import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.cwd(), 'src', 'components', 'EditorPluginFrame.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

const iframeSandbox = source.match(/<iframe[\s\S]*?sandbox="([^"]+)"/i)?.[1];
assert.equal(iframeSandbox, 'allow-scripts');
assert.equal(iframeSandbox.includes('allow-same-origin'), false);

console.log('Editor plugin iframe isolation test passed.');
