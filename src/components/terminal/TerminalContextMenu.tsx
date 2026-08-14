import { memo, type RefObject } from 'react';
import { Copy, Clipboard as ClipboardIcon, Trash2, Scissors, FolderOpen } from 'lucide-react';
import type { Terminal as XTerm } from '@xterm/xterm';
import { ContextMenu } from '../ui/ContextMenu';
import type { AppSettings } from '../../store/settingsSlice';
import { useAppStore } from '../../store/useAppStore';
import { terminalCache } from '../../lib/terminal';
import {
  readTerminalClipboardText,
  writeTerminalClipboardText,
} from '../../lib/terminal/terminalClipboard.js';

export interface TerminalContextMenuProps {
  position: { x: number; y: number };
  connectionId: string;
  sessionId: string;
  ghostSettings: AppSettings['ghostSuggestions'];
  ghostSuggestion: string;
  termRef: RefObject<XTerm | null>;
  truncateLabel: (label: string, max?: number) => string;
  onAcceptGhostSuffix: (suffix: string) => void;
  onClose: () => void;
}

export const TerminalContextMenu = memo(function TerminalContextMenu({
  position,
  connectionId,
  sessionId,
  ghostSettings,
  ghostSuggestion,
  termRef,
  truncateLabel,
  onAcceptGhostSuffix,
  onClose,
}: TerminalContextMenuProps) {
  const ghostItems = ghostSettings.contextMenuEnabled && ghostSuggestion
    ? [
      {
        label: truncateLabel(
          `Accept suggestion: ${terminalCache.get(sessionId)?.ghostTracker?.getLineBuffer() ?? ''}${ghostSuggestion}`,
        ),
        action: () => onAcceptGhostSuffix(ghostSuggestion),
      },
      { separator: true as const },
    ]
    : [];

  return (
    <ContextMenu
      x={position.x}
      y={position.y}
      onClose={onClose}
      items={[
        ...ghostItems,
        {
          label: 'Copy',
          icon: <Copy className="w-4 h-4" />,
          action: () => {
            const selection = termRef.current?.getSelection();
            if (selection) {
              void writeTerminalClipboardText(selection).catch(console.error);
            }
          },
          disabled: !termRef.current?.hasSelection(),
        },
        {
          label: 'Paste',
          icon: <ClipboardIcon className="w-4 h-4" />,
          action: async () => {
            const text = await readTerminalClipboardText();
            if (text) {
              termRef.current?.paste(text);
            }
          },
        },
        {
          label: 'Select All',
          icon: <Scissors className="w-4 h-4" />,
          action: () => termRef.current?.selectAll(),
        },
        { separator: true as const },
        {
          label: 'Open File Manager Here',
          icon: <FolderOpen className="w-4 h-4" />,
          action: () => {
            const store = useAppStore.getState();
            const term = store.terminals[connectionId]?.find((t) => t.id === sessionId);
            const connection = store.connections.find((c) => c.id === connectionId);
            const targetPath =
              term?.lastKnownCwd
              || term?.initialPath
              || connection?.homePath
              || '/';
            const tabId = store.activeTabId;
            void (async () => {
              await store.loadFiles(connectionId, targetPath);
              if (!tabId) return;
              // Retarget only the tab that initiated the action (ignore mid-await tab switches).
              if (useAppStore.getState().tabs.some((tab) => tab.id === tabId)) {
                useAppStore.getState().setTabView(tabId, 'files');
              }
            })();
          },
        },
        {
          label: 'Clear Terminal',
          icon: <Trash2 className="w-4 h-4" />,
          variant: 'danger',
          action: () => termRef.current?.clear(),
        },
      ]}
    />
  );
});
