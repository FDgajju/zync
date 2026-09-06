import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal as XTerm } from '@xterm/xterm';

/** True when the xterm host element is connected and has non-zero layout size. */
export function isTerminalDomMeasurable(term: XTerm | null | undefined): boolean {
  const element = term?.element;
  if (!element?.isConnected) {
    return false;
  }

  return element.clientWidth > 0 && element.clientHeight > 0;
}

/** True when xterm has a live DOM host and render service (safe to call FitAddon.fit). */
export function isTerminalFitReady(
  term: XTerm | null | undefined,
  fitAddon: FitAddon | null | undefined,
): boolean {
  if (!term || !fitAddon) {
    return false;
  }

  if (!isTerminalDomMeasurable(term)) {
    return false;
  }

  const core = (term as { _core?: { _renderService?: unknown } })._core;
  return Boolean(core?._renderService);
}

/** Calls FitAddon.fit without throwing when the renderer is not ready yet. */
export function safeFitTerminal(
  fitAddon: FitAddon | null | undefined,
  term?: XTerm | null,
): boolean {
  if (!fitAddon || !isTerminalFitReady(term ?? null, fitAddon)) {
    return false;
  }

  try {
    fitAddon.fit();
    return true;
  } catch {
    return false;
  }
}

export interface ResizeScheduleOptions {
  forceSync?: boolean;
  /** If false, fit the UI only — do not send SIGWINCH to the PTY. */
  syncBackend?: boolean;
  /** If true, run immediately without debounce (e.g. post-setup or explicit user action). */
  immediate?: boolean;
}

/** Divider drag and split intro share this so PTY SIGWINCH waits until the size settles. */
let paneTransientDepth = 0;

function beginPaneTransient(): void {
  paneTransientDepth += 1;
}

function endPaneTransient(): void {
  paneTransientDepth = Math.max(0, paneTransientDepth - 1);
}

export function beginPaneDividerDrag(): void {
  beginPaneTransient();
}

export function endPaneDividerDrag(): void {
  endPaneTransient();
}

export function beginPaneSplitIntro(): void {
  beginPaneTransient();
}

/** @returns true when no divider drag or split intro is still holding PTY resize. */
export function endPaneSplitIntro(): boolean {
  endPaneTransient();
  return paneTransientDepth === 0;
}

export function isPaneSizeTransient(): boolean {
  return paneTransientDepth > 0;
}

/** True while a divider drag *or* split intro is in flight (PTY SIGWINCH held). */
export function isPaneDividerDragging(): boolean {
  return isPaneSizeTransient();
}

export interface ResizeScheduler {
  schedule: (options?: ResizeScheduleOptions) => void;
  cancel: () => void;
}

/**
 * Trailing-edge debounced resize scheduler (60ms default).
 * Unifies the multiple fit/sync call sites per the terminal roadmap (P1 5.2).
 */
export function createResizeScheduler(
  refit: (options?: { forceSync?: boolean; syncBackend?: boolean }) => void,
  delay = 60,
): ResizeScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = (opts?: { forceSync?: boolean; syncBackend?: boolean }) => {
    timer = null;
    refit(opts);
  };

  return {
    schedule(options) {
      const immediate = options?.immediate ?? false;
      const force = options?.forceSync ?? false;
      const syncBackend = options?.syncBackend ?? true;

      if (immediate) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        run({ forceSync: force, syncBackend });
        return;
      }

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => run({ forceSync: force, syncBackend }), delay);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}