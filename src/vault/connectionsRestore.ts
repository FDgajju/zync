import type {
  SyncConnectionsRestoreArgs,
  SyncConnectionsRestoreResult,
} from './syncIpc';
import type { ToastType } from '../store/toastSlice';

export type LocalVaultRestoreState = 'uninitialized' | 'locked' | 'unlocked' | 'unavailable';
export type RestoreVaultAction = 'create' | 'unlock';
export type ConnectionsRestoreJobPhase = 'idle' | 'previewing' | 'preview' | 'running';

export function isConnectionsRestoreJobRunning(phase: ConnectionsRestoreJobPhase): boolean {
  return phase === 'running';
}

export function isConnectionsRestorePreviewOpen(phase: ConnectionsRestoreJobPhase): boolean {
  return phase === 'preview';
}

export function normalizeConnectionsRestoreArgs(
  args: SyncConnectionsRestoreArgs = {},
): SyncConnectionsRestoreArgs {
  const hostLogicalIds = args.hostLogicalIds
    ?.map(id => id.trim())
    .filter(id => id.length > 0);

  return {
    includeHostDefinitions: args.includeHostDefinitions ?? true,
    includeTunnels: args.includeTunnels ?? true,
    includeHostSnippets: args.includeHostSnippets ?? true,
    includeReferencedCredentials: args.includeReferencedCredentials ?? true,
    hostLogicalIds: hostLogicalIds && hostLogicalIds.length > 0 ? hostLogicalIds : undefined,
  };
}

export function connectionsRestoreArgsMatch(
  left: SyncConnectionsRestoreArgs | null | undefined,
  right: SyncConnectionsRestoreArgs | null | undefined,
): boolean {
  const a = normalizeConnectionsRestoreArgs(left ?? {});
  const b = normalizeConnectionsRestoreArgs(right ?? {});
  const leftIds = [...(a.hostLogicalIds ?? [])].sort();
  const rightIds = [...(b.hostLogicalIds ?? [])].sort();
  return a.includeHostDefinitions === b.includeHostDefinitions
    && a.includeTunnels === b.includeTunnels
    && a.includeHostSnippets === b.includeHostSnippets
    && a.includeReferencedCredentials === b.includeReferencedCredentials
    && leftIds.length === rightIds.length
    && leftIds.every((id, index) => id === rightIds[index]);
}

export function hostsOnlyConnectionsRestoreArgs(
  args: SyncConnectionsRestoreArgs = {},
): SyncConnectionsRestoreArgs {
  return {
    ...normalizeConnectionsRestoreArgs(args),
    includeReferencedCredentials: false,
  };
}

export function localVaultRestoreState(
  status: { status: string } | null | undefined,
): LocalVaultRestoreState {
  if (!status || status.status === 'uninitialized') return 'uninitialized';
  if (status.status === 'locked') return 'locked';
  if (status.status === 'unlocked') return 'unlocked';
  return 'unavailable';
}

/** Ask to create/unlock Local Vault only when this restore would pull referenced keys. */
export function restoreVaultAction(args: {
  referencedCredentials: number;
  includeReferencedCredentials: boolean;
  vaultState: LocalVaultRestoreState;
}): RestoreVaultAction | null {
  if (!args.includeReferencedCredentials || args.referencedCredentials <= 0) return null;
  if (args.vaultState === 'uninitialized') return 'create';
  if (args.vaultState === 'locked') return 'unlock';
  return null;
}

export function formatDeferredVaultKeysMessage(count: number): string {
  const keys = `${count} vault key${count === 1 ? '' : 's'}`;
  return `${keys} stayed on Google. Create a Local Vault to pull them, or Zync will ask when you connect.`;
}

export function vaultItemCoversAuthRef(
  items: Array<{ id: string; logicalId: string }>,
  authRef: { itemId?: string; credentialId?: string } | null | undefined,
): boolean {
  if (!authRef) return true;
  const itemId = authRef.itemId?.trim() ?? '';
  const credentialId = authRef.credentialId?.trim() ?? '';
  return items.some((item) =>
    (itemId.length > 0 && item.id === itemId)
    || (credentialId.length > 0 && item.logicalId === credentialId),
  );
}

export function formatConnectionsRestoreSuccessMessage(
  result: SyncConnectionsRestoreResult,
): string {
  const hostChanged = result.hosts.restored + result.hosts.updated;
  const credentialChanged =
    result.hosts.credentialsRestored + result.hosts.credentialsUpdated;
  const tunnelChanged = (result.tunnels?.restored ?? 0) + (result.tunnels?.updated ?? 0);
  const snippetChanged =
    (result.hostSnippets?.restored ?? 0) + (result.hostSnippets?.updated ?? 0);

  if (hostChanged + tunnelChanged + snippetChanged + credentialChanged === 0) {
    return 'No connection changes restored from Google.';
  }

  const parts = [`${hostChanged} host${hostChanged === 1 ? '' : 's'}`];
  if (credentialChanged > 0) {
    parts.push(`${credentialChanged} credential${credentialChanged === 1 ? '' : 's'}`);
  }
  if (tunnelChanged > 0) {
    parts.push(`${tunnelChanged} tunnel${tunnelChanged === 1 ? '' : 's'}`);
  }
  if (snippetChanged > 0) {
    parts.push(`${snippetChanged} host snippet${snippetChanged === 1 ? '' : 's'}`);
  }

  return `Restored connections from Google (${parts.join('; ')}).`;
}

export function hasDeferredVaultKeys(hosts: {
  credentialsSkipped: number;
  credentialsRestored: number;
  credentialsUpdated: number;
  credentialsFailed: number;
  credentialsConflicts: number;
}): boolean {
  return hosts.credentialsSkipped > 0
    && hosts.credentialsRestored === 0
    && hosts.credentialsUpdated === 0
    && hosts.credentialsFailed === 0
    && hosts.credentialsConflicts === 0;
}

export function reportConnectionsRestoreWarnings(
  result: SyncConnectionsRestoreResult,
  showToast: (type: ToastType, message: string) => void,
  options?: { suppressDeferredKeyToast?: boolean },
): void {
  if (result.hosts.failed > 0) {
    showToast('error', `${result.hosts.failed} host record(s) failed to parse/decrypt.`);
  }
  if (result.hosts.credentialsFailed > 0 || result.hosts.credentialsConflicts > 0) {
    showToast(
      'error',
      `${result.hosts.credentialsFailed + result.hosts.credentialsConflicts} referenced credential record(s) need attention before some hosts can connect.`,
    );
  }
  if (!options?.suppressDeferredKeyToast && hasDeferredVaultKeys(result.hosts)) {
    showToast('info', formatDeferredVaultKeysMessage(result.hosts.credentialsSkipped));
  }
  const orphaned =
    (result.tunnels?.skippedOrphaned ?? 0) + (result.hostSnippets?.skippedOrphaned ?? 0);
  if (orphaned > 0) {
    showToast(
      'info',
      `Skipped ${orphaned} tunnel/snippet record(s) that did not match restored hosts.`,
    );
  }
}

