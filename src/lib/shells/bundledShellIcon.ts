import type { ShellEntry, ShellIconData } from './types';

/** Bundled files under `public/shell-icons/` (same names as backend `bundled(...)`). */
export function bundledIconNameForShellId(shellId: string): string {
    const id = shellId.trim().toLowerCase();
    if (id === 'default' || id === 'powershell' || id === 'powershell.exe') {
        return 'powershell.svg';
    }
    if (id === 'pwsh' || id === 'pwsh.exe') {
        return 'pwsh.svg';
    }
    if (id === 'cmd' || id === 'cmd.exe') {
        return 'cmd.png';
    }
    if (id === 'gitbash' || id === 'git-bash' || id.includes('git-bash')) {
        return 'gitbash.svg';
    }
    if (id === 'wsl' || id.startsWith('wsl:')) {
        return 'wsl.png';
    }
    if (id.includes('bash')) {
        return 'bash.png';
    }
    if (id.includes('zsh')) {
        return 'zsh.svg';
    }
    if (id.includes('fish')) {
        return 'fish.png';
    }
    return 'terminal.png';
}

export function bundledShellIconData(shellId: string): ShellIconData {
    return { type: 'bundled', name: bundledIconNameForShellId(shellId) };
}

/** ShellEntry for Settings / Select icons — prefers live detection, else bundled asset. */
export function shellEntryForIcon(
    shellId: string,
    detected?: ReadonlyArray<ShellEntry>,
): ShellEntry {
    const fromDetect = detected?.find((entry) => entry.id === shellId);
    if (fromDetect?.icon) {
        return fromDetect;
    }
    return {
        id: shellId,
        label: shellId,
        icon: bundledShellIconData(shellId),
    };
}
