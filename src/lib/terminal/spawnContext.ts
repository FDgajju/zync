export interface TerminalSpawnTabState {
  id: string;
  lastKnownCwd?: string;
  initialPath?: string;
  shellOverride?: string;
}

/**
 * Expand Settings "default" / empty local Windows shell to a concrete shell id.
 * Icons and stamps must never track a live settings value named `default`.
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
  // Local: always normalize (empty / "default" / padding → concrete id).
  const shell = terminalKey === 'local'
    ? resolveLocalWindowsShellId(rawShell)
    : rawShell;
  return {
    cwd: terminalTab?.lastKnownCwd ?? terminalTab?.initialPath,
    shell,
  };
}