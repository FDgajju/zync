import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppStore } from './useAppStore';
import { CODEMIRROR_EDITOR_ID } from '../components/editor/providers';
import {
    DEFAULT_IDLE_HOST_PTY_SUSPEND_MINUTES,
    DEFAULT_SUSPEND_IDLE_HOST_PTYS,
    normalizeIdleHostPtySuspendMinutes,
} from '../lib/terminal/terminalIdlePty.js';
import type { FontWeight } from '@xterm/xterm';
import {
    resolveDefaultTerminalTypography,
    TERMINAL_FONT_SIZE_MAX,
    TERMINAL_FONT_SIZE_MIN,
    type TerminalFontWeightSetting,
} from '../components/settings/constants/defaults';
import { resolveTerminalFontWeightBold } from '../lib/terminal/terminalTypography.js';
import { DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS } from '../features/connections/domain/connectionDisplay.js';
import { refreshConnectionTabTitles } from '../features/connections/application/tabService.js';
import {
    DEFAULT_NOTIFICATION_SETTINGS,
    normalizeNotificationSettings,
    type NotificationSettings,
} from '../features/notifications';
import {
    DEFAULT_STATUS_BAR_SETTINGS,
    normalizeStatusBarSettings,
} from '../features/statusBar/settings.js';
import type { StatusBarSettings } from '../features/statusBar/types.js';
import {
    DEFAULT_SURVEY_SETTINGS,
    normalizeSurveySettings,
} from '../features/survey/settings.js';
import type { SurveySettings } from '../features/survey/types.js';

export interface AppSettings {
    theme: string;
    globalFontFamily: string;
    globalFontSize: number;
    iconTheme: string;
    accentColor?: string | null;
    editor: {
        defaultProvider: string;
    };
    windowOpacity: number;
    enableVibrancy: boolean;
    compactMode: boolean;
    sidebarWidth: number;
    sidebarCollapsed: boolean;
    sidebarSections: {
        vaultExpanded: boolean;
    };
    terminal: {
        fontSize: number;
        fontFamily: string;
        fontWeight: TerminalFontWeightSetting;
        fontWeightBold: FontWeight;
        fontLigatures: boolean;
        /** WebGL2 GPU renderer; falls back to DOM when unavailable. */
        gpuAcceleration: boolean;
        /**
         * When enabled, suspend background workspace host PTYs after idleHostPtySuspendMinutes.
         * Scrollback is preserved; press Enter on return to respawn (off by default — SSH respawn UX).
         */
        suspendIdleHostPtys?: boolean;
        /** Minutes before background host PTYs suspend when suspendIdleHostPtys is enabled. */
        idleHostPtySuspendMinutes?: number;
        cursorStyle: 'block' | 'underline' | 'bar';
        lineHeight: number;
        padding: number;
    };
    fileManager: {
        showHiddenFiles: boolean;
        confirmDelete: boolean;
        defaultDownloadPath: string;
    };
    localTerm: {
        windowsShell: string;
        pinnedFeatures?: string[];
    };
    ghostSuggestions: {
        inlineEnabled: boolean;
        contextMenuEnabled: boolean;
        /** Auto: suppress on fish; zsh only when autosuggestions plugin detected. Off: suppress all native shells. */
        nativeShellPolicy: 'auto' | 'always' | 'off';
        /** P7: one-time import of remote ~/.zsh_history / ~/.bash_history on SSH connect. */
        importRemoteHistoryOnConnect: boolean;
        providers: {
            history: boolean;
            filesystem: boolean;
        };
    };
    keybindings: {
        toggleSidebar: string;
        openNewConnection: string;
        newLocalTerminal: string;
        newHostTerminal: string;
        toggleSettings: string;
        closeTab: string;
        closeTerminalTab: string;
        commandPalette: string;
        switchTabNext: string;
        switchTabPrev: string;
        // Terminal
        termCopy: string;
        termPaste: string;
        termFind: string;
        // View
        zoomIn: string;
        zoomOut: string;
        // Tab Jumping (1-9)
        switchTab1: string;
        switchTab2: string;
        switchTab3: string;
        switchTab4: string;
        switchTab5: string;
        switchTab6: string;
        switchTab7: string;
        switchTab8: string;
        switchTab9: string;

        // File Manager
        fmCopy: string;
        fmCut: string;
        fmPaste: string;
        fmSelectAll: string;
        fmRename: string;
        fmDelete: string;
        fmEditPath: string;
        fmOpen: string;
        fmUp: string;
        fmBack: string;
        fmForward: string;
        fmSearch: string;
        aiCommandBar: string;
    };
    expandedFolders: string[];
    ai: {
        provider: 'ollama' | 'gemini' | 'openai' | 'claude' | 'groq' | 'mistral';
        model?: string;
        ollamaUrl?: string;
        enabled: boolean;
    };
    lastSeenVersion: string;
    privacy: {
        /** When true, browse lists show username@host. When false, show labels/tags (safer for screen share). */
        showHostAddressesInLists: boolean;
    };
    notifications: NotificationSettings;
    statusBar: StatusBarSettings;
    survey: SurveySettings;
}

