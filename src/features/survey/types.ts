export type SurveyId = 'install' | `release:${string}`;

export type SurveyPromptKind = 'install' | 'release';

export type FeedbackCategory = 'bug' | 'improvement' | 'feature' | 'praise' | 'other';

export interface SurveySettings {
  /** True after install survey is submitted or skipped. */
  installCompleted: boolean;
  /** App version for which the release check-in was submitted or skipped. */
  releaseSeenVersion: string;
  /** Last submitted answers for release prefill. */
  lastRole: string;
  lastWorkContext: string;
  lastDiscoverySource: string;
}

export interface SurveyPayload {
  schemaVersion: number;
  surveyId: SurveyId;
  appVersion: string;
  platform: string;
  arch?: string;
  role?: string;
  workContext?: string;
  discoverySource?: string;
  discoveryOther?: string;
  wouldRecommend?: 'yes' | 'somewhat' | 'no';
  locale?: string;
  email?: string;
  /** Opt-in for product updates; only meaningful with email. */
  wantUpdates?: boolean;
  submittedAt: string;
  submittedFrom: 'app';
}

export interface FeedbackPayload {
  schemaVersion: number;
  category: FeedbackCategory;
  message: string;
  appVersion: string;
  platform: string;
  arch?: string;
  role?: string;
  contactEmail?: string;
  allowContact?: boolean;
  submittedAt: string;
  submittedFrom: 'app';
  bugContext?: {
    reproSteps?: string;
    expected?: string;
    actual?: string;
  };
}

export interface SurveyApiResult {
  id: string;
  status: string;
}

export interface SurveyPrefill {
  lastRole?: string;
  lastWorkContext?: string;
  lastDiscoverySource?: string;
}
