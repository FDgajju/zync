import { Minus, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
    DEFAULT_TERMINAL_GPU_ACCELERATION,
    TERMINAL_FONT_SIZE_MAX,
    TERMINAL_FONT_SIZE_MIN,
} from '../settings/constants/defaults';
import { Toggle } from '../settings/common/Toggle';
import { cn } from '../../lib/utils';
import { normalizeTerminalFocusPolicy } from '../../features/shortcuts';
import { formatShortcutLabel } from '../../lib/shortcuts';

const CURSOR_STYLES = [
    { id: 'block' as const, label: 'Block' },
    { id: 'bar' as const, label: 'Bar' },
    { id: 'underline' as const, label: 'Line' },
];

export function TerminalQuickSettings() {
    const settings = useAppStore((s) => s.settings);
    const updateTerminalSettings = useAppStore((s) => s.updateTerminalSettings);
    const updateKeyboardSettings = useAppStore((s) => s.updateKeyboardSettings);
    const showToast = useAppStore((s) => s.showToast);

    const fontSize = settings.terminal.fontSize;
    const gpu = settings.terminal.gpuAcceleration ?? DEFAULT_TERMINAL_GPU_ACCELERATION;
    const shellFirst = normalizeTerminalFocusPolicy(settings.keyboard?.terminalFocusPolicy) === 'shell';

    const fail = (label: string, error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        showToast('error', `Failed to save ${label}: ${message}`);
    };

    const bumpFont = (delta: number) => {
        const next = Math.max(TERMINAL_FONT_SIZE_MIN, Math.min(TERMINAL_FONT_SIZE_MAX, fontSize + delta));
        if (next === fontSize) return;
        void updateTerminalSettings({ fontSize: next }).catch((e) => fail('font size', e));
    };

    return (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-app-border/40 px-2 py-2 space-y-3">
            <p className="px-1 text-[10px] text-app-muted leading-relaxed">
                Quick controls for this session. Full options stay in Settings.
            </p>

            <div className="rounded-lg border border-app-border/40 bg-app-surface/20 px-2 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-app-text">Font size</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="h-6 w-6 rounded-md border border-app-border/40 text-app-muted hover:text-app-text hover:bg-app-surface flex items-center justify-center"
                            onClick={() => bumpFont(-1)}
                            aria-label="Decrease font size"
                        >
                            <Minus size={10} />
                        </button>
                        <span className="w-8 text-center text-[11px] font-mono text-app-accent">{fontSize}</span>
                        <button
                            type="button"
                            className="h-6 w-6 rounded-md border border-app-border/40 text-app-muted hover:text-app-text hover:bg-app-surface flex items-center justify-center"
                            onClick={() => bumpFont(1)}
                            aria-label="Increase font size"
                        >
                            <Plus size={10} />
                        </button>
                    </div>
                </div>

                <div className="space-y-1">
                    <span className="text-[11px] font-medium text-app-text">Cursor</span>
                    <div className="flex gap-1" role="group" aria-label="Cursor style">
                        {CURSOR_STYLES.map((style) => (
                            <button
                                key={style.id}
                                type="button"
                                onClick={() => {
                                    void updateTerminalSettings({ cursorStyle: style.id }).catch((e) => fail('cursor', e));
                                }}
                                className={cn(
                                    'flex-1 h-7 rounded-md text-[10px] font-medium border transition-colors',
                                    settings.terminal.cursorStyle === style.id
                                        ? 'border-app-accent/50 bg-app-accent/15 text-app-text'
                                        : 'border-app-border/40 text-app-muted hover:text-app-text hover:bg-app-surface/40',
                                )}
                            >
                                {style.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-app-border/40 bg-app-surface/20 overflow-hidden">
                <Toggle
                    label="GPU renderer"
                    description="WebGL when available"
                    checked={gpu}
                    onChange={(v) => {
                        void updateTerminalSettings({ gpuAcceleration: v }).catch((e) => fail('GPU', e));
                    }}
                />
                <Toggle
                    label="Give keys to the shell"
                    description={`${formatShortcutLabel('Mod+T')}, ${formatShortcutLabel('Mod+W')}, ${formatShortcutLabel('Mod+F')}, and ${formatShortcutLabel('Mod+N')} stay in the shell. ${formatShortcutLabel('Mod+B')}, ${formatShortcutLabel('Mod+P')}, and ${formatShortcutLabel('Mod+I')} still open Zync.`}
                    checked={shellFirst}
                    onChange={(v) => {
                        void updateKeyboardSettings({ terminalFocusPolicy: v ? 'shell' : 'app' }).catch((e) =>
                            fail('shortcut policy', e),
                        );
                    }}
                />
            </div>
        </div>
    );
}
