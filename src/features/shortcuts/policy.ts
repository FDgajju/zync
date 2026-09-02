import type { KeyboardFocus, ShortcutWhen } from './types';

/**
 * How `when: 'app'` commands behave while xterm is focused.
 * Does not change `always` / `xterm` / `files` / PTY translations.
 */
export type TerminalFocusShortcutPolicy = 'shell' | 'app';

export const DEFAULT_TERMINAL_FOCUS_SHORTCUT_POLICY: TerminalFocusShortcutPolicy = 'shell';

const POLICIES = new Set<TerminalFocusShortcutPolicy>(['shell', 'app']);

export function normalizeTerminalFocusPolicy(value: unknown): TerminalFocusShortcutPolicy {
    if (typeof value === 'string' && POLICIES.has(value as TerminalFocusShortcutPolicy)) {
        return value as TerminalFocusShortcutPolicy;
    }
    return DEFAULT_TERMINAL_FOCUS_SHORTCUT_POLICY;
}

export type KeyboardSettings = {
    terminalFocusPolicy: TerminalFocusShortcutPolicy;
};

export const DEFAULT_KEYBOARD_SETTINGS: KeyboardSettings = {
    terminalFocusPolicy: DEFAULT_TERMINAL_FOCUS_SHORTCUT_POLICY,
};

export function normalizeKeyboardSettings(raw: unknown): KeyboardSettings {
    const source = raw && typeof raw === 'object' ? (raw as Partial<KeyboardSettings>) : {};
    return {
        terminalFocusPolicy: normalizeTerminalFocusPolicy(source.terminalFocusPolicy),
    };
}

/**
 * `policy` only widens `when: 'app'` onto xterm when the user chose Zync-first.
 * PTY mappings are not gated here — they run in xterm if the dispatcher did not consume the event.
 */
export function allowsWhen(
    when: ShortcutWhen,
    focus: KeyboardFocus,
    policy: TerminalFocusShortcutPolicy = DEFAULT_TERMINAL_FOCUS_SHORTCUT_POLICY,
): boolean {
    switch (when) {
        case 'always':
            return true;
        case 'xterm':
            return focus === 'xterm';
        case 'app':
            if (focus === 'app') return true;
            if (focus === 'xterm' && policy === 'app') return true;
            return false;
        case 'field':
            return false;
        case 'files':
            return false;
        default:
            return false;
    }
}
