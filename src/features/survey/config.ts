/** Dev default points at local `zync-survey`. Override with VITE_SURVEY_API_URL for prod. */
export function getSurveyApiBaseUrl(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SURVEY_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:8090';
}
