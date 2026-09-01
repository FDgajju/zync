import type { AppSettings } from '../../store/settingsSlice';

export type KeyboardFocus = 'xterm' | 'field' | 'app';

/** Closed set — see docs/SHORTCUTS.md §5. */
export type ShortcutWhen = 'always' | 'xterm' | 'app' | 'field' | 'files';

export type ShortcutSection = 'global' | 'tabs' | 'terminal' | 'view' | 'files' | 'hidden';

export type KeybindingId = keyof AppSettings['keybindings'];

export type ShortcutCommand = {
    id: string;
    label: string;
    section: ShortcutSection;
    defaultKeys: string;
    /** Extra chords that run the same command (not shown in Settings). */
    extraKeys?: readonly string[];
    when: ShortcutWhen;
    /** User override in settings.keybindings. Omit for non-configurable chords. */
    settingsKey?: KeybindingId;
    configurable: boolean;
};
