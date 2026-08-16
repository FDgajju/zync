import type { FontWeight, Terminal } from '@xterm/xterm';
import type { TerminalFontWeightSetting } from '../../components/settings/constants/defaults.js';
import type { TerminalXtermSettings } from './xtermOptions.js';
import { refreshTerminalScreen } from './rendererLifecycle.js';
import { getTerminalRendererState } from './rendererSession.js';
import type { TerminalRendererKind } from './types.js';
import { terminalCache } from './terminalCache.js';

function isWindowsPlatform(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.electronUtils?.platform === 'win32') {
    return true;
  }
  return typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
}

/**
 * WebGL draws glyphs to a canvas atlas (grayscale AA). DOM uses native ClearType on Windows,
 * so GPU text often looks sharper/thinner. Add a pixel of letter-spacing on Win32 WebGL only.
 */
export function resolveTerminalLetterSpacing(rendererKind: TerminalRendererKind): number {
  if (rendererKind === 'webgl' && isWindowsPlatform()) {
    return 1;
  }
  return 0;
}

type WebglAddonWithAtlas = {
  dispose: () => void;
  clearTextureAtlas?: () => void;
};

/** Picks a bold weight one step above the regular terminal weight (capped at 900). */
export function resolveTerminalFontWeightBold(
  fontWeight: TerminalFontWeightSetting | 'normal' | undefined,
): FontWeight {
  if (typeof fontWeight === 'number' && fontWeight >= 100 && fontWeight <= 900) {
    return Math.min(900, fontWeight + 100) as FontWeight;
  }
  // `'normal'` / unknown → classic bold step
  return 'bold';
}

function resolveTypographyWeights(settings: TerminalXtermSettings): {
  fontWeight: FontWeight;
  fontWeightBold: FontWeight;
} {
  const nextWeight: FontWeight = settings.fontWeight ?? 'normal';
  // Normalize before xterm so regular + bold stay on the same weight ladder.
  const resolvedRegularWeight: TerminalFontWeightSetting | 'normal' =
    typeof nextWeight === 'number' && nextWeight >= 100 && nextWeight <= 900
      ? (nextWeight === 400 ? 'normal' : nextWeight as TerminalFontWeightSetting)
      : nextWeight === 'bold'
        ? 700
        : 'normal';
  const fontWeightBold = settings.fontWeightBold ?? resolveTerminalFontWeightBold(resolvedRegularWeight);

  return { fontWeight: resolvedRegularWeight, fontWeightBold };
}

export function buildWebglTypographyStamp(term: Terminal, sessionId: string): string {
  const rendererKind = getTerminalRendererState(sessionId).kind;
  return [
    term.options.fontFamily ?? '',
    term.options.fontSize ?? '',
    term.options.fontWeight ?? '',
    term.options.fontWeightBold ?? '',
    term.options.lineHeight ?? '',
    term.options.letterSpacing ?? 0,
    rendererKind,
  ].join('|');
}

/** Stamp from pending settings — used before term.options are applied. */
export function buildWebglTypographyStampFromSettings(
  settings: TerminalXtermSettings,
  sessionId: string,
): string {
  const rendererKind = getTerminalRendererState(sessionId).kind;
  const { fontWeight, fontWeightBold } = resolveTypographyWeights(settings);
  return [
    settings.fontFamily ?? '',
    settings.fontSize ?? '',
    fontWeight,
    fontWeightBold,
    settings.lineHeight ?? '',
    resolveTerminalLetterSpacing(rendererKind),
    rendererKind,
  ].join('|');
}

function clearWebglTextureAtlas(sessionId: string): void {
  const addon = getTerminalRendererState(sessionId).webglAddon as WebglAddonWithAtlas | undefined;
  addon?.clearTextureAtlas?.();
}

/** Applies live typography to one xterm instance and redraws the buffer. */
export function applyTerminalTypography(
  sessionId: string,
  term: Terminal,
  settings: TerminalXtermSettings,
): void {
  const { fontWeight: nextWeight, fontWeightBold: nextWeightBold } = resolveTypographyWeights(settings);

  const rendererState = getTerminalRendererState(sessionId);
  const rendererKind = rendererState.kind;

  term.options.fontSize = settings.fontSize;
  term.options.fontFamily = settings.fontFamily;
  term.options.fontWeight = nextWeight;
  term.options.fontWeightBold = nextWeightBold;
  term.options.cursorStyle = settings.cursorStyle;
  term.options.lineHeight = settings.lineHeight;
  term.options.letterSpacing = resolveTerminalLetterSpacing(rendererKind);

  rendererState.webglTypographyStamp = buildWebglTypographyStamp(term, sessionId);

  clearWebglTextureAtlas(sessionId);
  refreshTerminalScreen(term);

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      clearWebglTextureAtlas(sessionId);
      refreshTerminalScreen(term);
    });
  }
}

/** Refreshes typography on every cached terminal (active + background tabs). */
export function refreshAllCachedTerminalTypography(
  settings: TerminalXtermSettings,
): void {
  for (const [sessionId, cached] of terminalCache.entries()) {
    applyTerminalTypography(sessionId, cached.term, settings);
  }
}