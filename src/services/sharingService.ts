import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { 
  ResourceShare, 
  ResourceType, 
  SharePermission, 
  User 
} from '../types';
export type { ResourceType, SharePermission };
import { getUserByUsername, getUserProfile, getAllUsers } from './userService';

function getCollectionName(resourceType: ResourceType): string {
  switch (resourceType) {
    case 'document': return 'documents';
    case 'task': return 'tasks';
    case 'meeting': return 'meetings';
    case 'project': return 'projects';
    case 'client': return 'clients';
    case 'followup': return 'followUps';
    default: return 'documents';
  }
}

export async function findRecipientUser(identifier: string): Promise<User | null> {
  const raw = (identifier || '').trim();
  if (!raw) return null;
  const clean = raw.replace(/^@+/, '');

  // 1. By username
  try {
    const byUsername = await getUserByUsername(clean);
    if (byUsername) return byUsername;
  } catch {}

  // 2. By email
  if (raw.includes('@')) {
    try {
      const qEmail = query(collection(db, 'users'), where('email', '==', raw.toLowerCase()));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        return { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() } as User;
      }
    } catch {}
  }

  // 3. By UID
  try {
    const byId = await getUserProfile(raw);
    if (byId) return byId;
  } catch {}

  // 4. Directory scan
  try {
    const all = await getAllUsers();
    const match = all.find(u => 
      (u.username && u.username.toLowerCase() === clean.toLowerCase()) ||
      (u.email && u.email.toLowerCase() === raw.toLowerCase()) ||
      (u.displayName && u.displayName.toLowerCase() === raw.toLowerCase()) ||
      (u.name && u.name.toLowerCase() === raw.toLowerCase())
    );
    if (match) return match;
  } catch {}

  return null;
}

export async function shareResourceWithUser(params: {
  resourceType: ResourceType;
  resourceId: string;
  resourceTitle?: string;
  ownerId: string;
  ownerName?: string;
  recipientUsernameOrId: string;
  permission: SharePermission;
  message?: string;
}): Promise<ResourceShare> {
  const recipient = await findRecipientUser(params.recipientUsernameOrId);

  if (!recipient) {
    throw new Error(`User "${params.recipientUsernameOrId}" not found in workspace directory.`);
  }

  if (recipient.id === params.ownerId) {
    throw new Error('Cannot share resource with yourself.');
  }

  const shareId = `share_${params.resourceType}_${params.resourceId}_${recipient.id}`;
  const now = new Date().toISOString();

  const share: ResourceShare = {
    id: shareId,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    resourceTitle: params.resourceTitle || 'Untitled Resource',
    ownerId: params.ownerId,
    recipientUserId: recipient.id,
    recipientUsername: recipient.username,
    permission: params.permission,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'shares', shareId), share);

  // Update target resource's sharedWith array and permissions map for fast querying & security rules
  const collName = getCollectionName(params.resourceType);
  const resourceRef = doc(db, collName, params.resourceId);
  try {
    const snap = await getDoc(resourceRef);

    if (snap.exists()) {
      const data = snap.data();
      const currentSharedWith: string[] = Array.isArray(data.sharedWith) ? data.sharedWith : [];
      const currentPermissions: Record<string, SharePermission> = data.permissions || {};

      if (!currentSharedWith.includes(recipient.id)) {
        currentSharedWith.push(recipient.id);
      }
      currentPermissions[recipient.id] = params.permission;

      await updateDoc(resourceRef, {
        sharedWith: currentSharedWith,
        permissions: currentPermissions,
        visibility: 'shared',
        updatedAt: now,
      });
    }
  } catch (e) {
    console.warn('Resource permissions update note:', e);
  }

  // Deliver notification to recipient's notification box
  try {
    const senderName = params.ownerName || 'A teammate';
    const notifDoc = {
      userId: recipient.id,
      type: 'resource_shared',
      message: `${senderName} shared ${params.resourceType} "${params.resourceTitle || 'Resource'}" with you (${params.permission === 'write' ? 'Can Edit' : 'Read Only'}).`,
      read: false,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      senderId: params.ownerId,
      createdAt: now,
    };
    await addDoc(collection(db, 'notifications'), notifDoc);
  } catch (e) {
    console.warn('Share notification delivery note:', e);
  }

  return share;
}

