import { useCallback, useEffect, useState } from 'react';
import { syncIpc, type SyncRemoteCollectionSummary } from '../../../../../vault/syncIpc';
import { parseSyncInvokeError } from '../../../../../vault/syncError';

export type RemoteDiscoveryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; collections: SyncRemoteCollectionSummary[] }
  | { status: 'error'; message: string };

export function useRemoteCollectionDiscovery(isOpen: boolean) {
  const [remoteDiscovery, setRemoteDiscovery] = useState<RemoteDiscoveryState>({ status: 'idle' });
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [scanNonce, setScanNonce] = useState(0);

  const retry = useCallback(() => {
    setScanNonce(value => value + 1);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setRemoteDiscovery({ status: 'idle' });
      setSelectedCollectionId('');
      return;
    }

    let cancelled = false;
    setRemoteDiscovery({ status: 'loading' });
    setSelectedCollectionId('');

    void (async () => {
      try {
        const result = await syncIpc.collectionDiscoverRemote('google');
        if (cancelled) return;
        const collections = result.collections ?? [];
        setRemoteDiscovery({ status: 'ready', collections });
        if (collections.length === 1) {
          setSelectedCollectionId(collections[0].syncCollectionId);
        }
      } catch (discoveryError) {
        if (cancelled) return;
        const { message } = parseSyncInvokeError(discoveryError);
        setRemoteDiscovery({
          status: 'error',
          message: message || 'Could not scan Google Drive for existing encrypted backups.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, scanNonce]);

  const remoteCollections = remoteDiscovery.status === 'ready' ? remoteDiscovery.collections : [];
  const isDiscoveryPending = remoteDiscovery.status === 'idle' || remoteDiscovery.status === 'loading';
  const isDiscoveryReady = remoteDiscovery.status === 'ready';
  const isLinkingExisting = isDiscoveryReady && remoteCollections.length > 0;

  return {
    remoteDiscovery,
    remoteCollections,
    selectedCollectionId,
    setSelectedCollectionId,
    isDiscoveryPending,
    isDiscoveryReady,
    isLinkingExisting,
    retry,
  };
}
