import assert from 'node:assert/strict';
import {
  clearCancelledConnectAttempt,
  recordConnectCancellation,
  registerConnectAttempt,
} from '../.tmp-agent-tests/src/features/connections/infrastructure/connectCancelState.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest('active connect cleanup does not drop queued connect cancellation', () => {
  const pending = new Set();
  const cancelledAttempts = new Set();
  const connectionId = 'host-a';
  const attemptA = 'host-a:attempt-a';
  const attemptB = 'host-a:attempt-b';

  registerConnectAttempt({
    connectionId,
    attemptId: attemptA,
    pending,
    cancelledAttempts,
  });
  assert.equal(cancelledAttempts.has(attemptA), false);

  recordConnectCancellation({
    connectionId,
    activeAttemptId: attemptA,
    hasQueuedConnect: true,
    hasSerializedConnect: true,
    pending,
    cancelledAttempts,
  });
  assert.equal(cancelledAttempts.has(attemptA), true);
  assert.equal(pending.has(connectionId), true);

  assert.equal(clearCancelledConnectAttempt(cancelledAttempts, attemptA), true);
  assert.equal(pending.has(connectionId), true, 'queued cancel must survive active-attempt cleanup');

  const queuedWasCancelled = registerConnectAttempt({
    connectionId,
    attemptId: attemptB,
    pending,
    cancelledAttempts,
  });
  assert.equal(queuedWasCancelled, true);
  assert.equal(pending.has(connectionId), false);
  assert.equal(cancelledAttempts.has(attemptB), true);
});

runTest('cancel with no active attempt only records pending for serialized connect', () => {
  const pending = new Set();
  const cancelledAttempts = new Set();

  recordConnectCancellation({
    connectionId: 'host-b',
    activeAttemptId: undefined,
    hasQueuedConnect: false,
    hasSerializedConnect: true,
    pending,
    cancelledAttempts,
  });

  assert.equal(pending.has('host-b'), true);
  assert.equal(cancelledAttempts.size, 0);
});

console.log('Connect cancel state tests passed.');
