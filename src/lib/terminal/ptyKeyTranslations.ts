/**
 * VT sequences xterm.js does not emit. Not Zync app shortcuts — they belong
 * on the PTY whenever the terminal is focused. See docs/SHORTCUTS.md §7.
 */

const US = '\x1f';

export function isCtrlSlash(event: KeyboardEvent): boolean {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return false;
    }
    // Character `/`, not US-layout physical `Slash` (other layouts produce `-`, etc.).
    // Numpad `/` is kept via code because Ctrl can make `key` unhelpful.
    return event.key === '/' || event.code === 'NumpadDivide';
}

const TRANSLATIONS: Array<{ match: (event: KeyboardEvent) => boolean; data: string }> = [
    { match: isCtrlSlash, data: US },
];

export function ptyBytesForKeyEvent(event: KeyboardEvent): string | null {
    if (event.type !== 'keydown') {
        return null;
    }
    for (const row of TRANSLATIONS) {
        if (row.match(event)) {
            return row.data;
        }
    }
    return null;
}