export const defaultSettings: AppSettings = {
    theme: 'dark',
    globalFontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Ubuntu, Cantarell, Arial, sans-serif",
    globalFontSize: 14,
    iconTheme: 'vscode-icons',
    accentColor: null,
    editor: {
        defaultProvider: CODEMIRROR_EDITOR_ID
    },
    windowOpacity: 1.0,
    enableVibrancy: false,
    compactMode: true,
    sidebarWidth: 288,
    sidebarCollapsed: false,
    sidebarSections: {
        vaultExpanded: true,
    },
    expandedFolders: [],
    ai: {
        provider: 'ollama',
        ollamaUrl: 'http://localhost:11434',
        enabled: true,
    },
    lastSeenVersion: '',
    privacy: {
        showHostAddressesInLists: DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS,
    },
    notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
    statusBar: { ...DEFAULT_STATUS_BAR_SETTINGS },
    survey: { ...DEFAULT_SURVEY_SETTINGS },
    terminal: {
        ...(() => {
            const typography = resolveDefaultTerminalTypography();
            return {
                fontSize: typography.fontSize,
                fontFamily: typography.fontFamily,
                fontWeight: typography.fontWeight,
                fontWeightBold: resolveTerminalFontWeightBold(typography.fontWeight),
            };
        })(),
        fontLigatures: false,
        gpuAcceleration: true,
        suspendIdleHostPtys: DEFAULT_SUSPEND_IDLE_HOST_PTYS,
        idleHostPtySuspendMinutes: DEFAULT_IDLE_HOST_PTY_SUSPEND_MINUTES,
        cursorStyle: 'block',
        lineHeight: 1.2,
        padding: 12
    },
    fileManager: {
        showHiddenFiles: true,
        confirmDelete: true,
        defaultDownloadPath: ''
    },
    localTerm: {
        windowsShell: 'default'
    },
    ghostSuggestions: {
        inlineEnabled: true,
        contextMenuEnabled: false,
        nativeShellPolicy: 'auto',
        importRemoteHistoryOnConnect: false,
        providers: {
            history: true,
            filesystem: true,
        },
    },
    keybindings: {
        toggleSidebar: 'Mod+B',
        openNewConnection: 'Mod+N',
        newLocalTerminal: 'Mod+T',
        newHostTerminal: 'Mod+Shift+T',
        toggleSettings: 'Mod+,',
        closeTab: 'Mod+W',
        closeTerminalTab: 'Mod+Shift+W',
        commandPalette: 'Mod+P',
        switchTabNext: 'Ctrl+Tab',
        switchTabPrev: 'Ctrl+Shift+Tab',
        // Terminal
        termCopy: 'Mod+Shift+C',
        termPaste: 'Mod+Shift+V',
        termFind: 'Mod+F',
        // View
        zoomIn: 'Mod+=',
        zoomOut: 'Mod+-',
        // Tab Jumping
        switchTab1: 'Mod+1',
        switchTab2: 'Mod+2',
        switchTab3: 'Mod+3',
        switchTab4: 'Mod+4',
        switchTab5: 'Mod+5',
        switchTab6: 'Mod+6',
        switchTab7: 'Mod+7',
        switchTab8: 'Mod+8',
        switchTab9: 'Mod+9',

        // File Manager
        fmCopy: 'Mod+C',
        fmCut: 'Mod+X',
        fmPaste: 'Mod+V',
        fmSelectAll: 'Mod+A',
        fmRename: 'F2',
        fmDelete: 'Delete',
        fmEditPath: 'Mod+L',
        fmOpen: 'Enter',
        fmUp: 'Backspace',
        fmBack: 'Alt+Left',
        fmForward: 'Alt+Right',
        fmSearch: 'Mod+F',
        aiCommandBar: 'Mod+I',
    }
};

