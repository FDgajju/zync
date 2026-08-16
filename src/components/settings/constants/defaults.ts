import type { FontWeight } from '@xterm/xterm';

export const DEFAULT_GLOBAL_FONT_STACK =
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Ubuntu, Cantarell, Arial, sans-serif";
export const DEFAULT_GLOBAL_FONT_SIZE = 14;

export const DEFAULT_TERMINAL_FONT_STACK =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
export const DEFAULT_TERMINAL_FONT_STACK_WIN32 =
    "Consolas, 'Cascadia Mono', 'Cascadia Code', ui-monospace, monospace";
export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const DEFAULT_TERMINAL_FONT_SIZE_WIN32 = 15;
export const DEFAULT_TERMINAL_FONT_WEIGHT = 'normal' satisfies FontWeight;
export const DEFAULT_TERMINAL_FONT_WEIGHT_WIN32 = 500 satisfies FontWeight;
export const DEFAULT_TERMINAL_FONT_WEIGHT_BOLD = 'bold' satisfies FontWeight;
export const DEFAULT_TERMINAL_PADDING = 12;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1.2;
export const DEFAULT_TERMINAL_LIGATURES = false;
export const DEFAULT_TERMINAL_GPU_ACCELERATION = true;

/** CSS numeric weights xterm accepts for regular terminal text (plus `'normal'` = 400). */
export type TerminalFontWeightSetting =
    | 'normal'
    | 100
    | 200
    | 300
    | 500
    | 600
    | 700
    | 800
    | 900;

export const TERMINAL_FONT_WEIGHT_OPTIONS: ReadonlyArray<{
    value: TerminalFontWeightSetting;
    label: string;
    description: string;
}> = [
    { value: 100, label: 'Thin (100)', description: 'Hairline — only if the font ships this face' },
    { value: 200, label: 'Extra Light (200)', description: 'Very light stroke' },
    { value: 300, label: 'Light (300)', description: 'Light regular text' },
    { value: 'normal', label: 'Regular (400)', description: 'Default xterm weight' },
    { value: 500, label: 'Medium (500)', description: 'Recommended on Windows for thin monospace fonts' },
    { value: 600, label: 'Semi-bold (600)', description: 'Heavier strokes for high-DPI displays' },
    { value: 700, label: 'Bold (700)', description: 'Bold regular text (not ANSI bold)' },
    { value: 800, label: 'Extra Bold (800)', description: 'Heavier bold face when available' },
    { value: 900, label: 'Black (900)', description: 'Heaviest face when available' },
];

function isWindowsPlatform(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    const platform = window.electronUtils?.platform;
    if (platform === 'win32') {
        return true;
    }
    return typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
}

export function resolveDefaultTerminalTypography(): {
    fontFamily: string;
    fontSize: number;
    fontWeight: TerminalFontWeightSetting;
} {
    if (isWindowsPlatform()) {
        return {
            fontFamily: DEFAULT_TERMINAL_FONT_STACK_WIN32,
            fontSize: DEFAULT_TERMINAL_FONT_SIZE_WIN32,
            fontWeight: DEFAULT_TERMINAL_FONT_WEIGHT_WIN32,
        };
    }

    return {
        fontFamily: DEFAULT_TERMINAL_FONT_STACK,
        fontSize: DEFAULT_TERMINAL_FONT_SIZE,
        fontWeight: DEFAULT_TERMINAL_FONT_WEIGHT,
    };
}
export {
    DEFAULT_SUSPEND_IDLE_HOST_PTYS,
    DEFAULT_IDLE_HOST_PTY_SUSPEND_MINUTES,
} from '../../../lib/terminal/terminalIdlePty.js';
