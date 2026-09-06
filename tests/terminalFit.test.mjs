import assert from 'node:assert/strict';
import {
  beginPaneDividerDrag,
  beginPaneSplitIntro,
  createResizeScheduler,
  endPaneDividerDrag,
  endPaneSplitIntro,
  isPaneDividerDragging,
  isPaneSizeTransient,
} from '../.tmp-agent-tests/src/lib/terminal/terminalFit.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

function resetDrag() {
  while (isPaneDividerDragging()) endPaneDividerDrag();
}

runTest('pane divider drag depth nests and never goes negative', () => {
  resetDrag();
  assert.equal(isPaneDividerDragging(), false);
  beginPaneDividerDrag();
  assert.equal(isPaneDividerDragging(), true);
  beginPaneDividerDrag();
  endPaneDividerDrag();
  assert.equal(isPaneDividerDragging(), true);
  endPaneDividerDrag();
  assert.equal(isPaneDividerDragging(), false);
  endPaneDividerDrag();
  assert.equal(isPaneDividerDragging(), false);
});

runTest('split intro shares the pane-size-transient hold with divider drag', () => {
  resetDrag();
  beginPaneSplitIntro();
  assert.equal(isPaneSizeTransient(), true);
  assert.equal(isPaneDividerDragging(), true);
  assert.equal(endPaneSplitIntro(), true);
  assert.equal(isPaneSizeTransient(), false);
  beginPaneSplitIntro();
  beginPaneDividerDrag();
  assert.equal(endPaneSplitIntro(), false);
  assert.equal(isPaneSizeTransient(), true);
  endPaneDividerDrag();
  assert.equal(isPaneSizeTransient(), false);
});

runTest('resize scheduler forwards syncBackend on immediate runs', () => {
  const calls = [];
  const scheduler = createResizeScheduler((opts) => calls.push(opts), 60);
  scheduler.schedule({ immediate: true, syncBackend: false });
  assert.deepEqual(calls, [{ forceSync: false, syncBackend: false }]);
  scheduler.schedule({ immediate: true, forceSync: true });
  assert.equal(calls[1].forceSync, true);
  assert.equal(calls[1].syncBackend, true);
  scheduler.cancel();
});

console.log('Terminal fit tests passed.');
