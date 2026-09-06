import assert from 'node:assert/strict';
import { buildWorkspaceOpenItems } from '../.tmp-agent-tests/src/components/layout/workspaceOpen/buildWorkspaceOpenItems.js';
import { filterWorkspaceOpenItems, groupWorkspaceOpenItems, visibleWorkspaceOpenItems, workspaceOpenEscapeAction } from '../.tmp-agent-tests/src/components/layout/workspaceOpen/filterWorkspaceOpenItems.js';

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
  assert.equal(files.some((item) => item.id === 'feature:files'), true);
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

runTest('Escape goes back from Other shells and closes on root', () => {
  assert.equal(workspaceOpenEscapeAction('shells'), 'back');
  assert.equal(workspaceOpenEscapeAction('root'), 'close');
});

runTest('groups drop empty sections', () => {
  const items = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: false,
  });
  const groups = groupWorkspaceOpenItems(items);
  assert.deepEqual(groups.map((section) => section.group), ['create']);
});

runTest('includes Files in split next to full-view Files', () => {
  const items = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: true,
    features: [{ id: 'files', isOpen: false, isActive: false }],
    splitFeatures: [{ id: 'files', isOpen: false, canOpen: true }],
  });
  assert.equal(items.some((item) => item.kind === 'feature' && item.featureId === 'files'), true);
  const split = items.find((item) => item.kind === 'split-feature' && item.featureId === 'files');
  assert.ok(split);
  assert.equal(split.disabled, false);
  assert.equal(split.label, 'Files in split');
  assert.equal(split.keywords.includes('files in split'), true);
  const dashboardSplit = items.find((item) => item.kind === 'split-feature' && item.featureId === 'dashboard');
  assert.ok(dashboardSplit);
  assert.equal(dashboardSplit.keywords.includes('dashboard in split'), true);
  assert.equal(dashboardSplit.keywords.includes('files in split'), false);
  assert.equal(items.some((item) => item.kind === 'split-feature' && item.featureId === 'dashboard'), true);
  assert.equal(items.some((item) => item.kind === 'split-feature' && item.featureId === 'port-forwarding'), true);
  assert.equal(items.some((item) => item.kind === 'split-feature' && item.featureId === 'snippets'), true);
});

runTest('disables Files in split at the pane cap and marks it when already open', () => {
  const capped = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: true,
    splitFeatures: [{ id: 'files', isOpen: false, canOpen: false }],
  }).find((item) => item.kind === 'split-feature');
  assert.ok(capped);
  assert.equal(capped.disabled, true);
  assert.equal(capped.hint, '4 pane limit');

  const open = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: true,
    splitFeatures: [{ id: 'files', isOpen: true, canOpen: false }],
  }).find((item) => item.kind === 'split-feature');
  assert.ok(open);
  assert.equal(open.disabled, false);
  assert.equal(open.hint, 'In split');
});

runTest('omits Files in split when the workspace cannot open features', () => {
  const items = buildWorkspaceOpenItems({
    shells: [],
    canOpenFeature: false,
    splitFeatures: [{ id: 'files', isOpen: false, canOpen: true }],
  });
  assert.equal(items.every((item) => item.kind !== 'split-feature'), true);
});

console.log('Workspace open item tests passed.');
