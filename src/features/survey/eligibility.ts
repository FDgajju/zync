import type { SurveyPromptKind, SurveySettings } from './types.js';

export function resolveSurveyPromptKind(
  survey: SurveySettings,
  currentVersion: string,
  previousSeenVersion: string,
): SurveyPromptKind | null {
  if (!currentVersion) return null;

  if (!survey.installCompleted) {
    return 'install';
  }

  // Release check-in only when updating from a previously seen version.
  if (
    previousSeenVersion
    && previousSeenVersion !== currentVersion
    && survey.releaseSeenVersion !== currentVersion
  ) {
    return 'release';
  }

  return null;
}