function normalizeTerminalFontWeightBold(fontWeight: unknown): FontWeight | undefined {
    if (fontWeight === 'normal' || fontWeight === 400 || fontWeight === '400') {
        return 'normal';
    }
    if (fontWeight === 'bold' || fontWeight === 700 || fontWeight === '700') {
        return 'bold';
    }
    if (typeof fontWeight === 'number' && fontWeight >= 100 && fontWeight <= 900) {
        return fontWeight;
    }
    if (typeof fontWeight === 'string' && /^[1-9]00$/.test(fontWeight)) {
        return fontWeight as FontWeight;
    }
    return undefined;
}

function normalizeTerminalFontSize(fontSize: unknown): number | undefined {
    if (typeof fontSize !== 'number' || !Number.isFinite(fontSize)) {
        return undefined;
    }
    return Math.max(TERMINAL_FONT_SIZE_MIN, Math.min(TERMINAL_FONT_SIZE_MAX, Math.round(fontSize)));
}

function normalizeTerminalFontWeight(fontWeight: unknown): TerminalFontWeightSetting | undefined {
    if (fontWeight === 'normal' || fontWeight === 400 || fontWeight === '400') {
        return 'normal';
    }
    if (fontWeight === 'bold' || fontWeight === 700 || fontWeight === '700') {
        return 700;
    }
    const numeric = typeof fontWeight === 'number'
        ? fontWeight
        : typeof fontWeight === 'string' && /^[1-9]00$/.test(fontWeight)
            ? Number(fontWeight)
            : undefined;
    // Full CSS weight ladder (100–900). 400 maps to `'normal'` above.
    if (
        numeric === 100
        || numeric === 200
        || numeric === 300
        || numeric === 500
        || numeric === 600
        || numeric === 700
        || numeric === 800
        || numeric === 900
    ) {
        return numeric;
    }
    return undefined;
}

/**
 * Load-time font family normalization.
 * Custom stacks (including Nerd Font first families) must pass through unchanged (#93).
 * Only expand legacy single-name aliases into built-in preset stacks.
 */
function normalizeTerminalFontFamily(fontFamily: string | undefined): string | undefined {
    if (typeof fontFamily !== 'string' || !fontFamily.trim()) return undefined;
    const trimmed = fontFamily.trim();
    const families = trimmed
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);

    // Multi-family stacks are user customizations — never rewrite them.
    if (families.length !== 1) {
        return trimmed;
    }

    const sole = families[0] ?? '';
    const lower = sole.toLowerCase();
    const compact = sole.replace(/[-_\s]+/g, '').toLowerCase();

    if (lower === 'fira code' || compact === 'firacode') {
        return "'Fira Code', 'Fira Code VF', 'FiraCode Nerd Font', 'FiraCode NFM', 'Cascadia Code', Consolas, 'Courier New', monospace";
    }
    if (lower === 'jetbrains mono' || compact === 'jetbrainsmono') {
        return "'JetBrains Mono', 'JetBrainsMono Nerd Font', 'JetBrainsMono NFM', 'Cascadia Mono', Consolas, 'Courier New', monospace";
    }
    if (lower === 'menlo' || compact === 'menlo') {
        return "Menlo, Monaco, Consolas, 'Courier New', monospace";
    }
    return trimmed;
}

async function persistSettings(settings: Record<string, unknown>): Promise<void> {
    await invoke('settings_set', { settings });
}

/** Built-in settings sidebar tabs (matches SettingsModal). */
export type SettingsTabId =
    | 'general'
    | 'terminal'
    | 'appearance'
    | 'statusBar'
    | 'fileManager'
    | 'shortcuts'
    | 'plugins'
    | 'ai'
    | 'feedback'
    | 'about';

export interface SettingsSlice {
    settings: AppSettings;
    isSettingsOpen: boolean;
    /** When set, SettingsModal focuses this tab on open, then clears it. */
    settingsFocusTab: SettingsTabId | null;
    isLoadingSettings: boolean;
    appRoot: string | null;

