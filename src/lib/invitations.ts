import { addDoc, collection, doc, getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Invitation } from '../types';
import { isValidUsername, normalizeUsername } from './hubMindArchitecture';

const INVITE_DAYS = 7;

export async function createInvitation(input: { username: string; displayName: string; email: string; phone?: string; invitedBy: string }) {
  const username = normalizeUsername(input.username);
  if (!isValidUsername(username)) throw new Error('Username must be 3–30 characters using lowercase letters, numbers, or underscores.');
  const existing = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
  if (!existing.empty) throw new Error('That username is already in use.');
  const pending = await getDocs(query(collection(db, 'invitations'), where('username', '==', username), where('status', '==', 'invited')));
  if (!pending.empty) throw new Error('An active invitation already exists for that username.');
  const now = new Date(); const expires = new Date(now.getTime() + INVITE_DAYS * 86400000);
  const ref = await addDoc(collection(db, 'invitations'), { username, displayName: input.displayName.trim(), email: input.email.trim().toLowerCase(), phone: input.phone?.trim() || undefined, role: 'staff', status: 'invited', invitedBy: input.invitedBy, createdAt: now.toISOString(), expiresAt: expires.toISOString() });
  return { id: ref.id, expiresAt: expires.toISOString(), link: `${window.location.origin}/login?invite=${ref.id}` };
}

export async function getInvitation(id: string) {
  const snap = await getDoc(doc(db, 'invitations', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Invitation;
}

export function validateInvitationAcceptance(invitation: Invitation, uid: string, email: string, now = Date.now()) {
  if (invitation.status !== 'invited') throw new Error('This invitation is no longer active.');
  if (new Date(invitation.expiresAt).getTime() <= now) throw new Error('This invitation has expired.');
  if (invitation.email !== email.trim().toLowerCase()) throw new Error('Please sign in with the Google account that was invited.');
}

export async function acceptInvitation(invitationId: string, uid: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const ref = doc(db, 'invitations', invitationId);
  const acceptedAt = new Date().toISOString();
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Invitation not found.');
    const invitation = { id: snap.id, ...snap.data() } as Invitation;
    validateInvitationAcceptance(invitation, uid, normalizedEmail);
    transaction.update(ref, { status: 'accepted', acceptedAt, acceptedUid: uid });
    return invitation;
  });
}
