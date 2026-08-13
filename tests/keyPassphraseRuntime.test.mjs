import assert from 'node:assert/strict';
import {
  __keyPassphraseRuntimeTest,
  clearStagedKeyPassphrase,
  consumeVaultRequestedPassphrase,
  stageKeyPassphraseForNextConnect,
} from '../.tmp-agent-tests/src/features/connections/application/keyPassphraseRuntime.js';

__keyPassphraseRuntimeTest.clearAll();

stageKeyPassphraseForNextConnect('host-a', '/keys/shared', 'secret-a');
stageKeyPassphraseForNextConnect('host-b', '/keys/shared', 'secret-b');

assert.equal(
  __keyPassphraseRuntimeTest.consumeStagedPassphrase('host-a', '/keys/shared'),
  'secret-a',
);
assert.equal(
  __keyPassphraseRuntimeTest.consumeStagedPassphrase('host-a', '/keys/shared'),
  undefined,
);
assert.equal(
  __keyPassphraseRuntimeTest.consumeStagedPassphrase('host-b', '/keys/shared'),
  'secret-b',
);

stageKeyPassphraseForNextConnect('host-c', '/keys/clear-me', 'secret-c');
clearStagedKeyPassphrase('host-c', '/keys/clear-me');
assert.equal(
  __keyPassphraseRuntimeTest.consumeStagedPassphrase('host-c', '/keys/clear-me'),
  undefined,
);

__keyPassphraseRuntimeTest.vaultRequestedPassphrases.set('host-vault\0/keys/vault-me', 'vault-secret');
assert.equal(
  consumeVaultRequestedPassphrase('host-vault', '/keys/vault-me'),
  'vault-secret',
);
assert.equal(
  consumeVaultRequestedPassphrase('host-vault', '/keys/vault-me'),
  undefined,
);

__keyPassphraseRuntimeTest.clearAll();
console.log('Key passphrase runtime staging tests passed.');