export async function sendDirectInformation(params: {
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName?: string;
  type: 'document' | 'task' | 'project' | 'note' | 'briefing';
  title: string;
  content?: string;
  resourceId?: string;
  permission?: SharePermission;
}): Promise<void> {
  const now = new Date().toISOString();

  // If linking to a registered resource, ensure share permission is set
  if (params.resourceId && params.type !== 'note' && params.type !== 'briefing') {
    await shareResourceWithUser({
      resourceType: params.type as ResourceType,
      resourceId: params.resourceId,
      resourceTitle: params.title,
      ownerId: params.senderId,
      ownerName: params.senderName,
      recipientUsernameOrId: params.recipientId,
      permission: params.permission || 'read',
    });
  }

  // Deliver instant notification
  const notifDoc = {
    userId: params.recipientId,
    type: `shared_${params.type}`,
    message: `${params.senderName} sent you ${params.type}: "${params.title}"${params.content ? ` — ${params.content.slice(0, 120)}` : ''}`,
    read: false,
    resourceType: params.type,
    resourceId: params.resourceId || '',
    senderId: params.senderId,
    senderName: params.senderName,
    content: params.content || '',
    createdAt: now,
  };
  await addDoc(collection(db, 'notifications'), notifDoc);

  // Deliver activity log
  try {
    await addDoc(collection(db, 'activityLogs'), {
      userId: params.senderId,
      userDisplayName: params.senderName,
      action: `sent ${params.type} "${params.title}" to`,
      details: params.recipientName || 'colleague',
      entityType: params.type,
      entityId: params.resourceId || '',
      createdAt: now,
    });
  } catch {}
}

export async function revokeResourceShare(shareId: string): Promise<void> {
  const shareRef = doc(db, 'shares', shareId);
  const snap = await getDoc(shareRef);
  if (!snap.exists()) return;

  const share = snap.data() as ResourceShare;
  await updateDoc(shareRef, { status: 'revoked', updatedAt: new Date().toISOString() });

  // Update parent resource permissions
  const collName = getCollectionName(share.resourceType);
  const resourceRef = doc(db, collName, share.resourceId);
  try {
    const resSnap = await getDoc(resourceRef);

    if (resSnap.exists()) {
      const data = resSnap.data();
      const currentSharedWith: string[] = (data.sharedWith || []).filter((uid: string) => uid !== share.recipientUserId);
      const currentPermissions = { ...(data.permissions || {}) };
      delete currentPermissions[share.recipientUserId];

      await updateDoc(resourceRef, {
        sharedWith: currentSharedWith,
        permissions: currentPermissions,
        visibility: currentSharedWith.length === 0 && data.visibility === 'shared' ? 'private' : data.visibility,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('Resource share revoke note:', e);
  }
}

export function subscribeToResourceShares(resourceId: string, ownerId: string, callback: (shares: ResourceShare[]) => void): () => void {
  if (!resourceId || !ownerId) { callback([]); return () => {}; }
  const q = query(
    collection(db, 'shares'),
    where('resourceId', '==', resourceId),
    where('ownerId', '==', ownerId),
    where('status', '==', 'active')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ResourceShare)));
  }, (err) => {
    console.warn('Shares subscription warning:', err);
  });
}

export function subscribeToSharesForUser(userId: string, callback: (shares: ResourceShare[]) => void): () => void {
  const q = query(
    collection(db, 'shares'),
    where('recipientUserId', '==', userId),
    where('status', '==', 'active')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ResourceShare)));
  }, (err) => {
    console.warn('User shares subscription warning:', err);
  });
}
