import { firebaseAdminRequest, firestoreDocumentUrl, firebaseAuthAdminUrl, decodeFirestoreFields, encodeFirestoreFields } from '../../src/server/firebaseAdminRest.ts';

const BOOTSTRAP_ADMINS = new Set(['johnrufai242@gmail.com', 'rufaijohnny@gmail.com']);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate' },
});

async function verifyAdmin(request: Request) {
  const header = request.headers.get('authorization') || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken || idToken.length > 10000) throw Object.assign(new Error('Sign in again to manage users.'), { status: 401 });
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Firebase token verification is not configured on this server.'), { status: 503 });
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(10000),
  });
  const data: any = await response.json().catch(() => ({}));
  const identity = data?.users?.[0];
  if (!response.ok || !identity?.localId || identity.disabled) throw Object.assign(new Error('Your sign-in session is invalid or expired.'), { status: 401 });
  const email = String(identity.email || '').trim().toLowerCase();
  let profile: any = null;
  try {
    const doc: any = await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(identity.localId)));
    profile = decodeFirestoreFields(doc?.fields || {});
  } catch (error: any) { if (error?.status !== 404) throw error; }
  if (!((profile?.role === 'admin' && profile?.status === 'active') || BOOTSTRAP_ADMINS.has(email))) {
    throw Object.assign(new Error('Administrator permission is required for this action.'), { status: 403 });
  }
  return { uid: identity.localId, email };
}

async function listUsers() {
  const data: any = await firebaseAdminRequest(firestoreDocumentUrl('users?pageSize=1000'));
  return (data?.documents || []).map((entry: any) => ({ id: String(entry.name || '').split('/').pop() || '', ...decodeFirestoreFields(entry.fields || {}) }));
}

async function audit(actorId: string, action: string, targetId: string, details: string) {
  try {
    await firebaseAdminRequest(firestoreDocumentUrl('activityLogs'), { method: 'POST', body: JSON.stringify({ fields: encodeFirestoreFields({
      userId: actorId, actorId, action, entityType: 'user', entityId: targetId, details, createdAt: new Date().toISOString(),
    }) }) });
  } catch (error: any) { console.warn('[AdminUsers] Audit log write failed:', error?.message || error); }
}

export default async function handler(request: Request) {
  if (!['PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  try {
    const actor = await verifyAdmin(request);
    const uid = new URL(request.url).searchParams.get('uid') || '';
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid)) return json({ error: 'Invalid user ID.' }, 400);

    if (request.method === 'PATCH') {
      const body: any = await request.json().catch(() => ({}));
      const patch: Record<string, any> = {};
      if (body.role !== undefined) {
        if (!['admin', 'staff'].includes(body.role)) return json({ error: 'Role must be admin or staff.' }, 400);
        patch.role = body.role;
      }
      if (body.status !== undefined) {
        if (!['active', 'suspended', 'inactive'].includes(body.status)) return json({ error: 'Status must be active, suspended, or inactive.' }, 400);
        patch.status = body.status;
      }
      if (!Object.keys(patch).length) return json({ error: 'Provide a role or status to update.' }, 400);
      if (uid === actor.uid && (patch.role && patch.role !== 'admin' || patch.status && patch.status !== 'active')) return json({ error: 'You cannot remove your own administrator access.' }, 400);
      const targetResponse: any = await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)));
      const target = decodeFirestoreFields(targetResponse?.fields || {});
      if (BOOTSTRAP_ADMINS.has(String(target.email || '').toLowerCase())) return json({ error: 'The bootstrap administrator account is protected from role changes.' }, 403);
      if ((patch.role && patch.role !== 'admin' || patch.status && patch.status !== 'active') && target.role === 'admin' && target.status === 'active') {
        const admins = (await listUsers()).filter((item: any) => item.role === 'admin' && item.status === 'active');
        if (admins.length <= 1) return json({ error: 'Keep at least one active administrator in Hub-Mind.' }, 409);
      }
      const params = new URLSearchParams();
      Object.keys(patch).forEach(key => params.append('updateMask.fieldPaths', key));
      await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)) + '?' + params.toString(), { method: 'PATCH', body: JSON.stringify({ fields: encodeFirestoreFields(patch) }) });
      await audit(actor.uid, 'updated access for', uid, JSON.stringify(patch));
      return json({ success: true, uid, ...patch });
    }

    if (uid === actor.uid) return json({ error: 'You cannot delete your own signed-in administrator account.' }, 400);
    const targetResponse: any = await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)));
    const target = decodeFirestoreFields(targetResponse?.fields || {});
    if (BOOTSTRAP_ADMINS.has(String(target.email || '').toLowerCase())) return json({ error: 'The bootstrap administrator account is protected from deletion.' }, 403);
    if (target.role === 'admin' && target.status === 'active') {
      const admins = (await listUsers()).filter((item: any) => item.role === 'admin' && item.status === 'active');
      if (admins.length <= 1) return json({ error: 'You cannot delete the last active administrator.' }, 409);
    }
    await firebaseAdminRequest(firebaseAuthAdminUrl('update'), { method: 'POST', body: JSON.stringify({ localId: uid, disableUser: true }) });
    await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)), { method: 'DELETE' });
    await firebaseAdminRequest(firebaseAuthAdminUrl('delete'), { method: 'POST', body: JSON.stringify({ localId: uid }) });
    await audit(actor.uid, 'deleted account for', uid, 'Firebase Authentication account and users profile deleted; authored workspace records retained.');
    return json({ success: true, uid, message: 'Sign-in account and user profile deleted. Existing workspace records were retained.' });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[AdminUsers] Account management failed:', error?.message || error);
    return json({ error: status === 500 ? 'Could not complete account management. Confirm FIREBASE_SERVICE_ACCOUNT_JSON is configured and inspect function logs. A deletion failure may leave the account disabled.' : (error?.message || 'Account management failed.') }, status);
  }
}
