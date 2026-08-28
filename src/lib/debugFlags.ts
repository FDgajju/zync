/**
 * Debug flags for development + field diagnostics.
 *
 * These are intentionally "soft" toggles (localStorage) so we can ask users
 * to enable logging without shipping UI switches.
 */

function readLocalStorageFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Enable with:
 *   localStorage.setItem('zync.debug.themePayload', '1')
 * Disable with:
 *   localStorage.removeItem('zync.debug.themePayload')
 */
export function isDebugThemePayloadEnabled(): boolean {
  return readLocalStorageFlag('zync.debug.themePayload');
}

/**
 * Force the profile survey modal on boot (dev).
 *
 * Enable:
 *   localStorage.setItem('zync.debug.surveyPrompt', '1')
 * Optional kind:
 *   localStorage.setItem('zync.debug.surveyPromptKind', 'install') // or 'release'
 * Disable:
 *   localStorage.removeItem('zync.debug.surveyPrompt')
 */
export function isDebugSurveyPromptEnabled(): boolean {
  return readLocalStorageFlag('zync.debug.surveyPrompt');
}

export function getDebugSurveyPromptKind(): 'install' | 'release' | null {
  try {
    const kind = window.localStorage.getItem('zync.debug.surveyPromptKind');
    if (kind === 'install' || kind === 'release') return kind;
  } catch {
    // ignore
  }
  return null;
}

