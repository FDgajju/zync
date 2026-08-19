import assert from 'node:assert/strict';
import {
  connectWithHostKeyVerification,
  HostKeyVerificationCancelledError,
  parseHostKeyChallenge,
} from '../.tmp-agent-tests/src/features/connections/application/hostKeyVerification.js';

const config = {
  id: 'target',
  host: 'target.example',
  port: 22,
  jump_host: {
    id: 'jump',
    host: 'jump.example',
    port: 2222,
    jump_host: null,
  },
};
const changed = {
  kind: 'changed',
  connectionId: 'jump',
  host: 'jump.example',
  port: 2222,
  algorithm: 'ssh-ed25519',
  fingerprint: 'SHA256:new-key',
};
const challengeError = new Error(`Failed to connect: ZYNC_HOST_KEY:${JSON.stringify(changed)}`);

assert.deepEqual(parseHostKeyChallenge(challengeError), changed);

let calls = 0;
const result = await connectWithHostKeyVerification(
  config,
  async approved => {
    calls += 1;
    if (calls === 1) throw challengeError;
    assert.deepEqual(approved.jump_host.host_key_approval, {
      fingerprint: changed.fingerprint,
      replace: true,
    });
    return 'connected';
  },
  async prompt => {
    assert.equal(prompt.variant, 'danger');
    assert.match(prompt.message, /man-in-the-middle/);
    assert.match(prompt.message, /SHA256:new-key/);
    return true;
  },
);
assert.equal(result, 'connected');

await assert.rejects(
  connectWithHostKeyVerification(config, async () => { throw challengeError; }, async () => false),
  HostKeyVerificationCancelledError,
);

console.log('Host key verification tests passed.');
