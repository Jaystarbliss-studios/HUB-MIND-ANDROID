import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export type JessSessionOwner = { sessionId: string; client: string; status: 'active'; leaseUntil: number };
const LEASE_MS = 22_000;

export function createJessSessionId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `jess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sessionRef(userId: string) {
  return doc(db, 'users', userId, 'private', 'jessActiveSession');
}

export async function claimJessSession(userId: string, sessionId: string, client: string): Promise<{ claimed: boolean; owner?: JessSessionOwner }> {
  const ref = sessionRef(userId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const current = snap.exists() ? snap.data() as Partial<JessSessionOwner> : null;
    if (current?.sessionId && current.sessionId !== sessionId && Number(current.leaseUntil || 0) > now) {
      return { claimed: false, owner: current as JessSessionOwner };
    }
    const owner: JessSessionOwner = { sessionId, client, status: 'active', leaseUntil: now + LEASE_MS };
    tx.set(ref, { ...owner, updatedAt: serverTimestamp() });
    return { claimed: true, owner };
  });
}

export async function renewJessSession(userId: string, sessionId: string, client: string): Promise<boolean> {
  const ref = sessionRef(userId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().sessionId !== sessionId) return false;
    tx.set(ref, { sessionId, client, status: 'active', leaseUntil: Date.now() + LEASE_MS, updatedAt: serverTimestamp() });
    return true;
  });
}

export async function releaseJessSession(userId: string, sessionId: string): Promise<void> {
  const ref = sessionRef(userId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data().sessionId === sessionId) tx.delete(ref);
  });
}

export function watchJessSession(userId: string, onOwner: (owner: JessSessionOwner | null) => void) {
  return onSnapshot(sessionRef(userId), snap => {
    if (!snap.exists()) { onOwner(null); return; }
    const data = snap.data() as Partial<JessSessionOwner>;
    if (!data.sessionId || Number(data.leaseUntil || 0) <= Date.now()) { onOwner(null); return; }
    onOwner(data as JessSessionOwner);
  }, error => console.warn('[Jess] Cross-client session sync unavailable:', error));
}

export const JESS_SESSION_LEASE_MS = LEASE_MS;
