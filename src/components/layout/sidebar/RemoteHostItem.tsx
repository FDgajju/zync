import { memo, useMemo, useState } from 'react';
import { CloudDownload, Loader2, Plug } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { HostCatalogEntry } from '../../../features/connections/domain/hostCatalog';
import {
  getConnectionPrimaryLabel,
  getConnectionSecondaryLabel,
} from '../../../features/connections/domain/connectionDisplay';
import { useShowHostAddressesInLists } from '../../../features/connections/presentation/useConnectionDisplayLabels';
import type { Connection } from '../../../features/connections/domain/types';
import { HostLocationChips } from './HostLocationChips';
import { OSIcon } from '../../icons/OSIcon';
import { Tooltip } from '../../ui/Tooltip';

interface RemoteHostItemProps {
  entry: HostCatalogEntry;
  compactMode?: boolean;
  isMaterializing?: boolean;
  onKeepOnDevice: (entry: HostCatalogEntry) => void;
  onKeepAndConnect: (entry: HostCatalogEntry) => void;
}

/** Map catalog entry to the shape display helpers expect (privacy setting shared with local hosts). */
function entryAsDisplayConnection(entry: HostCatalogEntry): Connection {
  return {
    id: entry.logicalId,
    name: entry.name,
    host: entry.host,
    username: entry.username,
    port: entry.port,
    status: 'disconnected',
    tags: entry.tags,
    isFavorite: entry.isFavorite,
    folder: entry.folder,
  };
}

/**
 * Provider-only host row — layout matches quiet ConnectionItem rows.
 */
export const RemoteHostItem = memo(function RemoteHostItem({
  entry,
  compactMode,
  isMaterializing,
  onKeepOnDevice,
  onKeepAndConnect,
}: RemoteHostItemProps) {
  const [busyAction, setBusyAction] = useState<'keep' | 'connect' | null>(null);
  const busy = Boolean(isMaterializing) || busyAction !== null;
  const showHostAddressesInLists = useShowHostAddressesInLists();
  const { primary, secondary } = useMemo(() => {
    const conn = entryAsDisplayConnection(entry);
    return {
      primary: getConnectionPrimaryLabel(conn, showHostAddressesInLists),
      secondary: getConnectionSecondaryLabel(conn, showHostAddressesInLists),
    };
  }, [entry, showHostAddressesInLists]);

  const run = async (action: 'keep' | 'connect', fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusyAction(action);
    try {
      await fn();
    } catch (error) {
      console.warn('[RemoteHostItem] action failed:', error);
    } finally {
      setBusyAction(null);
    }
  };

  const showLocationChips = entry.locations.length > 0
    && !(entry.locations.length === 1 && entry.locations[0] === 'local');

  return (
    <div
      className={cn(
        'group relative flex items-center select-none border border-transparent transition-colors',
        compactMode ? 'gap-2 rounded-md px-1.5 py-1.5' : 'gap-2 rounded-md px-2 py-1.5',
        'text-app-muted hover:bg-app-surface/40 hover:text-app-text',
      )}
      role="listitem"
      aria-label={`${primary} available from provider`}
    >
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center',
          compactMode ? 'h-6 w-6' : 'h-7 w-7',
        )}
      >
        <OSIcon
          icon="Server"
          className="h-4 w-4 text-app-muted group-hover:text-app-text"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[13px] font-medium leading-tight text-app-text/90">
            {primary}
          </span>
          <div
            className={cn(
              'ml-auto flex shrink-0 items-center gap-0.5 transition-opacity',
              busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            <Tooltip content="Keep on this device" position="top">
              <button
                type="button"
                disabled={busy}
                className={cn(
                  'rounded-md p-1 text-app-muted transition-colors hover:bg-app-surface hover:text-app-text',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
                aria-label="Keep on this device"
                onClick={(e) => {
                  e.stopPropagation();
                  void run('keep', () => onKeepOnDevice(entry));
                }}
              >
                {busyAction === 'keep' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CloudDownload size={12} />
                )}
              </button>
            </Tooltip>
            <Tooltip content="Keep and open" position="top">
              <button
                type="button"
                disabled={busy}
                className={cn(
                  'rounded-md p-1 text-app-accent transition-colors hover:bg-app-surface',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
                aria-label="Keep on this device and open"
                onClick={(e) => {
                  e.stopPropagation();
                  void run('connect', () => onKeepAndConnect(entry));
                }}
              >
                {busyAction === 'connect' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plug size={12} />
                )}
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[11px] leading-tight text-app-muted/55 group-hover:text-app-muted/70">
            {secondary}
          </span>
          {showLocationChips && (
            <HostLocationChips
              locations={entry.locations}
              compact
              hideLocalOnly
              className="ml-auto"
            />
          )}
        </div>
      </div>
    </div>
  );
});
