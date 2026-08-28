export { submitFeedback, submitSurvey } from './client.js';
export { getSurveyApiBaseUrl } from './config.js';
export { buildGitHubFeedbackIssueUrl } from './githubIssue.js';
export { resolveSurveyPromptKind } from './eligibility.js';
export {
  DISCOVERY_OPTIONS,
  FEEDBACK_CATEGORY_OPTIONS,
  RECOMMEND_OPTIONS,
  ROLE_OPTIONS,
  WORK_CONTEXT_OPTIONS,
} from './options.js';
export {
  resolveAppVersion,
  resolveSurveyArch,
  resolveSurveyPlatform,
} from './platform.js';
export { splitPrefillValue } from './prefill.js';
export {
  DEFAULT_SURVEY_SETTINGS,
  normalizeSurveySettings,
} from './settings.js';
export type {
  FeedbackCategory,
  FeedbackPayload,
  SurveyApiResult,
  SurveyId,
  SurveyPayload,
  SurveyPrefill,
  SurveyPromptKind,
  SurveySettings,
} from './types.js';
