import type { Connection } from '../domain/types';
import { vaultItemCoversAuthRef } from '../../../vault/connectionsRestore';
import { syncIpc } from '../../../vault/syncIpc';
import { useSyncReadinessStore } from '../../../vault/useSyncReadinessStore';
import { useVaultStore } from '../../../vault/useVaultStore';

function collectVaultAuthChain(
  connections: Connection[],
  connectionId: string,
  visited = new Set<string>(),
): {
  hostLogicalIds: string[];
  refs: Array<NonNullable<Connection['authRef']>>;
} {
  if (visited.has(connectionId)) {
    return { hostLogicalIds: [], refs: [] };
  }
  visited.add(connectionId);
  const connection = connections.find(item => item.id === connectionId);
  if (!connection) {
    return { hostLogicalIds: [], refs: [] };
  }

  const hostLogicalIds = connection.authRef ? [connection.id] : [];
  const refs = connection.authRef ? [connection.authRef] : [];
  if (connection.jumpServerId) {
    const nested = collectVaultAuthChain(connections, connection.jumpServerId, visited);
    hostLogicalIds.push(...nested.hostLogicalIds);
    refs.push(...nested.refs);
  }
  return { hostLogicalIds, refs };
}

export type VaultCredentialConnectState = 'ready' | 'pulled' | 'missing';

export async function ensureVaultCredentialForConnect(args: {
  connectionId: string;
  connections: Connection[];
}): Promise<VaultCredentialConnectState> {
  const { hostLogicalIds, refs } = collectVaultAuthChain(args.connections, args.connectionId);
  if (refs.length === 0) return 'ready';

  const items = useVaultStore.getState().items;
  if (refs.every(ref => vaultItemCoversAuthRef(items, ref))) return 'ready';

  if (!useSyncReadinessStore.getState().readiness.isProviderReady) {
    return 'missing';
  }

  try {
    await syncIpc.connectionsRestore('google', {
      hostLogicalIds,
      includeHostDefinitions: false,
      includeReferencedCredentials: true,
      includeTunnels: false,
      includeHostSnippets: false,
    });
    await useVaultStore.getState().refreshItems();
  } catch {
    return 'missing';
  }

  const nextItems = useVaultStore.getState().items;
  return refs.every(ref => vaultItemCoversAuthRef(nextItems, ref)) ? 'pulled' : 'missing';
}
