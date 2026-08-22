import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMissingVaultCredentialError,
  isVaultAccessError,
  isVaultLockedError,
  isVaultUninitializedError,
} from '../.tmp-agent-tests/src/vault/vaultUnlockPrompt.js';

test('isVaultAccessError covers locked and uninitialized', () => {
  assert.equal(isVaultLockedError('[vault_locked] Unlock the local vault'), true);
  assert.equal(isVaultUninitializedError('[vault_uninitialized] Initialize the local vault'), true);
  assert.equal(isVaultUninitializedError('Vault is not initialized'), true);
  assert.equal(isVaultAccessError('Vault is locked'), true);
  assert.equal(isVaultAccessError('Vault is not initialized'), true);
  assert.equal(isVaultAccessError('authentication failed'), false);
});

test('isMissingVaultCredentialError matches vault record misses', () => {
  assert.equal(isMissingVaultCredentialError('[vault_credential_missing] Record not found: abc'), true);
  assert.equal(isMissingVaultCredentialError('Vault record not found: abc'), true);
  assert.equal(isMissingVaultCredentialError("relink by credentialId 'x' failed"), true);
  assert.equal(isMissingVaultCredentialError('Record not found: host-row'), false);
  assert.equal(isMissingVaultCredentialError('Connection refused'), false);
});
