import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { UserConnection, User } from '../types';
import { getUserByUsername, getUserProfile, getAllUsers, extractHandleFromEmail } from './userService';

export async function sendConnectionRequest(
  currentUser: User, 
  targetUsernameOrId: string
): Promise<UserConnection> {
  const rawInput = (targetUsernameOrId || '').trim();
  if (!rawInput) {
    throw new Error('Please specify a username, email, or select a user to connect with.');
  }

  const cleanHandle = rawInput.replace(/^@+/, '');
  let targetUser: User | null = null;

  // 1. Try finding by normalized username
  try {
    targetUser = await getUserByUsername(cleanHandle);
  } catch {}

  // 2. If not found and looks like an email, search by email
  if (!targetUser && rawInput.includes('@')) {
    try {
      const qEmail = query(collection(db, 'users'), where('email', '==', rawInput.toLowerCase()));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        targetUser = { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() } as User;
      }
    } catch {}
  }

  // 3. If not found, try direct doc lookup by ID
  if (!targetUser) {
    try {
      targetUser = await getUserProfile(rawInput);
    } catch {}
  }

  // 4. Fallback search across directory (case-insensitive handle, email, or displayName)
  if (!targetUser) {
    try {
      const all = await getAllUsers();
      const match = all.find(u => 
        (u.username && u.username.toLowerCase() === cleanHandle.toLowerCase()) ||
        (u.email && u.email.toLowerCase() === rawInput.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase() === rawInput.toLowerCase()) ||
        (u.name && u.name.toLowerCase() === rawInput.toLowerCase())
      );
      if (match) targetUser = match;
    } catch {}
  }

  if (!targetUser) {
    throw new Error(`User "${rawInput}" was not found in the workspace directory. Please check the spelling or browse the directory.`);
  }

  if (targetUser.id === currentUser.id) {
    throw new Error('You cannot connect with yourself.');
  }

  // Check if a connection document already exists (direct doc lookup is fast and avoids index delays)
  const connIdOutgoing = `conn_${currentUser.id}_${targetUser.id}`;
  const connIdIncoming = `conn_${targetUser.id}_${currentUser.id}`;

  const [snapOut, snapIn] = await Promise.all([
    getDoc(doc(db, 'connections', connIdOutgoing)).catch(() => null),
    getDoc(doc(db, 'connections', connIdIncoming)).catch(() => null)
  ]);

  if (snapOut && snapOut.exists()) {
    const existing = snapOut.data() as UserConnection;
    if (existing.status === 'accepted') {
      throw new Error(`You are already connected with @${targetUser.username || targetUser.displayName || 'this user'}.`);
    }
    if (existing.status === 'pending') {
      throw new Error(`A pending connection request with @${targetUser.username || targetUser.displayName || 'this user'} has already been sent.`);
    }
  }

  if (snapIn && snapIn.exists()) {
    const existing = snapIn.data() as UserConnection;
    if (existing.status === 'accepted') {
      throw new Error(`You are already connected with @${targetUser.username || targetUser.displayName || 'this user'}.`);
    }
    if (existing.status === 'pending') {
      // Auto-accept the reciprocal request
      await updateDoc(doc(db, 'connections', connIdIncoming), {
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });
      return { ...existing, id: connIdIncoming, status: 'accepted' };
    }
  }

  const id = connIdOutgoing;
  const connection: UserConnection = {
    id,
    requesterId: currentUser.id,
    requesterUsername: currentUser.username || extractHandleFromEmail(currentUser.email, currentUser.displayName),
    requesterDisplayName: currentUser.displayName || currentUser.name || 'Workspace User',
    requesterPhotoUrl: currentUser.photoUrl || undefined,
    recipientId: targetUser.id,
    recipientUsername: targetUser.username || extractHandleFromEmail(targetUser.email, targetUser.displayName),
    recipientDisplayName: targetUser.displayName || targetUser.name || 'Workspace User',
    recipientPhotoUrl: targetUser.photoUrl || undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'connections', id), connection);
  return connection;
}

export async function respondToConnection(connectionId: string, status: 'accepted' | 'declined' | 'blocked'): Promise<void> {
  const docRef = doc(db, 'connections', connectionId);
  await updateDoc(docRef, {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeToMyConnections(userId: string, callback: (connections: UserConnection[]) => void): () => void {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const q1 = query(collection(db, 'connections'), where('requesterId', '==', userId));
  const q2 = query(collection(db, 'connections'), where('recipientId', '==', userId));

  let reqs: UserConnection[] = [];
  let recs: UserConnection[] = [];

  const update = () => {
    const map = new Map<string, UserConnection>();
    [...reqs, ...recs].forEach(c => map.set(c.id, c));
    const sorted = Array.from(map.values()).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
    callback(sorted);
  };

  const unsub1 = onSnapshot(q1, (snap) => {
    reqs = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserConnection));
    update();
  }, (err) => {
    console.warn('[connectionService] Requester connections listener note:', err?.message || err);
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserConnection));
    update();
  }, (err) => {
    console.warn('[connectionService] Recipient connections listener note:', err?.message || err);
  });

  return () => {
    try { unsub1(); } catch {}
    try { unsub2(); } catch {}
  };
}
