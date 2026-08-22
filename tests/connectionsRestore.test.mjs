import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatConnectionsRestoreSuccessMessage,
  formatDeferredVaultKeysMessage,
  connectionsRestoreArgsMatch,
  hostsOnlyConnectionsRestoreArgs,
  isConnectionsRestoreJobRunning,
  isConnectionsRestorePreviewOpen,
  localVaultRestoreState,
  normalizeConnectionsRestoreArgs,
  reportConnectionsRestoreWarnings,
  restoreVaultAction,
  vaultItemCoversAuthRef,
} from '../.tmp-agent-tests/src/vault/connectionsRestore.js';

test('normalizeConnectionsRestoreArgs applies defaults', () => {
  assert.deepEqual(normalizeConnectionsRestoreArgs(), {
    includeHostDefinitions: true,
    includeTunnels: true,
    includeHostSnippets: true,
    includeReferencedCredentials: true,
    hostLogicalIds: undefined,
  });
});

test('normalizeConnectionsRestoreArgs trims and drops empty host ids', () => {
  assert.deepEqual(
    normalizeConnectionsRestoreArgs({
      hostLogicalIds: [' host-a ', '', '  '],
    }),
    {
      includeHostDefinitions: true,
      includeTunnels: true,
      includeHostSnippets: true,
      includeReferencedCredentials: true,
      hostLogicalIds: ['host-a'],
    },
  );
});

test('formatConnectionsRestoreSuccessMessage summarizes restored domains', () => {
  const message = formatConnectionsRestoreSuccessMessage({
    syncedAt: 1,
    hosts: {
      scanned: 2,
      restored: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
      syncedAt: 1,
      credentialsRestored: 1,
      credentialsUpdated: 0,
      credentialsSkipped: 0,
      credentialsFailed: 0,
      credentialsConflicts: 0,
    },
    tunnels: {
      domain: 'tunnels',
      scanned: 1,
      restored: 1,
      updated: 0,
      skipped: 0,
      skippedOrphaned: 0,
      failed: 0,
      syncedAt: 1,
    },
    hostSnippets: {
      domain: 'snippets',
      scanned: 1,
      restored: 0,
      updated: 1,
      skipped: 0,
      skippedOrphaned: 0,
      failed: 0,
      syncedAt: 1,
    },
  });

  assert.equal(
    message,
    'Restored connections from Google (2 hosts; 1 credential; 1 tunnel; 1 host snippet).',
  );
});

test('formatConnectionsRestoreSuccessMessage reports credential-only restores', () => {
  const message = formatConnectionsRestoreSuccessMessage({
    syncedAt: 1,
    hosts: {
      scanned: 1,
      restored: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      syncedAt: 1,
      credentialsRestored: 1,
      credentialsUpdated: 0,
      credentialsSkipped: 0,
      credentialsFailed: 0,
      credentialsConflicts: 0,
    },
  });

  assert.equal(
    message,
    'Restored connections from Google (0 hosts; 1 credential).',
  );
});

test('connectionsRestoreArgsMatch compares normalized bundle options', () => {
  assert.equal(connectionsRestoreArgsMatch({}, { includeTunnels: true }), true);
  assert.equal(
    connectionsRestoreArgsMatch({ includeTunnels: true }, { includeTunnels: false }),
    false,
  );
  assert.equal(
    connectionsRestoreArgsMatch(
      { hostLogicalIds: ['b', 'a'] },
      { hostLogicalIds: ['a', 'b'] },
    ),
    true,
  );
});

test('hostsOnlyConnectionsRestoreArgs turns off referenced credentials', () => {
  const normalized = hostsOnlyConnectionsRestoreArgs({
    includeReferencedCredentials: true,
    includeTunnels: false,
    includeHostSnippets: true,
    hostLogicalIds: ['host-1'],
  });
  assert.equal(normalized.includeReferencedCredentials, false);
  assert.equal(normalized.includeTunnels, false);
  assert.equal(normalized.includeHostSnippets, true);
  assert.deepEqual(normalized.hostLogicalIds, ['host-1']);
});

test('restoreVaultAction asks to create when Drive has keys and vault is missing', () => {
  assert.equal(
    restoreVaultAction({
      referencedCredentials: 69,
      includeReferencedCredentials: true,
      vaultState: 'uninitialized',
    }),
    'create',
  );
});

