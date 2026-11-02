import { auth } from '../firebaseConfig';
import { db } from '../firebaseConfig';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { driveConfig, initDriveConfig } from '../driveConfig';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
];
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const STORAGE_CALENDAR_TOKEN = 'hubmind_gcal_token_v3';
const STORAGE_CALENDAR_EXP = 'hubmind_gcal_token_exp_v3';
const STORAGE_CONNECTED = 'hubmind_gcal_connected_v3';
const STORAGE_EMAIL = 'hubmind_gcal_email_v3';

function userStorageKey(base: string) {
  return `${base}_${auth.currentUser?.uid || 'anonymous'}`;
}

let cachedCalendarToken: string | null = null;
let calendarTokenExpiry = 0;

export function setCachedCalendarToken(token: string, expiresInSeconds = 3500) {
  cachedCalendarToken = token;
  calendarTokenExpiry = Date.now() + Math.max(60, expiresInSeconds) * 1000;
  try {
    localStorage.setItem(userStorageKey(STORAGE_CALENDAR_TOKEN), token);
    localStorage.setItem(userStorageKey(STORAGE_CALENDAR_EXP), String(calendarTokenExpiry));
  } catch {}
}

export function getCachedCalendarToken(): string | null {
  if (!auth.currentUser) return null;
  if (cachedCalendarToken && Date.now() < calendarTokenExpiry - 60000) return cachedCalendarToken;
  try {
    const token = localStorage.getItem(userStorageKey(STORAGE_CALENDAR_TOKEN));
    const exp = Number(localStorage.getItem(userStorageKey(STORAGE_CALENDAR_EXP))) || 0;
    if (token && Date.now() < exp - 60000) {
      cachedCalendarToken = token;
      calendarTokenExpiry = exp;
      return token;
    }
  } catch {}
  return null;
}

function markConnected(email?: string) {
  try {
    localStorage.setItem(userStorageKey(STORAGE_CONNECTED), 'true');
    if (email) localStorage.setItem(userStorageKey(STORAGE_EMAIL), email);
  } catch {}
}

function markDisconnected() {
  try {
    localStorage.removeItem(userStorageKey(STORAGE_CONNECTED));
    localStorage.removeItem(userStorageKey(STORAGE_EMAIL));
    localStorage.removeItem(userStorageKey(STORAGE_CALENDAR_TOKEN));
    localStorage.removeItem(userStorageKey(STORAGE_CALENDAR_EXP));
  } catch {}
  cachedCalendarToken = null;
  calendarTokenExpiry = 0;
}

export function clearGoogleTokens() {
  markDisconnected();
}

export async function disconnectPersistentGoogleConnection(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  markDisconnected();
  try {
    await deleteDoc(doc(db, 'users', uid, 'private', 'googleConnection'));
  } catch (error) {
    console.warn('[googleAuthToken] Could not remove persistent Google connection:', error);
  }
}

async function getFirebaseBearer(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to use Google services.');
  return user.getIdToken(true);
}

async function refreshPersistentGoogleToken(): Promise<string | null> {
  try {
    const idToken = await getFirebaseBearer();
    const response = await fetch('/api/google-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 404) {
        markDisconnected();
        return null;
      }
      return null;
    }
    const data = await response.json();
    if (!data?.accessToken) return null;
    setCachedCalendarToken(data.accessToken, Number(data.expiresIn || 3500));
    markConnected(data.email);
    return data.accessToken;
  } catch (error) {
    console.warn('[googleAuthToken] Persistent Google token refresh unavailable:', error);
    return null;
  }
}

function waitForGoogleOAuthPopup(popup: Window): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Google authorization timed out. Please try connecting again.'));
    }, 5 * 60 * 1000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      try { popup.close(); } catch {}
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'hubmind-google-oauth' || settled) return;
      settled = true;
      cleanup();
      if (data.error) reject(new Error(data.error));
      else if (data.code && data.state) resolve({ code: data.code, state: data.state });
      else reject(new Error('Google returned an incomplete authorization response.'));
    };

    window.addEventListener('message', onMessage);
  });
}

async function startPersistentGoogleAuthorization(): Promise<string> {
  const idToken = await getFirebaseBearer();
  const response = await fetch('/api/google-oauth-start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.authorizationUrl) {
    throw new Error(data?.error || 'Could not start Google authorization.');
  }

  const popup = window.open(
    data.authorizationUrl,
    'hubmind-google-authorization',
    'width=520,height=720,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes',
  );
  if (!popup) throw new Error('Google authorization was blocked. Allow popups for Hub-Mind and try again.');

  const { code, state } = await waitForGoogleOAuthPopup(popup);
  const exchange = await fetch('/api/google-oauth-exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ code, state }),
  });
  const data2 = await exchange.json().catch(() => ({}));
  if (!exchange.ok || !data2?.accessToken || !data2?.encryptedRefreshToken) {
    throw new Error(data2?.error || 'Google authorization could not be completed.');
  }

  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Hub-Mind user session ended during Google authorization.');

  // The refresh token is encrypted server-side before it reaches the browser.
  // It is persisted so a later session can request a fresh short-lived access token
  // without opening another Google popup.
  await setDoc(doc(db, 'users', uid, 'private', 'googleConnection'), {
    encryptedRefreshToken: data2.encryptedRefreshToken,
    email: data2.email || auth.currentUser?.email || '',
    scopes: data2.scopes || [...CALENDAR_SCOPES, ...GMAIL_SCOPES].join(' '),
    provider: 'google',
    connectedAt: new Date().toISOString(),
  }, { merge: true });

  setCachedCalendarToken(data2.accessToken, Number(data2.expiresIn || 3500));
  markConnected(data2.email || auth.currentUser?.email || undefined);
  return data2.accessToken;
}

/**
 * Returns a short-lived Google access token.
 * interactive=false never opens a popup: it uses the persistent server-side
 * refresh-token flow and is safe for background schedule reads.
 */
export async function requestGoogleAccessToken(
  scopes: string[] = CALENDAR_SCOPES,
  interactive = true,
): Promise<string> {
  const cached = getCachedCalendarToken();
  if (cached) return cached;

  const persistent = await refreshPersistentGoogleToken();
  if (persistent) return persistent;

  if (!interactive) {
    throw new Error('Google account is not connected. Connect Google Calendar once from Hub-Mind.');
  }

  // The persistent authorization endpoint owns the requested Google scopes.
  // We intentionally do not fall back to Firebase Auth/GSI here because those
  // flows only yield short-lived browser access tokens and caused repeated popups.
  return startPersistentGoogleAuthorization();
}

export async function getGoogleConnectionState(): Promise<{ connected: boolean; email: string | null }> {
  if (getCachedCalendarToken()) {
    return { connected: true, email: localStorage.getItem(userStorageKey(STORAGE_EMAIL)) || auth.currentUser?.email || null };
  }
  const token = await refreshPersistentGoogleToken();
  if (token) {
    return { connected: true, email: localStorage.getItem(userStorageKey(STORAGE_EMAIL)) || auth.currentUser?.email || null };
  }
  return { connected: false, email: null };
}

export async function getDriveClientId() {
  await initDriveConfig();
  return driveConfig.clientId;
}
