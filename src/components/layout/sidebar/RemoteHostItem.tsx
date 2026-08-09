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
 * Provider-only host row — layout matches ConnectionItem (local hosts).
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
      // Parent handlers often toast already; still avoid unhandled rejections from void run().
      console.warn('[RemoteHostItem] action failed:', error);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex items-center transition-all select-none border',
        compactMode
          ? 'gap-2 px-2 py-1.5 rounded-lg'
          : 'gap-2.5 px-2.5 py-2 rounded-lg',
        'border-transparent hover:bg-app-surface/45 hover:border-app-border/15',
        'text-app-muted hover:text-app-text',
      )}
      role="listitem"
      aria-label={`${primary} available from provider`}
    >
      {/* Icon — same footprint as ConnectionItem */}
      <div
        className={cn(
          'relative shrink-0 flex items-center justify-center transition-all duration-300',
          compactMode ? 'h-7 w-7' : 'h-9 w-9',
          'bg-transparent',
        )}
      >
        <OSIcon
          icon="Server"
          className={cn(
            'transition-transform duration-500',
            compactMode ? 'w-4 h-4' : 'w-4.5 h-4.5',
            'text-app-muted group-hover:text-app-text group-hover:scale-110',
          )}
        />
      </div>

      <div className="flex flex-col overflow-hidden min-w-0 flex-1 gap-0.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span
            className={cn(
              'truncate font-medium leading-tight transition-colors min-w-0',
              'text-[13px] text-app-text/85 group-hover:text-app-text',
            )}
          >
            {primary}
          </span>

          {/* Hover actions (same placement idea as local edit control) */}
          <div
            className={cn(
              'flex items-center gap-0.5 shrink-0 transition-opacity',
              busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            <Tooltip content="Keep on this device" position="top">
              <button
                type="button"
                disabled={busy}
                className={cn(
                  'p-1 rounded-md hover:bg-app-surface hover:text-app-text text-app-muted transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
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
                  'p-1 rounded-md hover:bg-app-surface text-app-accent transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
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
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'truncate leading-tight min-w-0',
              compactMode ? 'text-[10px]' : 'text-[11px]',
              'text-app-muted/50 group-hover:text-app-muted/70 transition-colors',
            )}
          >
            {secondary}
          </span>
          <HostLocationChips
            locations={entry.locations}
            compact
            hideLocalOnly
            className="ml-auto"
          />
        </div>
      </div>
    </div>
  );
});
