import { useAppStore } from '../../store/useAppStore.js';
import { scheduleZshAutosuggestProbe } from '../ghostSuggestions/zshAutosuggestDetect.js';
import { prefetchWslHomeListing } from '../ghostSuggestions/client.js';
import { REMOTE_FS_LIST_TIMEOUT_MS } from '../ghostSuggestions/wslShell.js';
import { ghostDebug } from '../ghostSuggestions/ghostDebug.js';
import {
  fetchWslCwd,
  resolveWslShellIdForPathCompletion,
  shellIdIndicatesWsl,
} from '../ghostSuggestions/wslShell.js';
import { terminalCache } from './terminalCache.js';
import { touchTerminalActivity } from './terminalActivity.js';
import { clearIdleHostSuspendNotice } from './terminalIdleSuspendNotice.js';
import { isWin32Platform, resolveLocalWindowsShellId } from './spawnContext.js';

const INPUT_BATCH_MS = 4;
const INPUT_FLUSH_THRESHOLD = 64;
const inputByteEncoder = new TextEncoder();
const IMMEDIATE_INPUT_PATTERN = /[\r\n\x03\x04\x1b]/;

export function canSendTerminalInput(termId: string | null | undefined): boolean {
  if (!termId) return false;
  const cached = terminalCache.get(termId);
  return Boolean(cached && cached.spawned && !cached.starting);
}

/**
 * Sends queued terminal input to the backend as a single IPC write.
 * Held while `starting` until `handleTerminalReady` flushes the buffer.
 */
export function flushPendingInput(termId: string | null | undefined): void {
  if (!termId) return;

  const cached = terminalCache.get(termId);
  if (!cached || cached.starting || !cached.spawned) return;

  if (cached.inputFlushTimer !== null) {
    window.clearTimeout(cached.inputFlushTimer);
    cached.inputFlushTimer = null;
  }

  if (!cached.pendingInput) return;

  if (!canSendTerminalInput(termId)) {
    return;
  }

  const data = cached.pendingInput;
  window.ipcRenderer.send('terminal:write', { termId, data });
  // Clear only after send (prevents loss on sync throw; fire-and-forget IPC is best-effort).
  cached.pendingInput = '';
  cached.pendingInputBytes = 0;
}

/**
 * Queues terminal input for a short batching window while still flushing
 * immediately for control-sensitive keys and larger chunks.
 * Buffers without IPC while the PTY session is still starting.
 */
export function queueTerminalInput(termId: string | null | undefined, data: string): void {
  if (!termId) return;

  const cached = terminalCache.get(termId);
  if (!cached) {
    return;
  }

  cached.pendingInput += data;
  cached.pendingInputBytes = (cached.pendingInputBytes || 0) + inputByteEncoder.encode(data).length;
  touchTerminalActivity(termId);

  if (!cached.spawned || cached.starting) {
    return;
  }

  const bufferedBytes = cached.pendingInputBytes;
  const shouldFlushImmediately = IMMEDIATE_INPUT_PATTERN.test(data) || bufferedBytes >= INPUT_FLUSH_THRESHOLD;

  if (shouldFlushImmediately) {
    flushPendingInput(termId);
    return;
  }

  if (cached.inputFlushTimer === null) {
    cached.inputFlushTimer = window.setTimeout(() => {
      flushPendingInput(termId);
    }, INPUT_BATCH_MS);
  }
}

/** Called when `terminal-ready` arrives for the active generation. */
export function handleTerminalReady(termId: string, generation: number): boolean {
  const cached = terminalCache.get(termId);
  if (!cached || cached.generation !== generation) {
    return false;
  }

  cached.starting = false;
  cached.spawned = true;
  cached.spawnBlocked = false;
  cached.suspendedByIdle = false;
  if (cached.pendingSpawnCwd && cached.connectionId) {
    useAppStore.getState().setTerminalCwd(cached.connectionId, termId, cached.pendingSpawnCwd);
    cached.pendingSpawnCwd = undefined;
  }
  if (cached.connectionId) {
    const store = useAppStore.getState();
    const readyGeneration = generation;
    const pendingSpawnShell = cached.pendingSpawnShell;
    cached.pendingSpawnShell = undefined;
    const termTab = store.terminals[cached.connectionId]?.find((t) => t.id === termId);
    if (pendingSpawnShell && !termTab?.shellOverride) {
      // Stamp shell at spawn so tab icons stay fixed. PowerShell expand is Windows-only.
      let stamped: string | undefined = pendingSpawnShell;
      if (cached.connectionId === 'local') {
        if (isWin32Platform()) {
          stamped = resolveLocalWindowsShellId(pendingSpawnShell);
        } else {
          const trimmed = pendingSpawnShell.trim();
          stamped = !trimmed || trimmed === 'default' ? undefined : trimmed;
        }
      }
      if (stamped) {
        store.setTerminalShellOverride(cached.connectionId, termId, stamped);
      }
    }
    const shellId = termTab?.shellOverride
      ?? pendingSpawnShell
      ?? (cached.connectionId === 'local' ? store.settings.localTerm?.windowsShell : undefined);
    scheduleZshAutosuggestProbe(termId, cached.connectionId, shellId);

    if (cached.connectionId === 'local') {
      let cwdHint = termTab?.lastKnownCwd ?? termTab?.initialPath;
      const wslShellId = resolveWslShellIdForPathCompletion(shellId, cwdHint);
      if (wslShellId && !cwdHint) {
        store.setTerminalCwd(cached.connectionId, termId, '~');
        cwdHint = '~';
      }
      if (wslShellId && shellIdIndicatesWsl(wslShellId)) {
        void fetchWslCwd(wslShellId)
          .then((linuxCwd) => {
            if (!linuxCwd) return;
            const current = terminalCache.get(termId);
            if (!current?.connectionId || current.generation !== readyGeneration) return;
            useAppStore.getState().setTerminalCwd(current.connectionId, termId, linuxCwd);
            prefetchWslHomeListing(wslShellId, linuxCwd);
          })
          .catch(() => {});
        prefetchWslHomeListing(wslShellId, cwdHint);
      }
    } else {
      let cwdHint = termTab?.lastKnownCwd ?? termTab?.initialPath;
      if (!cwdHint) {
        const fsCwdRequest = window.ipcRenderer.invoke('fs_cwd', {
          connectionId: cached.connectionId,
        }) as Promise<string>;
        let fsCwdTimeoutId: ReturnType<typeof setTimeout> | null = null;
        const fsCwdTimeout = new Promise<never>((_, reject) => {
          fsCwdTimeoutId = setTimeout(() => {
            reject(new Error('fs_cwd timeout'));
          }, REMOTE_FS_LIST_TIMEOUT_MS);
        });
        void Promise.race([fsCwdRequest, fsCwdTimeout])
          .then((path: unknown) => {
            if (typeof path !== 'string' || !path.trim()) return;
            const current = terminalCache.get(termId);
            if (!current?.connectionId || current.generation !== readyGeneration) return;
            ghostDebug('cwd', {
              source: 'fs_cwd-seed',
              connectionId: cached.connectionId,
              path: path.trim(),
            });
            store.setTerminalCwd(cached.connectionId!, termId, path.trim());
          })
          .catch((err: unknown) => {
            ghostDebug('cwd', {
              source: 'fs_cwd-seed',
              connectionId: cached.connectionId,
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            if (fsCwdTimeoutId !== null) {
              clearTimeout(fsCwdTimeoutId);
              fsCwdTimeoutId = null;
            }
          });
      }
    }
  }
  clearIdleHostSuspendNotice(termId);
  flushPendingInput(termId);
  return true;
}