    // Actions
    updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
    updateAiSettings: (updates: Partial<AppSettings['ai']>) => Promise<void>;
    updateEditorSettings: (updates: Partial<AppSettings['editor']>) => Promise<void>;
    updateSidebarSectionsSettings: (updates: Partial<AppSettings['sidebarSections']>) => Promise<void>;
    updateTerminalSettings: (updates: Partial<AppSettings['terminal']>) => Promise<void>;
    updateLocalTermSettings: (updates: Partial<AppSettings['localTerm']>) => Promise<void>;
    updateFileManagerSettings: (updates: Partial<AppSettings['fileManager']>) => Promise<void>;
    updateStatusBarSettings: (updates: Partial<AppSettings['statusBar']>) => Promise<void>;
    updateSurveySettings: (updates: Partial<AppSettings['survey']>) => Promise<void>;
    updateGhostSuggestionsSettings: (updates: Partial<AppSettings['ghostSuggestions']>) => Promise<void>;
    updateKeybindings: (updates: Partial<AppSettings['keybindings']>) => Promise<void>;
    toggleExpandedFolder: (folderPath: string) => Promise<void>;
    /** In-memory only (responsive layout). Does not write settings.json. */
    setSidebarCollapsedLocal: (collapsed: boolean) => void;

    openSettings: (tab?: SettingsTabId) => void;
    clearSettingsFocusTab: () => void;
    closeSettings: () => void;
    loadSettings: () => Promise<void>;
    fetchSystemInfo: () => Promise<void>;
}

