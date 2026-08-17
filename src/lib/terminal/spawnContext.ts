export interface TerminalSpawnTabState {
  id: string;
  lastKnownCwd?: string;
  initialPath?: string;
  shellOverride?: string;
}

export function isWin32Platform(): boolean {
  if (typeof window !== 'undefined' && window.electronUtils?.platform === 'win32') {
    return true;
  }
  return typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
}

/**
 * Expand Settings "default" / empty local Windows shell to a concrete shell id.
 * Windows only — do not apply on macOS/Linux local shells.
 */
export function resolveLocalWindowsShellId(windowsShell?: string | null): string {
  const trimmed = windowsShell?.trim();
  if (!trimmed || trimmed === 'default') {
    return 'powershell';
  }
  return trimmed;
}

/** Resolves CWD and shell for a PTY spawn from tab + settings state. */
export function resolveTerminalSpawnParams(
  terminalKey: string,
  termId: string,
  terminals: Record<string, TerminalSpawnTabState[] | undefined>,
  windowsShell?: string,
): { cwd?: string; shell?: string } {
  const terminalTab = terminals[terminalKey]?.find((t) => t.id === termId);
  const rawShell = terminalTab?.shellOverride
    ?? (terminalKey === 'local' ? windowsShell : undefined);

  let shell = rawShell;
  if (terminalKey === 'local') {
    if (isWin32Platform()) {
      // Empty / "default" → powershell only on Windows.
      shell = resolveLocalWindowsShellId(rawShell);
    } else {
      // Non-Windows: leave absent/default unset so the OS default shell is used.
      const trimmed = rawShell?.trim();
      shell = !trimmed || trimmed === 'default' ? undefined : trimmed;
    }
  }

  return {
    cwd: terminalTab?.lastKnownCwd ?? terminalTab?.initialPath,
    shell,
  };
}