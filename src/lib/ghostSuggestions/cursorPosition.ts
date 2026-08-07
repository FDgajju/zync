/**
 * getCursorPixelPosition — converts xterm cursor cell coordinates to pixel
 * coordinates relative to the ghost overlay parent.
 *
 * Cell width: prefer `.xterm-char-measure-element` (subpixel glyph advance).
 * Cell height: prefer viewport (`screenHeight / rows`) — char-measure uses
 * `line-height: normal` and underestimates row pitch when xterm `lineHeight` > 1,
 * which stacks into multi-row vertical misalignment (ghost text above the caret).
 */

import type { Terminal } from '@xterm/xterm';

export interface CursorPixelPosition {
  left: number;
  top: number;
  cellWidth: number;
  cellHeight: number;
}

export interface TerminalCellDimensions {
  width: number;
  height: number;
}

function measureCellFromDom(term: Terminal): TerminalCellDimensions | null {
  const measure = term.element?.querySelector('.xterm-char-measure-element');
  if (!measure || !(measure instanceof HTMLElement)) {
    return null;
  }

  const sampleLength = Math.max(1, measure.textContent?.length ?? 1);
  const rect = measure.getBoundingClientRect();
  const width = rect.width / sampleLength;
  const height = rect.height;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function estimateCellFromViewport(term: Terminal): TerminalCellDimensions | null {
  const cols = term.cols;
  const rows = term.rows;
  if (cols <= 0 || rows <= 0) {
    return null;
  }

  const screen = term.element?.querySelector('.xterm-screen');
  const screenRect = screen instanceof HTMLElement ? screen.getBoundingClientRect() : null;
  const hostRect = term.element?.getBoundingClientRect();
  const width = screenRect?.width ?? hostRect?.width ?? 0;
  const height = screenRect?.height ?? hostRect?.height ?? 0;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: width / cols,
    height: height / rows,
  };
}

/**
 * Merge char-measure (width-accurate) with viewport (height-accurate) samples.
 * @internal exported for unit tests
 */
export function mergeTerminalCellDimensions(
  fromDom: TerminalCellDimensions | null,
  fromViewport: TerminalCellDimensions | null,
): TerminalCellDimensions | null {
  if (fromDom && fromViewport) {
    return {
      width: fromDom.width,
      height: fromViewport.height,
    };
  }
  return fromDom ?? fromViewport;
}

export function getTerminalCellDimensions(term: Terminal): TerminalCellDimensions | null {
  return mergeTerminalCellDimensions(
    measureCellFromDom(term),
    estimateCellFromViewport(term),
  );
}

function getOverlayRoot(term: Terminal): HTMLElement | null {
  const container = term.element?.closest('.terminal-container');
  return container?.parentElement instanceof HTMLElement ? container.parentElement : null;
}

function rootRelativeCursorPosition(
  screen: HTMLElement,
  root: HTMLElement,
  cursorLeft: number,
  cursorTop: number,
  dims: TerminalCellDimensions,
): CursorPixelPosition {
  const screenRect = screen.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    left: screenRect.left - rootRect.left + cursorLeft,
    top: screenRect.top - rootRect.top + cursorTop,
    cellWidth: dims.width,
    cellHeight: dims.height,
  };
}

/**
 * Where the typed line began on screen (column/row of the first character).
 * Captured on the first keystroke of a line, before remote echo advances the cursor.
 */
export interface GhostLineOrigin {
  col: number;
  row: number;
}

export interface GhostLayoutHint {
  /** Display cells already typed locally (InputTracker line buffer length). */
  typedCellCount: number;
  /** Screen position of the first typed cell; null → fall back to live cursor. */
  origin: GhostLineOrigin | null;
}

/**
 * Wrap origin + typed cells into a terminal (col, row).
 * When the logical row would fall past the viewport, clamp to the last row
 * (xterm scrolls so the caret stays on-screen).
 * @internal exported for unit tests
 */
export function wrapCellPosition(
  originCol: number,
  originRow: number,
  typedCellCount: number,
  cols: number,
  rows?: number,
): { col: number; row: number } {
  const width = Math.max(1, cols);
  let col = originCol + Math.max(0, typedCellCount);
  let row = originRow;
  if (col >= width) {
    row += Math.floor(col / width);
    col = col % width;
  }
  if (row < 0) {
    row = 0;
  }
  // Viewport clamp: cursorY in xterm is 0..rows-1 after scroll.
  if (rows != null && rows > 0 && row >= rows) {
    row = rows - 1;
  }
  return { col, row };
}

/**
 * Choose ghost cell when the live caret may lag behind local typing (SSH).
 * @internal exported for unit tests
 */
export function resolveGhostCellPosition(
  cursorCol: number,
  cursorRow: number,
  origin: GhostLineOrigin,
  typedCellCount: number,
  cols: number,
  rows?: number,
): { col: number; row: number } {
  const predicted = wrapCellPosition(origin.col, origin.row, typedCellCount, cols, rows);
  const cursorLags =
    cursorRow < predicted.row
    || (cursorRow === predicted.row && cursorCol < predicted.col);
  const originLost =
    Math.abs(cursorRow - origin.row) > 3
    && Math.abs(cursorRow - predicted.row) > 3;
  if (cursorLags && !originLost) {
    return predicted;
  }
  return { col: cursorCol, row: cursorRow };
}

/**
 * Pixel position for the ghost suffix.
 *
 * Prefer the predicted end of the *local* typed line (origin + typed length) so
 * SSH/local-echo lag cannot pin the overlay to a stale xterm cursor while the
 * suggestion text already includes newer keystrokes.
 */
export function getGhostPixelPosition(
  term: Terminal,
  layout?: GhostLayoutHint | null,
): CursorPixelPosition {
  try {
    const dims = getTerminalCellDimensions(term);
    if (!dims) {
      return { left: 0, top: 0, cellWidth: 0, cellHeight: 0 };
    }

    const buf = term.buffer.active;
    let cellX = buf.cursorX;
    let cellY = buf.cursorY;

    if (layout && layout.typedCellCount > 0 && layout.origin) {
      const resolved = resolveGhostCellPosition(
        buf.cursorX,
        buf.cursorY,
        layout.origin,
        layout.typedCellCount,
        term.cols,
        term.rows,
      );
      cellX = resolved.col;
      cellY = resolved.row;
    }

    const cursorLeft = cellX * dims.width;
    const cursorTop = cellY * dims.height;

    const screen = term.element?.querySelector('.xterm-screen');
    if (!(screen instanceof HTMLElement)) {
      return { left: 0, top: 0, cellWidth: dims.width, cellHeight: dims.height };
    }

    const overlayRoot = getOverlayRoot(term);
    if (overlayRoot) {
      return rootRelativeCursorPosition(screen, overlayRoot, cursorLeft, cursorTop, dims);
    }

    const container = term.element?.closest('.terminal-container');
    if (container?.parentElement instanceof HTMLElement) {
      return rootRelativeCursorPosition(
        screen,
        container.parentElement,
        cursorLeft,
        cursorTop,
        dims,
      );
    }

    if (term.element instanceof HTMLElement) {
      return rootRelativeCursorPosition(screen, term.element, cursorLeft, cursorTop, dims);
    }

    return { left: 0, top: 0, cellWidth: dims.width, cellHeight: dims.height };
  } catch {
    return { left: 0, top: 0, cellWidth: 0, cellHeight: 0 };
  }
}

/** Live xterm caret position (no lag compensation). */
export function getCursorPixelPosition(term: Terminal): CursorPixelPosition {
  return getGhostPixelPosition(term, null);
}