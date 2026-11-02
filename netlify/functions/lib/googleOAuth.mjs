const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_WEB_API_KEY || '';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID || '(default)';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_OAUTH_SECRET = process.env.GOOGLE_OAUTH_SECRET || '';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
];

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function getBearer(req) {
  const value = req.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export async function verifyFirebaseUser(idToken) {
  if (!idToken || !FIREBASE_WEB_API_KEY || !FIREBASE_PROJECT_ID) {
    throw Object.assign(new Error('Hub-Mind authentication is not configured.'), { status: 503 });
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const data = await response.json().catch(() => ({}));
  const user = data?.users?.[0];
  if (!response.ok || !user || user.disabled || !user.localId) {
    throw Object.assign(new Error('Your Hub-Mind sign-in session is invalid or expired.'), { status: 401 });
  }

  // A valid Firebase identity alone is not enough: every server-side assistant
  // and Google integration requires an active Hub-Mind workspace profile.
  const profileUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/users/${encodeURIComponent(user.localId)}`;
  const profileResponse = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!profileResponse.ok) {
    throw Object.assign(new Error('Your Hub-Mind account is not active or its workspace profile could not be verified.'), { status: 403 });
  }
  const profileDocument = await profileResponse.json().catch(() => ({}));
  const fields = profileDocument?.fields || {};
  if (fields.status?.stringValue !== 'active') {
    throw Object.assign(new Error('Your Hub-Mind account is not active.'), { status: 403 });
  }

  return { ...user, hubMindRole: fields.role?.stringValue || 'staff' };
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function fromBase64url(value) {
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(value).length + 3) % 4), 'base64');
}

async function hmac(value) {
  if (!GOOGLE_OAUTH_SECRET) throw new Error('GOOGLE_OAUTH_SECRET is not configured.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(GOOGLE_OAUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function createOAuthState(userId, redirectUri) {
  const payload = base64url(Buffer.from(JSON.stringify({
    uid: userId,
    redirectUri,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: base64url(crypto.getRandomValues(new Uint8Array(16))),
  })));
  return payload + '.' + base64url(await hmac(payload));
}

export async function verifyOAuthState(state) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw new Error('Invalid Google OAuth state.');
  const expected = await hmac(payload);
  const received = fromBase64url(signature);
  let equal = received.length === expected.length;
  for (let i = 0; equal && i < expected.length; i++) equal = expected[i] === received[i];
  if (!equal) throw new Error('Google OAuth state validation failed.');
  const data = JSON.parse(fromBase64url(payload).toString('utf8'));
  if (!data?.uid || !data?.redirectUri || Number(data.exp) < Date.now()) throw new Error('Google OAuth state expired.');
  return data;
}

async function encryptionKey() {
  if (!GOOGLE_OAUTH_SECRET) throw new Error('GOOGLE_OAUTH_SECRET is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(GOOGLE_OAUTH_SECRET));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value)));
  return `v1.${base64url(iv)}.${base64url(encrypted)}`;
}

export async function decryptSecret(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Stored Google credential format is invalid.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64url(parts[1]) },
    await encryptionKey(),
    fromBase64url(parts[2]),
  );
  return new TextDecoder().decode(plain);
}

export function googleConfig() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth server credentials are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Netlify.');
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET };
}

export function callbackUri(req) {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI || '';
  if (configured) return configured;
  const appUrl = process.env.APP_URL || new URL(req.url).origin;
  return new URL('/api/google-oauth-callback', appUrl).toString();
}

export async function readPrivateConnection(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/users/${encodeURIComponent(uid)}/private/googleConnection`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!response.ok) return null;
  const data = await response.json();
  const fields = data?.fields || {};
  return {
    encryptedRefreshToken: fields.encryptedRefreshToken?.stringValue || '',
    email: fields.email?.stringValue || '',
    scopes: fields.scopes?.stringValue || '',
  };
}

export async function writePrivateConnection(uid, idToken, connection) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/users/${encodeURIComponent(uid)}/private/googleConnection`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        encryptedRefreshToken: { stringValue: connection.encryptedRefreshToken },
        email: { stringValue: connection.email || '' },
        scopes: { stringValue: connection.scopes || GOOGLE_SCOPES.join(' ') },
        connectedAt: { timestampValue: new Date().toISOString() },
        provider: { stringValue: 'google' },
      },
    }),
  });
  if (!response.ok) throw new Error((await response.text()) || 'Could not save Google connection.');
}

export async function refreshGoogleAccessToken(refreshToken) {
  const { clientId, clientSecret } = googleConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = data?.error_description || data?.error || 'Google access token refresh failed.';
    const e = new Error(error);
    e.code = data?.error || 'google_refresh_failed';
    throw e;
  }
  return data;
}

export { FIREBASE_PROJECT_ID };
