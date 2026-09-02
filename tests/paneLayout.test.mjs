import assert from 'node:assert/strict';
import {
  canSplit,
  dropTerm,
  focusPane,
  isSplitLayout,
  leafCount,
  parsePaneLayout,
  sanitizePaneLayout,
  selectTerm,
  setSplitSizes,
  singlePane,
  snapshotPaneLayouts,
  splitPane,
  unsplitPane,
  visibleTermIds,
  MAX_PANE_NESTING,
  MAX_VISIBLE_PANES,
} from '../.tmp-agent-tests/src/lib/paneLayout/index.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

runTest('single pane is not a split', () => {
  const layout = singlePane('term-a', 'pane-a');
  assert.equal(leafCount(layout.root), 1);
  assert.equal(isSplitLayout(layout), false);
  assert.deepEqual(visibleTermIds(layout), ['term-a']);
  assert.equal(canSplit(layout), true);
});

runTest('split adds a second leaf and respects cap', () => {
  const base = singlePane('term-a', 'pane-a');
  const split = splitPane(base, 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  assert.equal(split.ok, true);
  if (!split.ok) return;
  assert.equal(leafCount(split.layout.root), 2);
  assert.equal(isSplitLayout(split.layout), true);
  assert.equal(canSplit(split.layout), MAX_VISIBLE_PANES > 2);
  const again = splitPane(split.layout, split.layout.activePaneId, 'horizontal', { kind: 'term', termId: 'term-c' });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.reason, 'cap');
});

runTest('unsplit keeps the other shell as a tab-ready leaf', () => {
  const base = singlePane('term-a', 'pane-a');
  const split = splitPane(base, 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  assert.equal(split.ok, true);
  if (!split.ok) return;
  const otherId = visibleTermIds(split.layout).find((id) => id === 'term-b');
  const bLeaf = split.layout.root.type === 'split' ? split.layout.root.children[1] : null;
  assert.ok(bLeaf && bLeaf.type === 'pane');
  const next = unsplitPane(split.layout, bLeaf.id);
  assert.equal(isSplitLayout(next), false);
  assert.deepEqual(visibleTermIds(next), ['term-a']);
  assert.equal(otherId, 'term-b');
});

runTest('selectTerm focuses an on-screen shell or replaces the active pane', () => {
  const base = singlePane('term-a', 'pane-a');
  const split = splitPane(base, 'pane-a', 'horizontal', { kind: 'term', termId: 'term-b' });
  assert.equal(split.ok, true);
  if (!split.ok) return;
  const focusedB = selectTerm(split.layout, 'term-b');
  const focusedLeaf = focusedB.root.type === 'split'
    ? focusedB.root.children.find((child) => child.type === 'pane' && child.content.termId === 'term-b')
    : null;
  assert.equal(focusedB.activePaneId, focusedLeaf?.id);
  const replaced = selectTerm(split.layout, 'term-c');
  assert.ok(visibleTermIds(replaced).includes('term-c'));
  assert.equal(visibleTermIds(replaced).includes('term-a') || visibleTermIds(replaced).includes('term-b'), true);
  assert.equal(leafCount(replaced.root), 2);
});

runTest('dropTerm unsplits when a visible shell is closed', () => {
  const base = singlePane('term-a', 'pane-a');
  const split = splitPane(base, 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  assert.equal(split.ok, true);
  if (!split.ok) return;
  const afterB = dropTerm(split.layout, 'term-b');
  assert.ok(afterB);
  assert.equal(isSplitLayout(afterB), false);
  assert.deepEqual(visibleTermIds(afterB), ['term-a']);
  assert.equal(dropTerm(afterB, 'term-a'), null);
});

runTest('sanitize drops missing term ids', () => {
  const base = singlePane('term-a', 'pane-a');
  const split = splitPane(base, 'pane-a', 'vertical', { kind: 'term', termId: 'gone' });
  assert.equal(split.ok, true);
  if (!split.ok) return;
  const clean = sanitizePaneLayout(split.layout, new Set(['term-a']));
  assert.ok(clean);
  assert.deepEqual(visibleTermIds(clean), ['term-a']);
  assert.equal(parsePaneLayout({ nope: true }, new Set(['term-a'])), null);
});

runTest('setSplitSizes clamps so neither pane collapses', () => {
  const base = singlePane('term-a', 'pane-a');
  const split = splitPane(base, 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  assert.equal(split.ok, true);
  if (!split.ok) return;
  const resized = setSplitSizes(split.layout, split.layout.root.id, [0.01, 0.99]);
  assert.equal(resized.root.type, 'split');
  if (resized.root.type !== 'split') return;
  assert.ok(resized.root.sizes[0] >= 0.2);
  assert.ok(resized.root.sizes[1] >= 0.2);
});

runTest('focusPane ignores unknown ids', () => {
  const layout = singlePane('term-a', 'pane-a');
  assert.equal(focusPane(layout, 'missing').activePaneId, 'pane-a');
});

runTest('parsePaneLayout rejects more leaves than MAX_VISIBLE_PANES', () => {
  const raw = {
    version: 1,
    activePaneId: 'p1',
    root: {
      type: 'split',
      id: 's1',
      direction: 'vertical',
      sizes: [0.5, 0.5],
      children: [
        { type: 'pane', id: 'p1', content: { kind: 'term', termId: 'a' } },
        {
          type: 'split',
          id: 's2',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            { type: 'pane', id: 'p2', content: { kind: 'term', termId: 'b' } },
            { type: 'pane', id: 'p3', content: { kind: 'term', termId: 'c' } },
          ],
        },
      ],
    },
  };
  assert.equal(parsePaneLayout(raw, new Set(['a', 'b', 'c'])), null);
});

runTest('parsePaneLayout rejects trees deeper than MAX_PANE_NESTING', () => {
  const leaf = (id) => ({ type: 'pane', id: `p-${id}`, content: { kind: 'term', termId: `t-${id}` } });
  let node = leaf(0);
  for (let i = 1; i <= MAX_PANE_NESTING + 2; i += 1) {
    node = {
      type: 'split',
      id: `s-${i}`,
      direction: 'vertical',
      sizes: [0.5, 0.5],
      children: [node, leaf(i)],
    };
  }
  assert.equal(parsePaneLayout({ version: 1, activePaneId: 'p-0', root: node }, new Set(['t-0'])), null);
});

runTest('snapshot keeps only real splits', () => {
  const split = splitPane(singlePane('term-a', 'pane-a'), 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  assert.equal(split.ok, true);
  if (!split.ok) return;
  const snapped = snapshotPaneLayouts(
    { host: split.layout, local: singlePane('term-z', 'pane-z') },
    { host: [{ id: 'term-a' }, { id: 'term-b' }], local: [{ id: 'term-z' }] },
  );
  assert.ok(snapped.host);
  assert.equal(snapped.local, undefined);
});
