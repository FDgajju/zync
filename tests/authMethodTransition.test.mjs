import assert from 'node:assert/strict';
import { applyAuthMethodTransition } from '../.tmp-agent-tests/src/features/connections/domain/authMethodTransition.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest('password → key clears login password', () => {
  const next = applyAuthMethodTransition(
    { password: 'login-secret', host: 'h', privateKeyPath: '/k' },
    'password',
    'key',
  );
  assert.equal(next.password, '');
  assert.equal(next.privateKeyPath, '/k');
});

runTest('key → password clears key passphrase and path', () => {
  const next = applyAuthMethodTransition(
    { password: 'key-pass', privateKeyPath: '/k' },
    'key',
    'password',
  );
  assert.equal(next.password, '');
  assert.equal(next.privateKeyPath, undefined);
});

runTest('same method is a no-op', () => {
  const form = { password: 'keep-me' };
  const next = applyAuthMethodTransition(form, 'key', 'key');
  assert.equal(next.password, 'keep-me');
  assert.equal(next, form);
});

console.log('Auth method transition tests passed.');
