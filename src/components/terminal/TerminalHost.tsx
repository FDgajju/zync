import { memo, type CSSProperties, type RefObject } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { cn } from '../../lib/utils';
import type { AppSettings } from '../../store/settingsSlice';
import type { GhostLayoutHint } from '../../lib/ghostSuggestions/cursorPosition';
import { GhostSuggestionOverlay } from './GhostSuggestionOverlay';
import { TerminalSearchBar } from './TerminalSearchBar';
import { TerminalContextMenu } from './TerminalContextMenu';

export interface TerminalHostProps {
  containerRef: RefObject<HTMLDivElement | null>;
  termRef: RefObject<XTerm | null>;
  sessionId: string;
  terminalPadding: number;
  terminalTransparencyEnabled: boolean;
  terminalHostStyle: CSSProperties | undefined;
  layoutTransitioning: boolean;
  isSearchOpen: boolean;
  searchText: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchTextChange: (value: string) => void;
  onSearchNext: () => void;
  onSearchPrev: () => void;
  onSearchClose: () => void;
  contextMenu: { x: number; y: number } | null;
  onOpenContextMenu: (position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  connectionId: string;
  ghostSettings: AppSettings['ghostSuggestions'];
  ghostSuggestion: string;
  ghostLayout?: GhostLayoutHint | null;
  truncateLabel: (label: string, max?: number) => string;
  onAcceptGhostSuffix: (suffix: string) => void;
}

export const TerminalHost = memo(function TerminalHost({
  containerRef,
  termRef,
  sessionId,
  terminalPadding,
  terminalTransparencyEnabled,
  terminalHostStyle,
  layoutTransitioning,
  isSearchOpen,
  searchText,
  searchInputRef,
  onSearchTextChange,
  onSearchNext,
  onSearchPrev,
  onSearchClose,
  contextMenu,
  onOpenContextMenu,
  onCloseContextMenu,
  connectionId,
  ghostSettings,
  ghostSuggestion,
  ghostLayout,
  truncateLabel,
  onAcceptGhostSuffix,
}: TerminalHostProps) {
  return (
    <div
      key="connected"
      className={cn(
        'h-full w-full relative group outline-none',
        terminalTransparencyEnabled ? 'terminal-transparent' : 'bg-app-bg',
      )}
      style={terminalHostStyle}
      tabIndex={-1}
    >
      <TerminalSearchBar
        isOpen={isSearchOpen}
        searchText={searchText}
        inputRef={searchInputRef}
        onSearchTextChange={onSearchTextChange}
        onNext={onSearchNext}
        onPrev={onSearchPrev}
        onClose={onSearchClose}
      />

      {contextMenu && (
        <TerminalContextMenu
          position={contextMenu}
          connectionId={connectionId}
          sessionId={sessionId}
          ghostSettings={ghostSettings}
          ghostSuggestion={ghostSuggestion}
          termRef={termRef}
          truncateLabel={truncateLabel}
          onAcceptGhostSuffix={onAcceptGhostSuffix}
          onClose={onCloseContextMenu}
        />
      )}

      <div
        className={cn(
          'absolute inset-0 pointer-events-none',
          layoutTransitioning && 'overflow-hidden',
        )}
        style={{
          padding: `${Math.max(0, terminalPadding)}px`,
        }}
      >
        <div className="relative h-full w-full">
          <div
            ref={containerRef}
            className="h-full w-full terminal-container pointer-events-auto"
            onClick={() => termRef.current?.focus()}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenContextMenu({ x: e.clientX, y: e.clientY });
            }}
          />
          {termRef.current && ghostSettings.inlineEnabled && ghostSuggestion && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <GhostSuggestionOverlay
                term={termRef.current}
                suggestion={ghostSuggestion}
                layout={ghostLayout}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});