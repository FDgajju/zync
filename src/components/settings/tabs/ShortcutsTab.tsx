import { defaultSettings, type AppSettings } from '../../../store/settingsSlice';
import { useAppStore } from '../../../store/useAppStore';
import {
    SHORTCUT_SECTIONS,
    catalogBySection,
    normalizeTerminalFocusPolicy,
} from '../../../features/shortcuts';
import { KeybindingRow } from '../common/KeybindingRow';
import { Section } from '../common/Section';
import { Toggle } from '../common/Toggle';

interface ShortcutsTabProps {
    settings: AppSettings;
    updateKeybindings: (updates: Partial<AppSettings['keybindings']>) => Promise<void>;
    updateKeyboardSettings: (updates: Partial<AppSettings['keyboard']>) => Promise<void>;
}

export function ShortcutsTab({ settings, updateKeybindings, updateKeyboardSettings }: ShortcutsTabProps) {
    const showToast = useAppStore((state) => state.showToast);
    const keybindings = settings.keybindings ?? defaultSettings.keybindings;
    const shellFirst = normalizeTerminalFocusPolicy(settings.keyboard?.terminalFocusPolicy) === 'shell';
    const handleKeybindingChange = (updates: Partial<AppSettings['keybindings']>) => {
        void updateKeybindings(updates).catch((error) => {
            console.error('Failed to update keybinding', error);
            const message = error instanceof Error ? error.message : String(error);
            showToast('error', `Failed to save keybinding: ${message}`);
        });
    };
    const handlePolicyChange = (preferShell: boolean) => {
        void updateKeyboardSettings({ terminalFocusPolicy: preferShell ? 'shell' : 'app' }).catch((error) => {
            console.error('Failed to update keyboard policy', error);
            const message = error instanceof Error ? error.message : String(error);
            showToast('error', `Failed to save shortcut policy: ${message}`);
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <Section title="When a terminal is focused">
                <Toggle
                    label="Give keys to the shell"
                    description="Ctrl+T, Ctrl+W, Ctrl+F, and Ctrl+N go to the shell. Sidebar (Ctrl+B), palette (Ctrl+P), and AI (Ctrl+I) still open Zync. Turn off so all Zync shortcuts win in the terminal."
                    checked={shellFirst}
                    onChange={handlePolicyChange}
                />
            </Section>
            {SHORTCUT_SECTIONS.map((section) => {
                const rows = catalogBySection(section.id);
                if (rows.length === 0) return null;
                return (
                    <Section key={section.id} title={section.title}>
                        <div className="space-y-2">
                            {rows.map((row) => (
                                <KeybindingRow
                                    key={row.id}
                                    label={row.label}
                                    binding={keybindings[row.settingsKey!]}
                                    onChange={(val) => handleKeybindingChange({ [row.settingsKey!]: val })}
                                />
                            ))}
                        </div>
                    </Section>
                );
            })}
        </div>
    );
}
