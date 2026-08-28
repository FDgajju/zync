export function resolveSurveyPlatform(): string {
  const raw = window.electronUtils?.platform || 'linux';
  if (raw === 'darwin') return 'macos';
  if (raw === 'win32') return 'windows';
  return raw;
}

export function resolveSurveyArch(): string | undefined {
  const arch = (navigator as Navigator & { userAgentData?: { architecture?: string } }).userAgentData?.architecture;
  if (arch) return arch;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('arm') || ua.includes('aarch64')) return 'arm64';
  if (ua.includes('x64') || ua.includes('win64') || ua.includes('x86_64')) return 'x64';
  return undefined;
}

export async function resolveAppVersion(): Promise<string> {
  try {
    const version = await window.ipcRenderer.invoke('app:getVersion');
    return typeof version === 'string' ? version : '';
  } catch {
    return '';
  }
}
