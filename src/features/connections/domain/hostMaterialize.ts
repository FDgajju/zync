import {
  formatConnectionsRestoreSuccessMessage,
  normalizeConnectionsRestoreArgs,
  reportConnectionsRestoreWarnings,
} from '../../../vault/connectionsRestore';
import { parseSyncInvokeError } from '../../../vault/syncError';
import { syncIpc, type SyncProvider } from '../../../vault/syncIpc';
import { useVaultStore } from '../../../vault/useVaultStore';
import type { ToastType } from '../../../store/toastSlice';

export interface MaterializeHostOptions {
  provider?: SyncProvider;
  logicalIds: string[];
  /**
   * Include tunnels + host snippets (slower).
   * Default false for snappy Keep / Keep-and-open; use true when restoring a full workspace.
   */
  includeBundle?: boolean;
  /** Quieter success toast (e.g. Keep-and-open). */
  silentSuccess?: boolean;
  showToast: (type: ToastType, message: string) => void;
  loadConnections: () => Promise<void> | void;
}

/**
 * Materialize one or more provider hosts onto this device (local working set).
 * Host definitions always restore. Referenced credentials are included only when
 * Local Vault is unlocked (`useVaultStore.status === 'unlocked'`).
 * Tunnels/snippets are optional via includeBundle.
 * Identity remains logicalId — no re-keying.
 */
export async function materializeHostsOnDevice(
  options: MaterializeHostOptions,
): Promise<{ ok: boolean; logicalIds: string[] }> {
  const provider = options.provider ?? 'google';
  const logicalIds = options.logicalIds.map(id => id.trim()).filter(Boolean);
  if (logicalIds.length === 0) {
    return { ok: false, logicalIds: [] };
  }

  const includeBundle = options.includeBundle ?? false;
  const args = normalizeConnectionsRestoreArgs({
    hostLogicalIds: logicalIds,
    includeHostDefinitions: true,
    includeReferencedCredentials: useVaultStore.getState().status?.status === 'unlocked',
    includeTunnels: includeBundle,
    includeHostSnippets: includeBundle,
  });

  let result;
  try {
    result = await syncIpc.connectionsRestore(provider, args);
  } catch (error) {
    const parsed = parseSyncInvokeError(error);
    options.showToast(
      'error',
      parsed.message || 'Failed to save host on this device.',
    );
    return { ok: false, logicalIds };
  }

  // Restore succeeded — reload is best-effort and must not report as restore failure.
  let reloadOk = true;
  try {
    await options.loadConnections();
  } catch (error) {
    reloadOk = false;
    const message = error instanceof Error ? error.message : String(error);
    options.showToast(
      'error',
      message || 'Host was saved, but the local host list failed to refresh. Reload the app if hosts look stale.',
    );
  }

  // Do not celebrate success if the local list failed to refresh (avoids mixed toasts).
  if (reloadOk && !options.silentSuccess) {
    options.showToast('success', formatConnectionsRestoreSuccessMessage(result));
  }
  reportConnectionsRestoreWarnings(result, options.showToast);
  const changed = result.hosts.restored + result.hosts.updated;
  return { ok: changed > 0 || result.hosts.skipped > 0, logicalIds };
}
