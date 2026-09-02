import assert from 'node:assert/strict';
import {
  canSplit,
  dropTerm,
  focusPane,
  isSplitLayout,
  leafCount,
  parsePaneLayout,
  parsePaneLayoutGroups,
  detachTermFromGroups,
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

runTest('split nests until the visible-pane cap', () => {
  let layout = singlePane('term-a', 'pane-a');
  for (let i = 1; i < MAX_VISIBLE_PANES; i += 1) {
    const target = layout.activePaneId;
    const result = splitPane(layout, target, i % 2 === 0 ? 'horizontal' : 'vertical', {
      kind: 'term',
      termId: `term-${String.fromCharCode(97 + i)}`,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    layout = result.layout;
  }
  assert.equal(leafCount(layout.root), MAX_VISIBLE_PANES);
  assert.equal(canSplit(layout), false);
  const again = splitPane(layout, layout.activePaneId, 'horizontal', { kind: 'term', termId: 'term-z' });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.reason, 'cap');
});

runTest('unsplit of a nested pane keeps the rest of the tree and focuses the sibling', () => {
  const first = splitPane(singlePane('term-a', 'pane-a'), 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const bLeaf = first.layout.root.type === 'split' ? first.layout.root.children[1] : null;
  assert.ok(bLeaf && bLeaf.type === 'pane');
  const nested = splitPane(first.layout, bLeaf.id, 'horizontal', { kind: 'term', termId: 'term-c' });
  assert.equal(nested.ok, true);
  if (!nested.ok) return;
  assert.equal(leafCount(nested.layout.root), 3);
  const cLeaf = nested.layout.root.type === 'split' ? nested.layout.root.children[1] : null;
  const cPane = cLeaf && cLeaf.type === 'split' ? cLeaf.children[1] : null;
  assert.ok(cPane && cPane.type === 'pane');
  const focused = focusPane(nested.layout, cPane.id);
  const next = unsplitPane(focused, cPane.id);
  assert.equal(leafCount(next.root), 2);
  assert.equal(isSplitLayout(next), true);
  assert.deepEqual(visibleTermIds(next).sort(), ['term-a', 'term-b']);
  assert.equal(next.activePaneId, bLeaf.id);
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
  const leaf = (id) => ({ type: 'pane', id: `p-${id}`, content: { kind: 'term', termId: id } });
  const split = (id, left, right) => ({
    type: 'split',
    id: `s-${id}`,
    direction: 'vertical',
    sizes: [0.5, 0.5],
    children: [left, right],
  });
  const raw = {
    version: 1,
    activePaneId: 'p-a',
    root: split('1', leaf('a'), split('2', leaf('b'), split('3', leaf('c'), split('4', leaf('d'), leaf('e'))))),
  };
  assert.equal(parsePaneLayout(raw, new Set(['a', 'b', 'c', 'd', 'e'])), null);
  const three = {
    version: 1,
    activePaneId: 'p-a',
    root: split('1', leaf('a'), split('2', leaf('b'), leaf('c'))),
  };
  assert.ok(parsePaneLayout(three, new Set(['a', 'b', 'c'])));
});

runTest('parsePaneLayout normalizes valid sizes and falls back when persisted sizes are invalid', () => {
  const leaf = (id) => ({ type: 'pane', id: `p-${id}`, content: { kind: 'term', termId: id } });
  const raw = (sizes) => ({
    version: 1,
    activePaneId: 'p-a',
    root: {
      type: 'split',
      id: 's-1',
      direction: 'vertical',
      sizes,
      children: [leaf('a'), leaf('b')],
    },
  });
  const known = new Set(['a', 'b']);

  const ok = parsePaneLayout(raw([0.6, 0.4]), known);
  assert.ok(ok);
  assert.equal(ok.root.type, 'split');
  if (ok.root.type !== 'split') return;
  assert.equal(ok.root.sizes[0], 0.6);
  assert.equal(ok.root.sizes[1], 0.4);

  for (const sizes of [undefined, [0, 1], [NaN, 0.5], [-1, 2], [1], 'nope']) {
    const parsed = parsePaneLayout(raw(sizes), known);
    assert.ok(parsed);
    assert.equal(parsed.root.type, 'split');
    if (parsed.root.type !== 'split') return;
    assert.deepEqual(parsed.root.sizes, [0.5, 0.5]);
  }

  const clamped = parsePaneLayout(raw([0.01, 0.99]), known);
  assert.ok(clamped);
  assert.equal(clamped.root.type, 'split');
  if (clamped.root.type !== 'split') return;
  assert.ok(clamped.root.sizes[0] >= 0.2);
  assert.ok(clamped.root.sizes[1] >= 0.2);
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

runTest('parsePaneLayoutGroups keeps disjoint owners and drops overlapping or ownerless trees', () => {
  const ab = splitPane(singlePane('term-a', 'pane-a'), 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  const cd = splitPane(singlePane('term-c', 'pane-c'), 'pane-c', 'horizontal', { kind: 'term', termId: 'term-d' });
  const cb = splitPane(singlePane('term-c', 'pane-c'), 'pane-c', 'horizontal', { kind: 'term', termId: 'term-b' });
  assert.equal(ab.ok && cd.ok && cb.ok, true);
  if (!ab.ok || !cd.ok || !cb.ok) return;

  const known = new Set(['term-a', 'term-b', 'term-c', 'term-d', 'term-z']);
  const ok = parsePaneLayoutGroups(
    { 'term-a': ab.layout, 'term-c': cd.layout },
    known,
  );
  assert.ok(ok['term-a']);
  assert.ok(ok['term-c']);

  const overlap = parsePaneLayoutGroups(
    { 'term-a': ab.layout, 'term-c': cb.layout },
    known,
  );
  assert.ok(overlap['term-a']);
  assert.equal(overlap['term-c'], undefined);

  const ownerless = parsePaneLayoutGroups(
    { 'term-z': ab.layout },
    known,
  );
  assert.equal(ownerless['term-z'], undefined);
});

runTest('detachTermFromGroups drops one pane and keeps the rest of the tab', () => {
  const first = splitPane(singlePane('term-a', 'pane-a'), 'pane-a', 'vertical', { kind: 'term', termId: 'term-b' });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const bLeaf = first.layout.root.type === 'split' ? first.layout.root.children[1] : null;
  assert.ok(bLeaf && bLeaf.type === 'pane');
  const nested = splitPane(first.layout, bLeaf.id, 'horizontal', { kind: 'term', termId: 'term-c' });
  assert.equal(nested.ok, true);
  if (!nested.ok) return;

  const extraGone = detachTermFromGroups({ 'term-a': nested.layout }, 'term-c');
  assert.ok(extraGone.next?.['term-a']);
  assert.deepEqual(extraGone.remainingIds.sort(), ['term-a', 'term-b']);
  assert.equal(extraGone.nextOwner, 'term-a');

  const ownerGone = detachTermFromGroups({ 'term-a': nested.layout }, 'term-a');
  assert.equal(ownerGone.next?.['term-a'], undefined);
  assert.ok(ownerGone.next?.[ownerGone.nextOwner ?? '']);
  assert.equal(ownerGone.remainingIds.includes('term-a'), false);
  assert.equal(ownerGone.remainingIds.length, 2);

  const lastExtra = detachTermFromGroups({ 'term-a': first.layout }, 'term-b');
  assert.equal(lastExtra.next, undefined);
  assert.deepEqual(lastExtra.remainingIds, ['term-a']);
  assert.equal(lastExtra.nextOwner, 'term-a');
});
