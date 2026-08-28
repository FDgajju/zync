/** Dev default points at local `zync-survey`. Override with VITE_SURVEY_API_URL for prod. */
export function getSurveyApiBaseUrl(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SURVEY_API_URL;
  const raw =
    typeof fromEnv === 'string' && fromEnv.trim()
      ? fromEnv.trim().replace(/\/$/, '')
      : 'http://127.0.0.1:8090';

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid survey API URL');
  }

  const host = parsed.hostname.toLowerCase();
  // Allow any IPv4 loopback (127.0.0.0/8), localhost, and IPv6 loopback.
  const isLoopback =
    host === 'localhost'
    || host === '[::1]'
    || host === '::1'
    || /^127(?:\.(?:\d{1,3})){3}$/.test(host);

  if (parsed.protocol === 'http:') {
    if (!isLoopback) {
      throw new Error('Survey API URL must use HTTPS for non-local hosts');
    }
  } else if (parsed.protocol !== 'https:') {
    throw new Error('Survey API URL must be http(s)');
  }

  return raw;
}
