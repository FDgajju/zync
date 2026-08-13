import assert from 'node:assert/strict';
import {
  __keyPassphraseRuntimeTest,
  clearStagedKeyPassphrase,
  clearVaultRequestedPassphrase,
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

__keyPassphraseRuntimeTest.stageVaultRequestedPassphrase(
  'host-vault',
  '/keys/vault-me',
  'vault-secret',
);
assert.equal(
  consumeVaultRequestedPassphrase('host-vault', '/keys/vault-me'),
  'vault-secret',
);
assert.equal(
  consumeVaultRequestedPassphrase('host-vault', '/keys/vault-me'),
  undefined,
);

__keyPassphraseRuntimeTest.stageVaultRequestedPassphrase(
  'host-vault',
  '/keys/clear-vault',
  'vault-clear',
);
assert.equal(__keyPassphraseRuntimeTest.vaultRequestedPassphrases.size, 1);
clearVaultRequestedPassphrase('host-vault', '/keys/clear-vault');
assert.equal(
  consumeVaultRequestedPassphrase('host-vault', '/keys/clear-vault'),
  undefined,
);
assert.equal(__keyPassphraseRuntimeTest.vaultRequestedPassphrases.size, 0);

// Re-stage replaces the prior entry; clearAll drops staged vault secrets + timers.
__keyPassphraseRuntimeTest.stageVaultRequestedPassphrase(
  'host-vault',
  '/keys/replace-me',
  'first',
);
__keyPassphraseRuntimeTest.stageVaultRequestedPassphrase(
  'host-vault',
  '/keys/replace-me',
  'second',
);
assert.equal(
  consumeVaultRequestedPassphrase('host-vault', '/keys/replace-me'),
  'second',
);
assert.equal(__keyPassphraseRuntimeTest.STAGED_PASSPHRASE_TTL_MS, 30_000);

__keyPassphraseRuntimeTest.clearAll();
console.log('Key passphrase runtime staging tests passed.');
