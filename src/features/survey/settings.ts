import type { SurveySettings } from './types.js';

export const DEFAULT_SURVEY_SETTINGS: SurveySettings = {
  installCompleted: false,
  releaseSeenVersion: '',
  lastRole: '',
  lastWorkContext: '',
  lastDiscoverySource: '',
};

export function normalizeSurveySettings(
  raw?: Partial<SurveySettings> | null,
): SurveySettings {
  return {
    installCompleted: raw?.installCompleted === true,
    releaseSeenVersion:
      typeof raw?.releaseSeenVersion === 'string' ? raw.releaseSeenVersion.trim() : '',
    lastRole: typeof raw?.lastRole === 'string' ? raw.lastRole.trim() : '',
    lastWorkContext: typeof raw?.lastWorkContext === 'string' ? raw.lastWorkContext.trim() : '',
    lastDiscoverySource:
      typeof raw?.lastDiscoverySource === 'string' ? raw.lastDiscoverySource.trim() : '',
  };
}
