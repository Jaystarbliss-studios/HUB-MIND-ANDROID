import { decryptSecret, getBearer, json, readPrivateConnection, refreshGoogleAccessToken, verifyFirebaseUser } from './lib/googleOAuth.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const idToken = getBearer(req);
    const user = await verifyFirebaseUser(idToken);
    const connection = await readPrivateConnection(user.localId, idToken);
    if (!connection?.encryptedRefreshToken) return json({ connected: false, error: 'Google account is not connected for this Hub-Mind user.' }, 404);

    const refreshToken = await decryptSecret(connection.encryptedRefreshToken);
    const tokens = await refreshGoogleAccessToken(refreshToken);
    return json({
      connected: true,
      accessToken: tokens.access_token,
      expiresIn: Number(tokens.expires_in || 3600),
      email: connection.email || user.email || '',
      scope: tokens.scope || connection.scopes || '',
    });
  } catch (error) {
    console.error('Google token refresh error:', error);
    const status = error?.code === 'invalid_grant' ? 401 : 500;
    return json({ connected: false, error: error?.message || 'Could not refresh Google access.' }, status);
  }
}
export const config = { path: '/api/google-token' };
