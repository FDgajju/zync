import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import { useAppStore } from '../../store/useAppStore';
import { InputTracker } from '../../lib/ghostSuggestions/inputTracker';
import {
  acceptGhostCommand,
  commitGhostCommand,
  resolveInlineSuggestion,
} from '../../lib/ghostSuggestions/client';
import { resolveCdTargetPath } from '../../lib/ghostSuggestions/cwdTracking';
import { bindGhostTrackerRuntime, handleGhostInputEvent } from '../../lib/ghostSuggestions/runtime';
import { shouldSuppressGhostForNativeShell } from '../../lib/ghostSuggestions/shellSuppression';
import {
  getZshAutosuggestEnabled,
  scheduleZshAutosuggestProbe,
} from '../../lib/ghostSuggestions/zshAutosuggestDetect';
import { ghostDebug } from '../../lib/ghostSuggestions/ghostDebug';
import {
  cwdForWslPathCompletion,
  resolveWslShellIdForPathCompletion,
} from '../../lib/ghostSuggestions/wslShell';
import type { GhostLayoutHint, GhostLineOrigin } from '../../lib/ghostSuggestions/cursorPosition';
import { stringDisplayWidth } from '../../lib/ghostSuggestions/displayWidth';
import type { AppSettings } from '../../store/settingsSlice';
import { extractRecentCommands } from '../../lib/ghostSuggestions/recentCommands';
import {
  clearTerminalPendingInput,
  clearTerminalResizeState,
  enqueueTerminalInputTask,
  getTerminalRecentLines,
  queueTerminalInput,
  isTerminalIdleSuspended,
  spawnTerminalFromStoreContext,
  terminalCache,
} from '../../lib/terminal';
import type { TerminalMountContext } from './useTerminalLifecycle';

function getEffectiveShellId(
  terminalKey: string,
  shellOverride?: string,
  windowsShell?: string,
): string | undefined {
  return shellOverride ?? (terminalKey === 'local' ? windowsShell : undefined);
}

export interface UseTerminalGhostOptions {
  sessionId: string;
  terminalKey: string;
  spawnConnectionId: string;
  ghostScope: string;
  ghostSettings: AppSettings['ghostSuggestions'];
  isVisibleRef: RefObject<boolean>;
  isConnectedRef: RefObject<boolean>;
}

