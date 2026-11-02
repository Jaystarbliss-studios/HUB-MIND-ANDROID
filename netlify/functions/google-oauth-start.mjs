import { callbackUri, createOAuthState, getBearer, googleConfig, json, verifyFirebaseUser, GOOGLE_SCOPES } from './lib/googleOAuth.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const idToken = getBearer(req);
    const user = await verifyFirebaseUser(idToken);
    const { clientId } = googleConfig();
    const redirectUri = callbackUri(req);
    const state = await createOAuthState(user.localId, redirectUri);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: GOOGLE_SCOPES.join(' '),
      state,
      login_hint: user.email || '',
    });
    return json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (error) {
    console.error('Google OAuth start error:', error);
    return json({ error: error?.message || 'Could not start Google authorization.' }, 500);
  }
}
export const config = { path: '/api/google-oauth-start' };
