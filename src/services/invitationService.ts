import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { UserInvitation } from '../types';
import { normalizeUsername, isUsernameAvailable } from './userService';

export async function createInvitation(params: {
  email: string;
  username: string;
  displayName: string;
  phone?: string;
  invitedBy: string;
  expiresInDays?: number;
}): Promise<UserInvitation> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const normalizedUser = normalizeUsername(params.username);

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('A valid email address is required.');
  }

  if (normalizedUser.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }

  const available = await isUsernameAvailable(normalizedUser);
  if (!available) {
    throw new Error(`Username @${normalizedUser} is already taken.`);
  }

  const existingInviteQuery = query(
    collection(db, 'invitations'),
    where('email', '==', normalizedEmail),
    where('status', '==', 'invited')
  );
  const existingInviteSnap = await getDocs(existingInviteQuery);
  if (!existingInviteSnap.empty) {
    throw new Error(`An active invitation for ${normalizedEmail} already exists.`);
  }

  const now = new Date();
  const days = params.expiresInDays || 14;
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const id = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const invitation: UserInvitation = {
    id,
    email: normalizedEmail,
    username: normalizedUser,
    displayName: params.displayName.trim() || normalizedUser,
    phone: params.phone?.trim() || undefined,
    role: 'staff',
    status: 'invited',
    invitedBy: params.invitedBy,
    createdAt: now.toISOString(),
    expiresAt,
  };

  const docRef = doc(db, 'invitations', id);
  await setDoc(docRef, invitation);
  return invitation;
}

export async function checkActiveInvitation(email: string): Promise<UserInvitation | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const q = query(
      collection(db, 'invitations'),
      where('email', '==', normalized),
      where('status', '==', 'invited')
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    const data = { id: docSnap.id, ...docSnap.data() } as UserInvitation;

    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      await updateDoc(doc(db, 'invitations', docSnap.id), { status: 'expired' });
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error checking active invitation:', err);
    return null;
  }
}

export async function markInvitationAccepted(invitationId: string, acceptedByUid: string): Promise<void> {
  const docRef = doc(db, 'invitations', invitationId);
  await updateDoc(docRef, {
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
    acceptedByUid,
  });
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const docRef = doc(db, 'invitations', invitationId);
  await updateDoc(docRef, {
    status: 'revoked',
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeToInvitations(callback: (invitations: UserInvitation[]) => void): () => void {
  const q = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const invites = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserInvitation));
    callback(invites);
  }, (err) => {
    console.warn('Subscribe to invitations warning:', err);
  });
}