export const createSettingsSlice: StateCreator<AppStore, [], [], SettingsSlice> = (set, get) => ({
    settings: defaultSettings,
    isSettingsOpen: false,
    settingsFocusTab: null,
    isLoadingSettings: true,
    appRoot: null,

    loadSettings: async () => {
        try {
            const loaded = await invoke<AppSettings>('settings_get');
            const merged = {
                ...defaultSettings,
                ...loaded,
                editor: { ...defaultSettings.editor, ...(loaded?.editor || {}) },
                terminal: {
                    ...defaultSettings.terminal,
                    ...(loaded?.terminal || {}),
                    fontFamily: normalizeTerminalFontFamily(loaded?.terminal?.fontFamily) ?? defaultSettings.terminal.fontFamily,
                    fontSize: normalizeTerminalFontSize(loaded?.terminal?.fontSize) ?? defaultSettings.terminal.fontSize,
                    fontWeight: (() => {
                        const resolved = normalizeTerminalFontWeight(loaded?.terminal?.fontWeight)
                            ?? defaultSettings.terminal.fontWeight;
                        return resolved;
                    })(),
                    fontWeightBold: (() => {
                        const resolvedFontWeight = normalizeTerminalFontWeight(loaded?.terminal?.fontWeight)
                            ?? defaultSettings.terminal.fontWeight;
                        return normalizeTerminalFontWeightBold(loaded?.terminal?.fontWeightBold)
                            ?? resolveTerminalFontWeightBold(resolvedFontWeight);
                    })(),
                    idleHostPtySuspendMinutes: normalizeIdleHostPtySuspendMinutes(
                        loaded?.terminal?.idleHostPtySuspendMinutes ?? defaultSettings.terminal.idleHostPtySuspendMinutes,
                    ),
                },
                fileManager: { ...defaultSettings.fileManager, ...(loaded?.fileManager || {}) },
                sidebarSections: {
                    ...defaultSettings.sidebarSections,
                    ...(loaded?.sidebarSections || {}),
                },
                localTerm: { ...defaultSettings.localTerm, ...(loaded?.localTerm || {}) },
                ghostSuggestions: {
                    ...defaultSettings.ghostSuggestions,
                    ...(loaded?.ghostSuggestions || {}),
                    providers: {
                        ...defaultSettings.ghostSuggestions.providers,
                        ...(loaded?.ghostSuggestions?.providers || {}),
                    },
                },
                keybindings: { ...defaultSettings.keybindings, ...(loaded?.keybindings || {}) },
                ai: { ...defaultSettings.ai, ...(loaded?.ai || {}) },
                privacy: { ...defaultSettings.privacy, ...(loaded?.privacy || {}) },
                notifications: normalizeNotificationSettings(loaded?.notifications),
                statusBar: normalizeStatusBarSettings(loaded?.statusBar),
                survey: normalizeSurveySettings(loaded?.survey),
                expandedFolders: loaded?.expandedFolders || []
            };
            set({ settings: merged, isLoadingSettings: false });
        } catch (error) {
            console.error('Failed to load settings:', error);
            set({ isLoadingSettings: false });
        }
    },

    updateSettings: async (newSettings) => {
        let actualSettings = { ...newSettings };

        // Theme changes always revert to the active theme's default accent.
        if ('theme' in newSettings) {
            actualSettings.accentColor = null;
        }

        const previous = get().settings;
        const previousTabs = get().tabs;
        const updated = { ...previous, ...actualSettings };
        const privacyPatch = actualSettings.privacy;
        const privacyTitlesTouched = Boolean(
            privacyPatch && 'showHostAddressesInLists' in privacyPatch,
        );
        const nextState: Partial<AppStore> = { settings: updated };
        if (privacyTitlesTouched) {
            nextState.tabs = refreshConnectionTabTitles(
                previousTabs,
                get().connections,
                updated.privacy.showHostAddressesInLists,
            );
        }
        set(nextState);
        const changedKeys = Object.keys(actualSettings) as Array<keyof AppSettings>;
        try {
            await persistSettings(actualSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            const current = get().settings;
            const rollbackPatch = Object.fromEntries(
                changedKeys.map((key) => [key, previous[key]])
            ) as Partial<AppSettings>;
            const rollbackState: Partial<AppStore> = {
                settings: { ...current, ...rollbackPatch },
            };
            if (privacyTitlesTouched) {
                rollbackState.tabs = previousTabs;
            }
            set(rollbackState);
            throw error;
        }
    },

    updateAiSettings: async (updates) => {
        const previous = get().settings;
        // Always persist the full ai object so required fields (enabled, ollamaUrl)
        // are not dropped when the picker only patches provider/model.
        const nextAi = { ...previous.ai, ...updates };
        const updated = {
            ...previous,
            ai: nextAi,
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['ai']>;
        const optimisticAi = nextAi;
        try {
            await persistSettings({ ai: nextAi });
        } catch (error) {
            console.error('Failed to save AI settings:', error);
            const current = get().settings;
            // Revert only keys this call still owns (value unchanged since optimistic set).
            const rollbackPatch = Object.fromEntries(
                changedKeys
                    .filter((key) => current.ai[key] === optimisticAi[key])
                    .map((key) => [key, previous.ai[key]]),
            ) as Partial<AppSettings['ai']>;
            if (Object.keys(rollbackPatch).length === 0) {
                throw error;
            }
            set({ settings: { ...current, ai: { ...current.ai, ...rollbackPatch } } });
            throw error;
        }
    },

    updateEditorSettings: async (updates) => {
        const previous = get().settings;
        const updated = {
            ...previous,
            editor: { ...previous.editor, ...updates }
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['editor']>;
        try {
            await persistSettings({ editor: updates });
        } catch (error) {
            console.error('Failed to save editor settings:', error);
            const current = get().settings;
            const rollbackPatch = Object.fromEntries(
                changedKeys.map((key) => [key, previous.editor[key]])
            ) as Partial<AppSettings['editor']>;
            set({ settings: { ...current, editor: { ...current.editor, ...rollbackPatch } } });
            throw error;
        }
    },

    updateSidebarSectionsSettings: async (updates) => {
        const previous = get().settings;
        const updated = {
            ...previous,
            sidebarSections: { ...previous.sidebarSections, ...updates }
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['sidebarSections']>;
        const optimisticSidebarSections = updated.sidebarSections;
        try {
            await persistSettings({ sidebarSections: updates });
        } catch (error) {
            console.error('Failed to save sidebar section settings:', error);
            const current = get().settings;
            const rollbackPatch = Object.fromEntries(
                changedKeys
                    .filter((key) => current.sidebarSections[key] === optimisticSidebarSections[key])
                    .map((key) => [key, previous.sidebarSections[key]])
            ) as Partial<AppSettings['sidebarSections']>;
            if (Object.keys(rollbackPatch).length === 0) {
                throw error;
            }
            set({
                settings: {
                    ...current,
                    sidebarSections: { ...current.sidebarSections, ...rollbackPatch }
                }
            });
            throw error;
        }
    },

    setSidebarCollapsedLocal: (collapsed) => {
        const previous = get().settings;
        if (previous.sidebarCollapsed === collapsed) return;
        set({ settings: { ...previous, sidebarCollapsed: collapsed } });
    },

    updateTerminalSettings: async (updates) => {
        const previous = get().settings;
        const normalizedUpdates = { ...updates };
        if ('idleHostPtySuspendMinutes' in normalizedUpdates) {
            normalizedUpdates.idleHostPtySuspendMinutes = normalizeIdleHostPtySuspendMinutes(
                normalizedUpdates.idleHostPtySuspendMinutes,
            );
        }
        if ('fontSize' in normalizedUpdates) {
            normalizedUpdates.fontSize = normalizeTerminalFontSize(normalizedUpdates.fontSize)
                ?? previous.terminal.fontSize;
        }
        if ('fontWeight' in normalizedUpdates) {
            const nextWeight = normalizeTerminalFontWeight(normalizedUpdates.fontWeight)
                ?? previous.terminal.fontWeight;
            normalizedUpdates.fontWeight = nextWeight;
            normalizedUpdates.fontWeightBold = resolveTerminalFontWeightBold(nextWeight);
        }
        const updated = {
            ...previous,
            terminal: { ...previous.terminal, ...normalizedUpdates }
        };
        set({ settings: updated });
        const changedKeys = Object.keys(normalizedUpdates) as Array<keyof AppSettings['terminal']>;
        try {
            await persistSettings({ terminal: normalizedUpdates });
        } catch (error) {
            console.error('Failed to save terminal settings:', error);
            const current = get().settings;
            const rollbackPatch = Object.fromEntries(
                changedKeys.map((key) => [key, previous.terminal[key]])
            ) as Partial<AppSettings['terminal']>;
            set({ settings: { ...current, terminal: { ...current.terminal, ...rollbackPatch } } });
            throw error;
        }
    },

    updateLocalTermSettings: async (updates) => {
        const previous = get().settings;
        const updated = {
            ...previous,
            localTerm: { ...previous.localTerm, ...updates }
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['localTerm']>;
        try {
            await persistSettings({ localTerm: updates });
        } catch (error) {
            console.error('Failed to save local terminal settings:', error);
            const current = get().settings;
            const rollbackPatch = Object.fromEntries(
                changedKeys.map((key) => [key, previous.localTerm[key]])
            ) as Partial<AppSettings['localTerm']>;
            set({ settings: { ...current, localTerm: { ...current.localTerm, ...rollbackPatch } } });
            throw error;
        }
    },

    updateStatusBarSettings: async (updates) => {
        const previous = get().settings;
        const previousBar = normalizeStatusBarSettings(previous.statusBar);
        const updatedBar = { ...previousBar, ...updates };
        const updated = {
            ...previous,
            statusBar: updatedBar,
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['statusBar']>;
        try {
            await persistSettings({ statusBar: updates });
        } catch (error) {
            console.error('Failed to save status bar settings:', error);
            const current = get().settings;
            if (current.statusBar !== updatedBar) {
                throw error;
            }
            const rollbackPatch = Object.fromEntries(
                changedKeys.map((key) => [key, previousBar[key]]),
            ) as Partial<AppSettings['statusBar']>;
            set({
                settings: {
                    ...current,
                    statusBar: {
                        ...normalizeStatusBarSettings(current.statusBar),
                        ...rollbackPatch,
                    },
                },
            });
            throw error;
        }
    },

    updateSurveySettings: async (updates) => {
        const previous = get().settings;
        const previousSurvey = normalizeSurveySettings(previous.survey);
        const updatedSurvey = { ...previousSurvey, ...updates };
        const updated = {
            ...previous,
            survey: updatedSurvey,
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['survey']>;
        try {
            await persistSettings({ survey: updates });
        } catch (error) {
            console.error('Failed to save survey settings:', error);
            const current = get().settings;
            const currentSurvey = normalizeSurveySettings(current.survey);
            const rollbackPatch = Object.fromEntries(
                changedKeys
                    .filter((key) => currentSurvey[key] === updatedSurvey[key])
                    .map((key) => [key, previousSurvey[key]]),
            ) as Partial<AppSettings['survey']>;
            if (Object.keys(rollbackPatch).length === 0) {
                throw error;
            }
            set({
                settings: {
                    ...current,
                    survey: {
                        ...currentSurvey,
                        ...rollbackPatch,
                    },
                },
            });
            throw error;
        }
    },

    updateFileManagerSettings: async (updates) => {
        const previous = get().settings;
        const updated = {
            ...previous,
            fileManager: { ...previous.fileManager, ...updates }
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['fileManager']>;
        try {
            await persistSettings({ fileManager: updates });
        } catch (error) {
            console.error('Failed to save file manager settings:', error);
            const current = get().settings;
            const rollbackPatch = Object.fromEntries(
                changedKeys.map((key) => [key, previous.fileManager[key]])
            ) as Partial<AppSettings['fileManager']>;
            set({ settings: { ...current, fileManager: { ...current.fileManager, ...rollbackPatch } } });
            throw error;
        }
    },

    updateGhostSuggestionsSettings: async (updates) => {
        const prevSettings = get().settings;
        const currentGhost = prevSettings.ghostSuggestions;
        const updated = {
            ...prevSettings,
            ghostSuggestions: {
                ...currentGhost,
                ...updates,
                providers: {
                    ...currentGhost.providers,
                    ...(updates.providers || {}),
                },
            },
        };
        set({ settings: updated });
        const changedGhostKeys = Object.keys(updates).filter((key) => key !== 'providers') as Array<Exclude<keyof AppSettings['ghostSuggestions'], 'providers'>>;
        const changedProviderKeys = Object.keys(updates.providers || {}) as Array<keyof AppSettings['ghostSuggestions']['providers']>;
        try {
            await persistSettings({ ghostSuggestions: updates });
        } catch (error) {
            console.error('Failed to save ghost suggestion settings:', error);
            const latestSettings = get().settings;
            const rollbackGhostPatch = Object.fromEntries(
                changedGhostKeys.map((key) => [key, currentGhost[key]])
            ) as Partial<Omit<AppSettings['ghostSuggestions'], 'providers'>>;
            const rollbackProviderPatch = Object.fromEntries(
                changedProviderKeys.map((key) => [key, currentGhost.providers[key]])
            ) as Partial<AppSettings['ghostSuggestions']['providers']>;
            set({
                settings: {
                    ...latestSettings,
                    ghostSuggestions: {
                        ...latestSettings.ghostSuggestions,
                        ...rollbackGhostPatch,
                        providers: {
                            ...latestSettings.ghostSuggestions.providers,
                            ...rollbackProviderPatch,
                        },
                    },
                },
            });
            throw error;
        }
    },

    updateKeybindings: async (updates) => {
        const previous = get().settings;
        const updated = {
            ...previous,
            keybindings: { ...previous.keybindings, ...updates }
        };
        set({ settings: updated });
        const changedKeys = Object.keys(updates) as Array<keyof AppSettings['keybindings']>;
        try {
            await persistSettings({ keybindings: updates });
        } catch (error) {
            console.error('Failed to save keybindings:', error);
            const current = get().settings;
            const rollbackPatch = Object.fromEntries(
                changedKeys.map((key) => [key, previous.keybindings[key]])
            ) as Partial<AppSettings['keybindings']>;
            set({ settings: { ...current, keybindings: { ...current.keybindings, ...rollbackPatch } } });
            throw error;
        }
    },

    toggleExpandedFolder: async (folderPath) => {
        const current = get().settings.expandedFolders || [];
        const newFolders = current.includes(folderPath)
            ? current.filter(f => f !== folderPath)
            : [...current, folderPath];

        const previous = get().settings;
        const updated = { ...previous, expandedFolders: newFolders };
        set({ settings: updated });
        try {
            await persistSettings({ expandedFolders: newFolders });
        } catch (error) {
            console.error('Failed to save expanded folders:', error);
            const current = get().settings;
            set({ settings: { ...current, expandedFolders: previous.expandedFolders } });
            throw error;
        }
    },

    openSettings: (tab) => set({
        isSettingsOpen: true,
        settingsFocusTab: tab ?? null,
    }),
    clearSettingsFocusTab: () => set({ settingsFocusTab: null }),
    closeSettings: () => set({ isSettingsOpen: false, settingsFocusTab: null }),
    fetchSystemInfo: async () => {
        try {
            const info = await invoke<{ app_root: string }>('get_system_info');
            set({ appRoot: info.app_root });
        } catch (e) {
            console.error('Failed to fetch system info:', e);
        }
    }
});