test('restoreVaultAction asks to unlock when Drive has keys and vault is locked', () => {
  assert.equal(
    restoreVaultAction({
      referencedCredentials: 2,
      includeReferencedCredentials: true,
      vaultState: 'locked',
    }),
    'unlock',
  );
});

test('restoreVaultAction stays quiet when vault is unlocked or creds are excluded', () => {
  assert.equal(
    restoreVaultAction({
      referencedCredentials: 69,
      includeReferencedCredentials: true,
      vaultState: 'unlocked',
    }),
    null,
  );
  assert.equal(
    restoreVaultAction({
      referencedCredentials: 69,
      includeReferencedCredentials: false,
      vaultState: 'uninitialized',
    }),
    null,
  );
  assert.equal(
    restoreVaultAction({
      referencedCredentials: 0,
      includeReferencedCredentials: true,
      vaultState: 'uninitialized',
    }),
    null,
  );
});

test('localVaultRestoreState maps vault status', () => {
  assert.equal(localVaultRestoreState(null), 'unavailable');
  assert.equal(localVaultRestoreState({ status: 'uninitialized' }), 'uninitialized');
  assert.equal(localVaultRestoreState({ status: 'locked' }), 'locked');
  assert.equal(localVaultRestoreState({ status: 'unlocked' }), 'unlocked');
});

test('formatDeferredVaultKeysMessage is explicit', () => {
  assert.match(formatDeferredVaultKeysMessage(69), /69 vault keys stayed on Google/);
  assert.match(formatDeferredVaultKeysMessage(1), /1 vault key stayed on Google/);
  assert.match(formatDeferredVaultKeysMessage(2, 'locked'), /Unlock your Local Vault/);
  assert.match(formatDeferredVaultKeysMessage(2, 'uninitialized'), /Create a Local Vault/);
});

test('reportConnectionsRestoreWarnings respects suppressDeferredKeyToast', () => {
  const toasts = [];
  const showToast = (type, message) => {
    toasts.push({ type, message });
  };
  const result = {
    syncedAt: 1,
    hosts: {
      scanned: 1,
      restored: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      syncedAt: 1,
      credentialsRestored: 0,
      credentialsUpdated: 0,
      credentialsSkipped: 3,
      credentialsFailed: 0,
      credentialsConflicts: 0,
    },
  };
  reportConnectionsRestoreWarnings(result, showToast, { suppressDeferredKeyToast: true });
  assert.equal(toasts.some((toast) => /stayed on Google/.test(toast.message)), false);

  reportConnectionsRestoreWarnings(result, showToast);
  assert.equal(toasts.some((toast) => /stayed on Google/.test(toast.message)), true);
});

test('isConnectionsRestoreJobRunning is only true while a job is running', () => {
  assert.equal(isConnectionsRestoreJobRunning('idle'), false);
  assert.equal(isConnectionsRestoreJobRunning('preview'), false);
  assert.equal(isConnectionsRestoreJobRunning('previewing'), false);
  assert.equal(isConnectionsRestoreJobRunning('running'), true);
});

test('isConnectionsRestorePreviewOpen is only true in the preview phase', () => {
  assert.equal(isConnectionsRestorePreviewOpen('preview'), true);
  assert.equal(isConnectionsRestorePreviewOpen('idle'), false);
  assert.equal(isConnectionsRestorePreviewOpen('running'), false);
});

test('vaultItemCoversAuthRef matches item id or logical id', () => {
  const items = [{ id: 'item-1', logicalId: 'cred-1' }];
  assert.equal(vaultItemCoversAuthRef(items, { itemId: 'item-1' }), true);
  assert.equal(vaultItemCoversAuthRef(items, { credentialId: 'cred-1' }), true);
  assert.equal(vaultItemCoversAuthRef(items, { itemId: 'other', credentialId: 'missing' }), false);
  assert.equal(vaultItemCoversAuthRef(items, null), true);
});

test('formatConnectionsRestoreSuccessMessage handles empty restore', () => {
  const message = formatConnectionsRestoreSuccessMessage({
    syncedAt: 1,
    hosts: {
      scanned: 0,
      restored: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      syncedAt: 1,
      credentialsRestored: 0,
      credentialsUpdated: 0,
      credentialsSkipped: 0,
      credentialsFailed: 0,
      credentialsConflicts: 0,
    },
  });

  assert.equal(message, 'No connection changes restored from Google.');
});