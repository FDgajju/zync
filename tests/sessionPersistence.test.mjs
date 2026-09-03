import assert from 'node:assert/strict';
import { buildSessionData, MAX_TABS_PER_SCOPE } from '../.tmp-agent-tests/src/store/sessionPersistence.js';
import { singlePane, splitPane } from '../.tmp-agent-tests/src/lib/paneLayout/index.js';
import { DEFAULT_VAULT_PROFILE_ID } from '../.tmp-agent-tests/src/vault/profileTypes.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeConnectionTab(id = 'tab-1') {
  return { id, type: 'connection', title: 'Prod', connectionId: 'conn-1', view: 'terminal' };
}

function makeVaultTab(id = 'vault-tab', profile = DEFAULT_VAULT_PROFILE_ID) {
  return { id, type: 'vault', title: 'Vault', vaultProfileId: profile, view: 'terminal' };
}

function makeSettingsTab(id = 'settings-tab') {
  return { id, type: 'settings', title: 'Settings', view: 'terminal' };
}

function makeTerminal(index) {
  return {
    id: `term-${index}`,
    title: `Terminal ${index}`,
    lastKnownCwd: `/workspace/${index}`,
    initialPath: `/start/${index}`,
    isSynced: index % 2 === 0,
  };
}

runTest('buildSessionData preserves active tab and connection IDs', () => {
  const data = buildSessionData({
    activeTabId: 'tab-1',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab()],
    terminals: {},
    activeTerminalIds: {},
  });

  assert.equal(data.activeTabId, 'tab-1');
  assert.equal(data.activeConnectionId, 'conn-1');
});

runTest('buildSessionData excludes settings tabs and clears invalid activeTabId', () => {
  const data = buildSessionData({
    activeTabId: 'settings-tab',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab(), makeSettingsTab()],
    terminals: {},
    activeTerminalIds: {},
  });

  assert.deepEqual(
    data.tabs.map((tab) => tab.tabType),
    ['connection'],
  );
  assert.equal(data.activeTabId, undefined);
});

runTest('buildSessionData truncates terminals and maps snapshot fields', () => {
  const data = buildSessionData({
    activeTabId: 'tab-1',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab()],
    terminals: {
      conn1: Array.from({ length: MAX_TABS_PER_SCOPE + 4 }, (_, index) => makeTerminal(index)),
    },
    activeTerminalIds: {},
  });

  assert.equal(data.terminals.conn1.length, MAX_TABS_PER_SCOPE);
  assert.deepEqual(data.terminals.conn1[0], {
    id: 'term-0',
    title: 'Terminal 0',
    cwd: '/workspace/0',
    initialPath: '/start/0',
    isSynced: true,
  });
  assert.equal(data.terminals.conn1[MAX_TABS_PER_SCOPE - 1].id, `term-${MAX_TABS_PER_SCOPE - 1}`);
});

runTest('buildSessionData filters active terminal IDs to kept terminals only', () => {
  const data = buildSessionData({
    activeTabId: 'tab-1',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab()],
    terminals: {
      conn1: Array.from({ length: MAX_TABS_PER_SCOPE + 4 }, (_, index) => makeTerminal(index)),
      local: [makeTerminal(0)],
    },
    activeTerminalIds: {
      conn1: `term-${MAX_TABS_PER_SCOPE + 1}`,
      local: 'term-0',
      orphan: 'term-x',
      empty: null,
    },
  });

  assert.deepEqual(data.activeTerminalIds, {
    local: 'term-0',
  });
});

runTest('buildSessionData preserves vault tab profile metadata', () => {
  const defaultProfileData = buildSessionData({
    activeTabId: 'vault-tab',
    activeConnectionId: null,
    tabs: [makeVaultTab()],
    terminals: {},
    activeTerminalIds: {},
  });

  assert.equal(defaultProfileData.tabs.length, 1);
  assert.equal(defaultProfileData.tabs[0].tabType, 'vault');
  assert.equal(defaultProfileData.tabs[0].vaultProfileId, DEFAULT_VAULT_PROFILE_ID);

  const customProfileData = buildSessionData({
    activeTabId: 'vault-tab',
    activeConnectionId: null,
    tabs: [makeVaultTab('vault-tab', 'custom-profile')],
    terminals: {},
    activeTerminalIds: {},
  });
  assert.equal(customProfileData.tabs[0].vaultProfileId, 'custom-profile');
});

runTest('buildSessionData paneLayouts ignore tabs beyond MAX_TABS_PER_SCOPE', () => {
  const tabs = Array.from({ length: MAX_TABS_PER_SCOPE + 2 }, (_, index) => makeTerminal(index));
  const overflowId = `term-${MAX_TABS_PER_SCOPE}`;
  const split = splitPane(singlePane('term-0', 'pane-a'), 'pane-a', 'vertical', { kind: 'term', termId: overflowId });
  assert.equal(split.ok, true);
  if (!split.ok) return;

  const data = buildSessionData({
    activeTabId: 'tab-1',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab()],
    terminals: { conn1: tabs },
    activeTerminalIds: { conn1: 'term-0' },
    paneLayouts: { conn1: { 'term-0': split.layout } },
  });

  assert.equal(data.terminals.conn1.some((tab) => tab.id === overflowId), false);
  assert.equal(data.paneLayouts.conn1, undefined);
});

