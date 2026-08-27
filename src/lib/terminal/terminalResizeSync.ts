import type { Terminal as XTerm } from '@xterm/xterm';
import { safeFitTerminal } from './terminalFit.js';
import { terminalCache } from './terminalCache.js';

export type TerminalSize = { rows: number; cols: number };

function sizesEqual(a: TerminalSize | null | undefined, b: TerminalSize | null | undefined): boolean {
  return Boolean(a && b && a.rows === b.rows && a.cols === b.cols);
}

function isPtyLive(cached: NonNullable<ReturnType<typeof terminalCache.get>>): boolean {
  return Boolean(cached.spawned && !cached.starting);
}

function sendResize(termId: string, size: TerminalSize): void {
  window.ipcRenderer.send('terminal:resize', { termId, ...size });
}

/**
 * Records the latest UI size and sends it to the backend when the PTY is live.
 * While starting / not spawned, desired size is retained and flushed on ready.
 */
export function syncTerminalResize(termId: string | null | undefined, term: XTerm): void {
  if (!termId) {
    return;
  }

  const cached = terminalCache.get(termId);
  if (!cached) {
    return;
  }

  const nextSize: TerminalSize = { rows: term.rows, cols: term.cols };
  cached.desiredResize = nextSize;

  if (!isPtyLive(cached)) {
    return;
  }

  if (sizesEqual(cached.lastResize, nextSize)) {
    return;
  }

  sendResize(termId, nextSize);
  // Assign cache only after send (if send fails we will retry on next sync).
  cached.lastResize = nextSize;
}

/**
 * Applies the current fitted size to a live PTY (e.g. after terminal-ready).
 * Returns true when a resize IPC was sent.
 */
export function flushTerminalResize(termId: string | null | undefined): boolean {
  if (!termId) {
    return false;
  }

  const cached = terminalCache.get(termId);
  if (!cached || !isPtyLive(cached)) {
    return false;
  }

  safeFitTerminal(cached.fitAddon, cached.term);

  const nextSize: TerminalSize = {
    rows: cached.term.rows,
    cols: cached.term.cols,
  };
  cached.desiredResize = nextSize;

  if (sizesEqual(cached.lastResize, nextSize)) {
    return false;
  }

  sendResize(termId, nextSize);
  cached.lastResize = nextSize;
  return true;
}

/** Clears desired + last-sent resize state (reconnect / suspend / exit). */
export function clearTerminalResizeState(termId: string | null | undefined): void {
  if (!termId) {
    return;
  }

  const cached = terminalCache.get(termId);
  if (!cached) {
    return;
  }

  cached.desiredResize = null;
  cached.lastResize = null;
}
