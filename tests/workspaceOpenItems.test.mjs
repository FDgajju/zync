import assert from 'node:assert/strict';
import { buildWorkspaceOpenItems } from '../.tmp-agent-tests/src/components/layout/workspaceOpen/buildWorkspaceOpenItems.js';
import { filterWorkspaceOpenItems, groupWorkspaceOpenItems, visibleWorkspaceOpenItems } from '../.tmp-agent-tests/src/components/layout/workspaceOpen/filterWorkspaceOpenItems.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

runTest('always includes New Shell and skips plugins', () => {
  const items = buildWorkspaceOpenItems({
    shells: [{ id: 'bash', label: 'Bash' }],
    canOpenFeature: true,
    features: [{ id: 'files', isOpen: true, isActive: false }],
  });
  assert.equal(items.some((item) => item.kind === 'new-shell'), true);
  assert.equal(items.some((item) => item.id.startsWith('plugin:')), false);
  assert.equal(items.some((item) => item.kind === 'feature' && item.featureId === 'files'), true);
});

runTest('omits feature rows when the workspace cannot open features', () => {
  const items = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: false,
    features: [{ id: 'files', isOpen: false, isActive: false }],
  });
  assert.equal(items.every((item) => item.kind !== 'feature'), true);
});

runTest('marks the active feature disabled', () => {
  const items = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: true,
    features: [{ id: 'dashboard', isOpen: true, isActive: true }],
  });
  const dashboard = items.find((item) => item.featureId === 'dashboard');
  assert.ok(dashboard);
  assert.equal(dashboard.disabled, true);
  assert.equal(dashboard.hint, 'Active');
});

runTest('root hides individual shells behind Other shells', () => {
  const items = buildWorkspaceOpenItems({
    shells: [{ id: 'pwsh', label: 'PowerShell' }, { id: 'bash', label: 'Bash' }],
    canOpenFeature: true,
    features: [],
  });
  const root = visibleWorkspaceOpenItems(items, '', 'root');
  assert.equal(root.some((item) => item.kind === 'other-shells'), true);
  assert.equal(root.some((item) => item.kind === 'shell'), false);
  assert.equal(root.some((item) => item.kind === 'feature'), true);
});

runTest('search on root still finds shells', () => {
  const items = buildWorkspaceOpenItems({
    shells: [{ id: 'pwsh', label: 'PowerShell' }],
    canOpenFeature: true,
    features: [],
  });
  const files = filterWorkspaceOpenItems(items, 'file');
  assert.equal(files.every((item) => item.label.toLowerCase().includes('file') || item.keywords.some((k) => k.includes('file'))), true);
  const found = visibleWorkspaceOpenItems(items, 'power', 'root');
  assert.equal(found.some((item) => item.kind === 'shell'), true);
  assert.equal(found.some((item) => item.kind === 'other-shells'), false);
  assert.equal(visibleWorkspaceOpenItems(items, 'zzzz', 'root').length, 0);
});

runTest('shells view lists only shells', () => {
  const items = buildWorkspaceOpenItems({
    shells: [{ id: 'pwsh', label: 'PowerShell' }],
    canOpenFeature: true,
    features: [],
  });
  const listed = visibleWorkspaceOpenItems(items, '', 'shells');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].kind, 'shell');
});

runTest('groups drop empty sections', () => {
  const items = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: false,
  });
  const groups = groupWorkspaceOpenItems(items);
  assert.deepEqual(groups.map((section) => section.group), ['create']);
});

console.log('Workspace open item tests passed.');
