/**
 * Runtime API base for the Hub-Mind backend.
 *
 * Hub-Mind is deployed with its API functions on the same origin, so the
 * browser must not consume Vite environment variables here. Keeping this
 * module environment-free prevents Netlify build-time configuration values
 * from ever entering the client bundle.
 */
export const API_BASE_URL = '';

/** Jess Live uses the same-origin HTTP token endpoint in production. */
export const JESS_LIVE_WS_URL = '';
export const LIVE_WS_URL = '';

export const apiUrl = (path: string) => {
  if (!API_BASE_URL) return path;
  return API_BASE_URL + (path.startsWith('/') ? path : '/' + path);
};
