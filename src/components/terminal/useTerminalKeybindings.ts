import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import { queueTerminalInput } from '../../lib/terminal';
import { ptyBytesForKeyEvent } from '../../lib/terminal/ptyKeyTranslations';
import {
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
} from '../settings/constants/defaults.js';
import type { TerminalSettingsSlice } from './useTerminalTheme';

export interface UseTerminalKeybindingsOptions {
  fontSize: number;
  updateTerminalSettings: (settings: Partial<TerminalSettingsSlice>) => void;
  isSearchOpenRef: MutableRefObject<boolean>;
  closeSearch: () => void;
  sessionId: string;
}

export function useTerminalKeybindings({
  fontSize,
  updateTerminalSettings,
  isSearchOpenRef,
  closeSearch,
  sessionId,
}: UseTerminalKeybindingsOptions) {
  const currentFontSizeRef = useRef(fontSize);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    currentFontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const attachKeybindings = useCallback((term: XTerm) => {
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') {
        return true;
      }

      // Capture-phase dispatcher already ran; don't also feed xterm
      // (including remapped chords that collide with PTY translations).
      if (e.defaultPrevented) {
        return false;
      }

      const ptyBytes = ptyBytesForKeyEvent(e);
      if (ptyBytes) {
        e.preventDefault();
        queueTerminalInput(sessionIdRef.current, ptyBytes);
        return false;
      }

      // Terminal font zoom while xterm is focused (app zoom is `when: app` only).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const currentSize = currentFontSizeRef.current;
        updateTerminalSettings({ fontSize: Math.min(currentSize + 1, TERMINAL_FONT_SIZE_MAX) });
        return false;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === '-') {
        e.preventDefault();
        const currentSize = currentFontSizeRef.current;
        updateTerminalSettings({ fontSize: Math.max(currentSize - 1, TERMINAL_FONT_SIZE_MIN) });
        return false;
      }

      if (e.key === 'Escape' && isSearchOpenRef.current) {
        closeSearch();
        term.focus();
        return false;
      }

      return true;
    });
  }, [closeSearch, isSearchOpenRef, updateTerminalSettings]);

  return { attachKeybindings };
}
