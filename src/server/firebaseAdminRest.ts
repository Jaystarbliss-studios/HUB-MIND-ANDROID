import { createSign } from 'node:crypto';

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function readServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Firebase administrative actions are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server.');
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
  if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) {
    throw new Error('Firebase service-account configuration is incomplete.');
  }
  return parsed as ServiceAccount;
}

export function firebaseAdminProjectId() {
  return process.env.FIREBASE_PROJECT_ID || readServiceAccount().project_id;
}

export async function getFirebaseAdminAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const account = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + '.' + claims;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + '.' + signer.sign(account.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(12_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('Could not obtain a Firebase administrative access token.');
  cachedToken = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

export async function firebaseAdminRequest(path: string, init: RequestInit = {}) {
  const token = await getFirebaseAdminAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) {
    const detail = typeof data === 'object' && data ? data.error?.message : '';
    const error: any = new Error(detail || 'Firebase administrative request failed (' + response.status + ').');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function firestoreDocumentUrl(path: string) {
  const projectId = firebaseAdminProjectId();
  return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents/' + path;
}

export function firebaseAuthAdminUrl(operation: 'update' | 'delete') {
  const projectId = firebaseAdminProjectId();
  return 'https://identitytoolkit.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/accounts:' + operation;
}

export function decodeFirestoreFields(fields: Record<string, any> = {}) {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if ('stringValue' in value) result[key] = value.stringValue;
    else if ('booleanValue' in value) result[key] = value.booleanValue;
    else if ('integerValue' in value) result[key] = Number(value.integerValue);
    else if ('doubleValue' in value) result[key] = Number(value.doubleValue);
    else if ('nullValue' in value) result[key] = null;
    else if ('mapValue' in value) result[key] = decodeFirestoreFields(value.mapValue.fields);
    else if ('arrayValue' in value) result[key] = (value.arrayValue.values || []).map((entry: any) => decodeFirestoreFields({ value: entry }).value);
  }
  return result;
}

export function encodeFirestoreFields(value: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') fields[key] = { stringValue: item };
    else if (typeof item === 'boolean') fields[key] = { booleanValue: item };
    else if (typeof item === 'number' && Number.isInteger(item)) fields[key] = { integerValue: String(item) };
    else if (typeof item === 'number') fields[key] = { doubleValue: item };
    else if (item === null) fields[key] = { nullValue: null };
  }
  return fields;
}
