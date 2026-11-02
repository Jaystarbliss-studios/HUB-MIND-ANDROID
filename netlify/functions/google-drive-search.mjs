import { decryptSecret, getBearer, json, readPrivateConnection, refreshGoogleAccessToken, verifyFirebaseUser } from './lib/googleOAuth.mjs';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

function escapeDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const idToken = getBearer(req);
    const user = await verifyFirebaseUser(idToken);
    const connection = await readPrivateConnection(user.localId, idToken);
    if (!connection?.encryptedRefreshToken) {
      return json({ connected: false, error: 'Connect your Google account in Hub-Mind first.' }, 404);
    }
    if (!(connection.scopes || '').includes('https://www.googleapis.com/auth/drive.readonly')) {
      return json({
        connected: false,
        reconnectRequired: true,
        error: 'Google Drive permission has not been granted yet. Disconnect/reconnect Google in Hub-Mind and approve read-only Drive access.',
      }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 180) : '';
    const pageSize = Math.min(20, Math.max(1, Number.parseInt(body.pageSize, 10) || 10));
    const tokens = await refreshGoogleAccessToken(await decryptSecret(connection.encryptedRefreshToken));
    const clauses = ["trashed = false"];
    if (query) {
      const escaped = escapeDriveQuery(query);
      clauses.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);
    }
    const params = new URLSearchParams({
      q: clauses.join(' and '),
      pageSize: String(pageSize),
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,description,size),nextPageToken',
      spaces: 'drive',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    const response = await fetch(`${DRIVE_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ connected: false, error: data?.error?.message || 'Google Drive search failed.' }, response.status === 401 ? 401 : 502);
    }
    return json({
      connected: true,
      email: connection.email || user.email || '',
      files: Array.isArray(data.files) ? data.files : [],
      nextPageToken: data.nextPageToken || null,
      readOnly: true,
    });
  } catch (error) {
    console.error('Google Drive search error:', error);
    return json({ error: error?.message || 'Could not search Google Drive.' }, 500);
  }
}

export const config = { path: '/api/google-drive-search' };
