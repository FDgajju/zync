const REMEMBER_ON_DEVICE_PREF_KEY = 'zync:vault:rememberOnDevice';

export function readRememberOnDevicePreference(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(REMEMBER_ON_DEVICE_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function persistRememberOnDevicePreference(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REMEMBER_ON_DEVICE_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // Private mode / quota — remember-device is best-effort.
  }
}
