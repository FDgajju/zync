import type { SurveyPromptKind, SurveySettings } from './types.js';

/**
 * One-shot profile survey:
 * - Existing user updating from a prior version → `release` ("Help Zync improve") once.
 * - Brand-new install → `install` ("Welcome to Zync") once.
 * - After skip/submit (`installCompleted`), never again — including later releases.
 */
export function resolveSurveyPromptKind(
  survey: SurveySettings,
  currentVersion: string,
  previousSeenVersion: string,
): SurveyPromptKind | null {
  if (!currentVersion) return null;
  if (survey.installCompleted) return null;

  // Had a prior app version on this machine → upgrade check-in.
  if (previousSeenVersion && previousSeenVersion !== currentVersion) {
    return 'release';
  }

  return 'install';
}
