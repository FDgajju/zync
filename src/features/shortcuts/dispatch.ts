import { matchShortcut } from '../../lib/shortcuts';
import { defaultSettings } from '../../store/settingsSlice';
import { useAppStore } from '../../store/useAppStore';
import { runShortcutCommand } from './actions';
import { SHORTCUT_CATALOG } from './catalog';
import { keyboardFocus } from './focus';
import { allowsWhen, normalizeTerminalFocusPolicy } from './policy';
import type { ShortcutCommand } from './types';

function chordsFor(command: ShortcutCommand): string[] {
    const overrides = useAppStore.getState().settings.keybindings ?? defaultSettings.keybindings;
    const primary = command.settingsKey
        ? (overrides[command.settingsKey] || command.defaultKeys)
        : command.defaultKeys;
    const extra = command.extraKeys ?? [];
    return [primary, ...extra].filter(Boolean);
}

/**
 * If a Zync command owns this event, run it and return true (caller should preventDefault).
 * PTY mappings are handled in the xterm key handler, not here.
 */
export function dispatchAppShortcut(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') {
        return false;
    }
    const focus = keyboardFocus(event.target);
    const policy = normalizeTerminalFocusPolicy(
        useAppStore.getState().settings.keyboard?.terminalFocusPolicy,
    );
    for (const command of SHORTCUT_CATALOG) {
        if (!allowsWhen(command.when, focus, policy)) {
            continue;
        }
        const chords = chordsFor(command);
        if (!chords.some((chord) => matchShortcut(event, chord))) {
            continue;
        }
        return runShortcutCommand(command.id, event);
    }
    return false;
}
