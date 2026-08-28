import { getSurveyApiBaseUrl } from './config.js';
import type { FeedbackPayload, SurveyApiResult, SurveyPayload } from './types.js';

function friendlyApiError(status: number | null, serverMessage?: string): string {
  if (status === null) {
    return "Couldn't reach the server. Try again or Skip.";
  }
  if (status === 429) {
    return 'Too many requests. Please try again later.';
  }
  if (status >= 500) {
    return "Something went wrong on our side. Try again or Skip.";
  }
  if (serverMessage && serverMessage.trim()) {
    return serverMessage.trim();
  }
  return `Request failed (${status}). Try again or Skip.`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getSurveyApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(friendlyApiError(null));
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const serverMessage =
      payload
      && typeof payload === 'object'
      && 'error' in payload
      && payload.error
      && typeof payload.error === 'object'
      && 'message' in payload.error
      && typeof (payload.error as { message?: unknown }).message === 'string'
        ? (payload.error as { message: string }).message
        : undefined;
    throw new Error(friendlyApiError(response.status, serverMessage));
  }

  return payload as T;
}

export function submitSurvey(payload: SurveyPayload): Promise<SurveyApiResult> {
  return postJson<SurveyApiResult>('/v1/survey', payload);
}

export function submitFeedback(payload: FeedbackPayload): Promise<SurveyApiResult> {
  return postJson<SurveyApiResult>('/v1/feedback', payload);
}
