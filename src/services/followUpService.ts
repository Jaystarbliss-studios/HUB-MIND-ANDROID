import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FollowUp, User, ResourceVisibility } from '../types';
import { logActivity } from './activityService';
import { isSharedWith } from '../lib/rbac';

export async function createFollowUp(params: {
  title: string;
  dueAt: string;
  person?: string;
  clientId?: string;
  relatedTaskId?: string;
  relatedProjectId?: string;
  reason?: string;
  priority?: FollowUp['priority'];
  notes?: string;
  currentUser: User;
  visibility?: ResourceVisibility;
}): Promise<FollowUp> {
  const id = `fu_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const followUp: FollowUp = {
    id,
    title: params.title.trim(),
    person: params.person?.trim() || undefined,
    clientId: params.clientId || undefined,
    relatedTaskId: params.relatedTaskId || undefined,
    relatedProjectId: params.relatedProjectId || undefined,
    reason: params.reason?.trim() || undefined,
    priority: params.priority || 'medium',
    dueAt: params.dueAt,
    status: 'scheduled',
    notes: params.notes?.trim() || undefined,
    ownerId: params.currentUser.id,
    visibility: params.visibility || params.currentUser.defaultVisibility || 'workspace',
    sharedWith: [],
    permissions: {},
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'followUps', id), followUp);

  await logActivity({
    entityId: id,
    entityType: 'client',
    action: 'created',
    userId: params.currentUser.id,
    username: params.currentUser.username,
    userDisplayName: params.currentUser.displayName,
    details: `Created follow-up "${followUp.title}"`,
  });

  return followUp;
}

export async function updateFollowUp(
  followUpId: string,
  data: Partial<FollowUp>,
  currentUser: User
): Promise<void> {
  const docRef = doc(db, 'followUps', followUpId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteFollowUp(followUpId: string, currentUser: User): Promise<void> {
  const docRef = doc(db, 'followUps', followUpId);
  const snap = await getDoc(docRef);
  const title = snap.exists() ? snap.data().title : 'Follow-up';

  await deleteDoc(docRef);

  await logActivity({
    entityId: followUpId,
    entityType: 'client',
    action: 'deleted',
    userId: currentUser.id,
    username: currentUser.username,
    userDisplayName: currentUser.displayName,
    details: `Deleted follow-up "${title}"`,
  });
}

export function subscribeToFollowUps(
  currentUser: User,
  callback: (followUps: FollowUp[]) => void,
  projectId?: string
): () => void {
  const q = query(collection(db, 'followUps'), orderBy('dueAt', 'asc'));

  return onSnapshot(q, (snap) => {
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FollowUp));

    if (currentUser.role !== 'admin') {
      list = list.filter(fu => {
        if (fu.ownerId === currentUser.id) return true;
        if (fu.visibility === 'workspace') return true;
        if (fu.visibility === 'shared' && isSharedWith(fu.sharedWith, currentUser.id)) return true;
        return false;
      });
    }

    if (projectId) {
      list = list.filter(fu => fu.relatedProjectId === projectId);
    }

    callback(list);
  }, (err) => {
    console.warn('Follow-ups subscription warning:', err);
  });
}