runTest('buildSessionData drops hidden split panes whose owner was truncated', () => {
  const visibleTabs = Array.from({ length: MAX_TABS_PER_SCOPE + 1 }, (_, index) => makeTerminal(index));
  const overflowOwner = `term-${MAX_TABS_PER_SCOPE}`;
  const hiddenChild = {
    ...makeTerminal(99),
    id: 'term-hidden',
    tabVisible: false,
  };
  const keptSplit = splitPane(singlePane('term-0', 'pane-a'), 'pane-a', 'vertical', { kind: 'term', termId: 'term-kept-hidden' });
  const overflowSplit = splitPane(singlePane(overflowOwner, 'pane-b'), 'pane-b', 'vertical', { kind: 'term', termId: 'term-hidden' });
  assert.equal(keptSplit.ok && overflowSplit.ok, true);
  if (!keptSplit.ok || !overflowSplit.ok) return;

  const data = buildSessionData({
    activeTabId: 'tab-1',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab()],
    terminals: {
      conn1: [
        ...visibleTabs,
        { ...makeTerminal(98), id: 'term-kept-hidden', tabVisible: false },
        hiddenChild,
      ],
    },
    activeTerminalIds: { conn1: 'term-0' },
    paneLayouts: {
      conn1: {
        'term-0': keptSplit.layout,
        [overflowOwner]: overflowSplit.layout,
      },
    },
  });

  assert.equal(data.terminals.conn1.some((tab) => tab.id === 'term-kept-hidden'), true);
  assert.equal(data.terminals.conn1.some((tab) => tab.id === 'term-hidden'), false);
  assert.ok(data.paneLayouts.conn1?.['term-0']);
  assert.equal(data.paneLayouts.conn1?.[overflowOwner], undefined);
  assert.ok(data.terminals.conn1.length <= MAX_TABS_PER_SCOPE);
});

runTest('buildSessionData keeps pane-referenced hidden tabs without exceeding the cap', () => {
  const owner = makeTerminal(0);
  const hiddenA = { ...makeTerminal(101), id: 'term-hidden-a', tabVisible: false };
  const hiddenB = { ...makeTerminal(102), id: 'term-hidden-b', tabVisible: false };
  const first = splitPane(singlePane(owner.id, 'pane-a'), 'pane-a', 'vertical', { kind: 'term', termId: hiddenA.id });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const nested = splitPane(first.layout, first.layout.root.children[1].id, 'horizontal', { kind: 'term', termId: hiddenB.id });
  assert.equal(nested.ok, true);
  if (!nested.ok) return;

  const rest = Array.from({ length: MAX_TABS_PER_SCOPE - 1 }, (_, index) => makeTerminal(index + 1));
  const data = buildSessionData({
    activeTabId: 'tab-1',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab()],
    terminals: { conn1: [owner, ...rest, hiddenA, hiddenB] },
    activeTerminalIds: { conn1: owner.id },
    paneLayouts: { conn1: { [owner.id]: nested.layout } },
  });

  assert.equal(data.terminals.conn1.length, MAX_TABS_PER_SCOPE);
  assert.equal(data.terminals.conn1.filter((tab) => tab.tabVisible === false).length, 2);
  assert.equal(data.terminals.conn1.some((tab) => tab.id === hiddenA.id), true);
  assert.equal(data.terminals.conn1.some((tab) => tab.id === hiddenB.id), true);
  assert.ok(data.paneLayouts.conn1?.[owner.id]);
  assert.equal(data.terminals.conn1.some((tab) => tab.id === `term-${MAX_TABS_PER_SCOPE - 1}`), false);
});

runTest('buildSessionData keeps a split owner and drops extras that cannot fit', () => {
  const singles = Array.from({ length: MAX_TABS_PER_SCOPE - 1 }, (_, index) => makeTerminal(index));
  const owner = makeTerminal(MAX_TABS_PER_SCOPE - 1);
  const hidden = { ...makeTerminal(200), id: 'term-late-hidden', tabVisible: false };
  const split = splitPane(singlePane(owner.id, 'pane-z'), 'pane-z', 'vertical', { kind: 'term', termId: hidden.id });
  assert.equal(split.ok, true);
  if (!split.ok) return;

  const data = buildSessionData({
    activeTabId: 'tab-1',
    activeConnectionId: 'conn-1',
    tabs: [makeConnectionTab()],
    terminals: { conn1: [...singles, owner, hidden] },
    activeTerminalIds: { conn1: owner.id },
    paneLayouts: { conn1: { [owner.id]: split.layout } },
  });

  assert.equal(data.terminals.conn1.length, MAX_TABS_PER_SCOPE);
  assert.equal(data.terminals.conn1.some((tab) => tab.id === owner.id), true);
  assert.equal(data.terminals.conn1.some((tab) => tab.id === hidden.id), false);
  assert.equal(data.paneLayouts.conn1, undefined);
});

console.log('Session persistence tests passed.');
