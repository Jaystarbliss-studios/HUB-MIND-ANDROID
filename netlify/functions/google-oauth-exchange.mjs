import { callbackUri, encryptSecret, getBearer, googleConfig, json, verifyFirebaseUser, verifyOAuthState } from './lib/googleOAuth.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const idToken = getBearer(req);
    const user = await verifyFirebaseUser(idToken);
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '');
    const state = String(body.state || '');
    if (!code || !state) return json({ error: 'OAuth code and state are required.' }, 400);

    const stateData = await verifyOAuthState(state);
    if (stateData.uid !== user.localId || stateData.redirectUri !== callbackUri(req)) {
      return json({ error: 'Google OAuth state does not belong to this Hub-Mind user.' }, 403);
    }

    const { clientId, clientSecret } = googleConfig();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: stateData.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokens.access_token) {
      return json({ error: tokens?.error_description || tokens?.error || 'Google authorization exchange failed.' }, 502);
    }
    if (!tokens.refresh_token) {
      return json({ error: 'Google did not return a refresh token. Please reconnect and approve offline access.' }, 409);
    }

    const encryptedRefreshToken = await encryptSecret(tokens.refresh_token);
    const profileResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json().catch(() => ({}));
    return json({
      success: true,
      accessToken: tokens.access_token,
      expiresIn: Number(tokens.expires_in || 3600),
      encryptedRefreshToken,
      email: profile?.id || user.email || '',
      scopes: tokens.scope || '',
    });
  } catch (error) {
    console.error('Google OAuth exchange error:', error);
    return json({ error: error?.message || 'Could not complete Google authorization.' }, 500);
  }
}
export const config = { path: '/api/google-oauth-exchange' };
