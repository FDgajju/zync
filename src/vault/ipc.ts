import { invoke } from '@tauri-apps/api/core';

import type { CredentialEnvelope } from './credentialTypes';

export type VaultStatus =
  | { status: 'uninitialized' }
  | { status: 'locked'; vaultId: string; itemCount: number; rememberedOnDevice: boolean }
  | { status: 'unlocked'; vaultId: string; itemCount: number };

/// Normalize vault status payloads (handles legacy snake_case field names).
export function normalizeVaultStatus(raw: VaultStatus | Record<string, unknown> | null | undefined): VaultStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const status = (raw as { status?: unknown }).status;
  if (status === 'uninitialized') return { status: 'uninitialized' };
  if (status === 'locked' || status === 'unlocked') {
    const record = raw as Record<string, unknown>;
    const vaultIdRaw = record.vaultId ?? record.vault_id;
    if (typeof vaultIdRaw !== 'string' || !vaultIdRaw.trim()) return null;
    const vaultId = vaultIdRaw.trim();

    const itemCountRaw = record.itemCount ?? record.item_count;
    const itemCount = typeof itemCountRaw === 'number' ? itemCountRaw : Number(itemCountRaw);
    if (!Number.isFinite(itemCount) || itemCount < 0 || !Number.isInteger(itemCount)) return null;

    if (status === 'locked') {
      const rememberedRaw = record.rememberedOnDevice ?? record.remembered_on_device;
      if (rememberedRaw !== undefined && typeof rememberedRaw !== 'boolean') return null;
      return {
        status: 'locked',
        vaultId,
        itemCount,
        rememberedOnDevice: Boolean(rememberedRaw),
      };
    }
    return { status: 'unlocked', vaultId, itemCount };
  }
  return null;
}

export interface VaultItem {
  id: string;
  logicalId: string;
  kind: string;
  label: string;
  secretFingerprint: string;
  schemaVersion: number;
  secretFieldCount: number;
  hasPassphraseField: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultItemDetail {
  id: string;
  logicalId: string;
  kind: string;
  label: string;
  notes?: string;
  credential?: CredentialEnvelope;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultBackfillResult {
  updated: number;
  relinkedItemIds: number;
  skippedMissingItems: number;
}

export interface RevisionMeta {
  itemId: string;
  revision: number;
  label: string;
  kind: string;
  secretFingerprint: string;
  createdAt: number;
  rotatedAt: number;
}

export interface SecureToVaultCandidate {
  connectionId: string;
  connectionName: string;
  host: string;
  secureKind: string;
}

export interface SecureToVaultPreview {
  candidates: SecureToVaultCandidate[];
  alreadySecured: number;
  skippedNoFile: number;
}

export interface SecureToVaultResult {
  secured: number;
  skipped: number;
  alreadyDone: number;
  backupPath?: string;
}

export const vaultIpc = {
  status: async (): Promise<VaultStatus> => {
    const raw = await invoke<VaultStatus | Record<string, unknown>>('vault_status');
    const normalized = normalizeVaultStatus(raw);
    if (!normalized) {
      console.warn('[Vault] Unrecognized vault_status payload:', raw);
      return { status: 'uninitialized' };
    }
    return normalized;
  },

  initialize: async (passphrase: string, rememberOnDevice = false): Promise<VaultStatus> => {
    const raw = await invoke<VaultStatus | Record<string, unknown>>('vault_initialize', {
      args: { passphrase, remember_on_device: rememberOnDevice },
    });
    const normalized = normalizeVaultStatus(raw);
    if (!normalized) {
      console.warn('[Vault] Unrecognized vault_initialize payload:', raw);
      return { status: 'uninitialized' };
    }
    return normalized;
  },

  unlock: async (passphrase: string, rememberOnDevice = false): Promise<VaultStatus> => {
    const raw = await invoke<VaultStatus | Record<string, unknown>>('vault_unlock', {
      args: { passphrase, remember_on_device: rememberOnDevice },
    });
    const normalized = normalizeVaultStatus(raw);
    if (!normalized || normalized.status !== 'unlocked') {
      throw new Error('Vault unlock did not return an unlocked status.');
    }
    return normalized;
  },

  forgetDevice: (): Promise<void> =>
    invoke('vault_forget_device'),

  lock: (): Promise<void> =>
    invoke('vault_lock'),

  itemList: (): Promise<VaultItem[]> =>
    invoke('vault_item_list'),

  itemGet: (itemId: string): Promise<VaultItemDetail> =>
    invoke('vault_item_get', { args: { item_id: itemId } }),

  itemUpdate: (
    itemId: string,
    label: string,
    kind: string,
    secretValues: Record<string, string>,
    notes?: string,
  ): Promise<VaultItem> => {
    const args: {
      item_id: string;
      label: string;
      kind: string;
      secret_values: Record<string, string>;
      notes?: string;
    } = { item_id: itemId, label, kind, secret_values: secretValues };
    if (notes !== undefined) args.notes = notes;
    return invoke('vault_item_update', { args });
  },

  itemCreate: (label: string, kind: string, secretValues: Record<string, string>, notes?: string, credentialId?: string): Promise<VaultItem> => {
    const args: { label: string; kind: string; secret_values: Record<string, string>; notes?: string; credential_id?: string } = { label, kind, secret_values: secretValues };
    if (notes !== undefined) args.notes = notes;
    if (credentialId !== undefined) args.credential_id = credentialId;
    return invoke('vault_item_create', { args });
  },

  itemDelete: (itemId: string): Promise<void> =>
    invoke('vault_item_delete', { args: { item_id: itemId } }),

  secureToVaultPreview: (): Promise<SecureToVaultPreview> =>
    invoke('vault_secure_to_vault_preview'),

  secureToVault: (): Promise<SecureToVaultResult> =>
    invoke('vault_secure_to_vault'),

  backfillConnectionRefs: (): Promise<VaultBackfillResult> =>
    invoke('vault_backfill_connection_refs'),

  generateRecoveryKey: (): Promise<string> =>
    invoke('vault_generate_recovery_key'),

  hasRecoveryKey: (): Promise<boolean> =>
    invoke('vault_has_recovery_key'),

  unlockWithRecoveryKey: async (recoveryKey: string, rememberOnDevice = false): Promise<VaultStatus> => {
    const raw = await invoke<VaultStatus | Record<string, unknown>>('vault_unlock_with_recovery_key', {
      args: { recovery_key: recoveryKey, remember_on_device: rememberOnDevice },
    });
    const normalized = normalizeVaultStatus(raw);
    if (!normalized || normalized.status !== 'unlocked') {
      throw new Error('Vault unlock did not return an unlocked status.');
    }
    return normalized;
  },

  exportVault: (destPath: string): Promise<void> =>
    invoke('vault_export', { args: { dest_path: destPath } }),

  importVault: (srcPath: string): Promise<VaultStatus> =>
    invoke('vault_import', { args: { src_path: srcPath } }),

  itemRevisionHistory: (itemId: string): Promise<RevisionMeta[]> =>
    invoke('vault_item_revision_history', { args: { item_id: itemId } }),

  itemRestoreRevision: (itemId: string, revision: number): Promise<VaultItem> =>
    invoke('vault_item_restore_revision', { args: { item_id: itemId, revision } }),
};
