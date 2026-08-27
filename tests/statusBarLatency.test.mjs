import assert from 'node:assert/strict';
import {
  formatConnectionLatency,
  formatConnectionLatencyParts,
  latencyTone,
  parseLatencyRttMs,
  shouldMeasureConnectionLatency,
  smoothLatencySample,
} from '../.tmp-agent-tests/src/features/statusBar/latency.js';
import { normalizeStatusBarSettings } from '../.tmp-agent-tests/src/features/statusBar/settings.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

runTest('normalizeStatusBarSettings defaults to showing latency', () => {
  assert.deepEqual(normalizeStatusBarSettings(undefined), { showConnectionLatency: true });
  assert.deepEqual(normalizeStatusBarSettings({}), { showConnectionLatency: true });
});

runTest('normalizeStatusBarSettings respects explicit false', () => {
  assert.deepEqual(normalizeStatusBarSettings({ showConnectionLatency: false }), {
    showConnectionLatency: false,
  });
});

runTest('shouldMeasureConnectionLatency skips local and offline', () => {
  assert.equal(shouldMeasureConnectionLatency({
    connectionId: 'host-1',
    enabled: true,
    isLive: true,
  }), true);
  assert.equal(shouldMeasureConnectionLatency({
    connectionId: 'local',
    enabled: true,
    isLive: true,
  }), false);
  assert.equal(shouldMeasureConnectionLatency({
    connectionId: 'host-1',
    enabled: false,
    isLive: true,
  }), false);
  assert.equal(shouldMeasureConnectionLatency({
    connectionId: 'host-1',
    enabled: true,
    isLive: false,
  }), false);
});

runTest('parseLatencyRttMs reads camelCase payload and rejects junk', () => {
  assert.equal(parseLatencyRttMs({ connectionId: 'h', rttMs: 42.6 }), 43);
  assert.equal(parseLatencyRttMs(12), 12);
  assert.equal(parseLatencyRttMs({ rttMs: -1 }), null);
  assert.equal(parseLatencyRttMs({ rttMs: 'nope' }), null);
  assert.equal(parseLatencyRttMs(null), null);
});

runTest('smoothLatencySample uses first sample then blends', () => {
  assert.equal(smoothLatencySample(null, 40), 40);
  assert.equal(smoothLatencySample(100, 0), 65);
});

runTest('latencyTone buckets good / ok / high', () => {
  assert.equal(latencyTone(20), 'good');
  assert.equal(latencyTone(120), 'ok');
  assert.equal(latencyTone(400), 'high');
});

runTest('formatConnectionLatency uses compact units', () => {
  assert.equal(formatConnectionLatency(42), '42ms');
  assert.deepEqual(formatConnectionLatencyParts(42), { value: '42', unit: 'ms' });
  assert.equal(formatConnectionLatency(9999), '9999ms');
  assert.equal(formatConnectionLatency(10_000), '10.0s');
  assert.deepEqual(formatConnectionLatencyParts(10_000), { value: '10.0', unit: 's' });
});

console.log('Status bar latency tests passed.');