export function useTerminalGhost({
  sessionId,
  terminalKey,
  spawnConnectionId,
  ghostScope,
  ghostSettings,
  isVisibleRef,
  isConnectedRef,
}: UseTerminalGhostOptions) {
  const [ghostSuggestion, setGhostSuggestion] = useState('');
  const [ghostLayout, setGhostLayout] = useState<GhostLayoutHint>({
    typedCellCount: 0,
    origin: null,
  });
  const ghostTrackerRef = useRef<InputTracker | null>(null);
  const ghostSettingsRef = useRef(ghostSettings);
  /** First-cell screen position for the current typed line (pre-echo). */
  const lineOriginRef = useRef<GhostLineOrigin | null>(null);
  const termRefForLayout = useRef<XTerm | null>(null);

  const syncGhostLayout = useCallback((tracker: InputTracker | null | undefined, term?: XTerm | null) => {
    const activeTerm = term ?? termRefForLayout.current;
    if (!tracker || tracker.isDesynced() || tracker.isSecretInputMode()) {
      lineOriginRef.current = null;
      setGhostLayout({ typedCellCount: 0, origin: null });
      return;
    }
    const line = tracker.getLineBuffer();
    if (!line) {
      lineOriginRef.current = null;
      setGhostLayout({ typedCellCount: 0, origin: null });
      return;
    }
    // Capture origin on the first keystroke of a line, while the caret is still
    // at the prompt — before remote echo advances cursorX.
    if (!lineOriginRef.current && activeTerm) {
      const buf = activeTerm.buffer.active;
      lineOriginRef.current = { col: buf.cursorX, row: buf.cursorY };
    }
    setGhostLayout({
      // Terminal columns (wide CJK/emoji = 2, combining marks = 0), not JS code points.
      typedCellCount: stringDisplayWidth(line),
      origin: lineOriginRef.current,
    });
  }, []);

  useEffect(() => {
    ghostSettingsRef.current = ghostSettings;
    if (!ghostSettings.inlineEnabled) {
      setGhostSuggestion('');
      ghostTrackerRef.current?.clearSuggestion();
      lineOriginRef.current = null;
      setGhostLayout({ typedCellCount: 0, origin: null });
    }
  }, [ghostSettings]);

  const acceptGhostSuffix = useCallback((suffix: string) => {
    if (!suffix) return;
    const cached = terminalCache.get(sessionId);
    cached?.ghostTracker?.appendToLineBuffer(suffix);
    cached?.ghostTracker?.clearSuggestion();
    queueTerminalInput(sessionId, suffix);
    acceptGhostCommand(cached?.ghostTracker?.getLineBuffer() ?? '', ghostScope).catch(() => {});
    setGhostSuggestion('');
    syncGhostLayout(cached?.ghostTracker ?? null);
  }, [sessionId, ghostScope, syncGhostLayout]);

  const truncateLabel = useCallback((label: string, max = 60) => {
    if (label.length <= max) return label;
    return `${label.slice(0, Math.max(0, max - 1))}…`;
  }, []);

  const resetGhostUi = useCallback(() => {
    setGhostSuggestion('');
    lineOriginRef.current = null;
    setGhostLayout({ typedCellCount: 0, origin: null });
  }, []);

  const initGhostTracker = useCallback((termSessionId: string) => {
    const ghostTracker = new InputTracker({
      onLineChange: () => {},
      onAccept: () => {},
      onDismiss: () => {},
      onHistoryCommit: () => {},
    });
    terminalCache.get(termSessionId)!.ghostTracker = ghostTracker;
  }, []);

  const onBindMount = useCallback(({ term, sessionId: mountSessionId }: TerminalMountContext) => {
    termRefForLayout.current = term;
    const cachedGhostTracker = terminalCache.get(mountSessionId)?.ghostTracker;
    ghostTrackerRef.current = cachedGhostTracker ?? null;
    if (!ghostSettingsRef.current.inlineEnabled) {
      ghostTrackerRef.current?.clearSuggestion();
    }

    const storeOnBind = useAppStore.getState();
    const termStateOnBind = storeOnBind.terminals[terminalKey]?.find((t) => t.id === mountSessionId);
    const shellIdOnBind = getEffectiveShellId(
      terminalKey,
      termStateOnBind?.shellOverride,
      storeOnBind.settings.localTerm?.windowsShell,
    );
    scheduleZshAutosuggestProbe(mountSessionId, terminalKey, shellIdOnBind);

    const unbindGhostTracker = cachedGhostTracker
      ? bindGhostTrackerRuntime({
        tracker: cachedGhostTracker,
        debounceMs: 30,
        resolveInlineSuggestion: async (line) => {
          if (!ghostSettingsRef.current.inlineEnabled) return '';
          if (!isVisibleRef.current) return '';
          if (cachedGhostTracker?.isSecretInputMode()) return '';
          const store = useAppStore.getState();
          const termState = store.terminals[terminalKey]?.find((t) => t.id === mountSessionId);
          const shellId = getEffectiveShellId(
            terminalKey,
            termState?.shellOverride,
            store.settings.localTerm?.windowsShell,
          );
          const suppressed = shouldSuppressGhostForNativeShell(
            ghostSettingsRef.current.nativeShellPolicy,
            shellId,
            getZshAutosuggestEnabled(mountSessionId),
          );
          const rawCwd = termState?.lastKnownCwd ?? termState?.initialPath;
          const wslShellId = terminalKey === 'local'
            ? resolveWslShellIdForPathCompletion(shellId, rawCwd)
            : undefined;
          const cwd = wslShellId ? cwdForWslPathCompletion(rawCwd) : rawCwd;
          ghostDebug('terminal', {
            terminalKey,
            termId: mountSessionId,
            line,
            shellId: shellId ?? null,
            rawCwd: rawCwd ?? null,
            cwd: cwd ?? null,
            wslShellId: wslShellId ?? null,
            suppressed,
            desynced: cachedGhostTracker?.isDesynced() ?? false,
          });
          if (suppressed) {
            ghostDebug('terminal', { phase: 'suppressed', shellId: shellId ?? null });
            return '';
          }
          const recentCommands = extractRecentCommands(
            getTerminalRecentLines(mountSessionId, 24),
          );
          return resolveInlineSuggestion({
            line,
            cwd,
            scope: ghostScope,
            fsConnectionId: terminalKey,
            wslShellId,
            recentCommands,
            providers: ghostSettingsRef.current.providers,
          });
        },
        onSuggestion: (suffix, line) => {
          syncGhostLayout(cachedGhostTracker, term);
          if (ghostSettingsRef.current.inlineEnabled) {
            setGhostSuggestion(suffix);
          } else {
            setGhostSuggestion('');
          }
          ghostDebug('layout', {
            phase: 'suggestion',
            lineLen: line.length,
            origin: lineOriginRef.current,
            suffix: suffix || null,
          });
        },
        onAccept: (suffix, lineAfterAccept) => {
          queueTerminalInput(mountSessionId, suffix);
          acceptGhostCommand(lineAfterAccept, ghostScope).catch(() => {});
          syncGhostLayout(cachedGhostTracker, term);
        },
        onHistoryCommit: (cmd) => {
          commitGhostCommand(cmd, ghostScope).catch(() => {});
          const termState = useAppStore.getState().terminals[terminalKey]?.find((t) => t.id === mountSessionId);
          const cwd = termState?.lastKnownCwd ?? termState?.initialPath;
          const nextCwd = resolveCdTargetPath(cmd, cwd);
          if (nextCwd) {
            useAppStore.getState().setTerminalCwd(terminalKey, mountSessionId, nextCwd);
          }
        },
        onClearUI: () => {
          setGhostSuggestion('');
          // Keep origin while the line still has local typed text (suggestion
          // cleared mid-debounce); drop it when the line buffer is empty/desynced.
          syncGhostLayout(cachedGhostTracker, term);
        },
      })
      : () => {};

    const cachedForInput = terminalCache.get(mountSessionId);
    if (cachedForInput?.onDataDisposable) {
      cachedForInput.onDataDisposable.dispose();
      cachedForInput.onDataDisposable = undefined;
    }

    if (cachedForInput) {
      cachedForInput.onDataDisposable = term.onData((data) => {
        enqueueTerminalInputTask(mountSessionId, async () => {
          const cached = terminalCache.get(mountSessionId);

          if (cached && !cached.spawned) {
            const isRestartKey = data === '\r' || data === '\n';
            if (!isRestartKey) {
              return;
            }
            if (!isVisibleRef.current || !isConnectedRef.current || cached.spawnBlocked) {
              return;
            }
            const idleSuspended = isTerminalIdleSuspended(mountSessionId);
            console.log(
              idleSuspended
                ? '[Terminal] Idle-suspended shell, resuming on Enter'
                : '[Terminal] Session ended, restarting on Enter',
            );
            clearTerminalPendingInput(mountSessionId);
            clearTerminalResizeState(mountSessionId);
            cached.spawnBlocked = false;
            const store = useAppStore.getState();
            spawnTerminalFromStoreContext({
              sessionId: mountSessionId,
              connectionId: spawnConnectionId,
              terminalKey,
              term,
              clearBuffer: !idleSuspended,
              terminals: store.terminals,
              windowsShell: store.settings.localTerm?.windowsShell,
              remoteReady: true,
            });
            cached.ghostTracker?.reset();
            cached.zshAutosuggestEnabled = undefined;
            cached.zshAutosuggestProbe = undefined;
            const storeAfterSpawn = useAppStore.getState();
            const termAfterSpawn = storeAfterSpawn.terminals[terminalKey]?.find((t) => t.id === mountSessionId);
            const shellAfterSpawn = getEffectiveShellId(
              terminalKey,
              termAfterSpawn?.shellOverride,
              storeAfterSpawn.settings.localTerm?.windowsShell,
            );
            scheduleZshAutosuggestProbe(mountSessionId, terminalKey, shellAfterSpawn);
            setGhostSuggestion('');
            lineOriginRef.current = null;
            setGhostLayout({ typedCellCount: 0, origin: null });
            return;
          }

          if (isVisibleRef.current) {
            // Capture line origin *before* feed when the buffer is empty so we
            // pin to the prompt caret even if local echo is extremely fast.
            const tracker = cached?.ghostTracker;
            const wasEmpty = !tracker?.getLineBuffer();
            if (wasEmpty && tracker && !tracker.isDesynced() && !tracker.isSecretInputMode()) {
              const buf = term.buffer.active;
              // Only seed origin for printable input; feed() decides if it sticks.
              const hasPrintable = [...data].some((ch) => {
                const code = ch.charCodeAt(0);
                return code >= 0x20 && code !== 0x7f;
              });
              if (hasPrintable) {
                lineOriginRef.current = { col: buf.cursorX, row: buf.cursorY };
              }
            }

            const handledByGhost = handleGhostInputEvent(data, tracker);
            syncGhostLayout(tracker, term);
            if (handledByGhost) return;
          }

          queueTerminalInput(mountSessionId, data);
        });
      });
    }

    return () => {
      termRefForLayout.current = null;
      unbindGhostTracker();
    };
  }, [
    terminalKey,
    ghostScope,
    spawnConnectionId,
    isVisibleRef,
    isConnectedRef,
    syncGhostLayout,
  ]);

  return {
    ghostSuggestion,
    ghostLayout,
    acceptGhostSuffix,
    truncateLabel,
    resetGhostUi,
    initGhostTracker,
    onBindMount,
  };
}