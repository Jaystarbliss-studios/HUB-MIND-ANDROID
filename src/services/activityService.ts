import { collection, doc, setDoc, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ActivityLog, Notification, ResourceType } from '../types';

export async function logActivity(params: {
  entityId: string;
  entityType: 'task' | 'meeting' | 'client' | 'document' | 'project' | 'knowledge' | 'user' | 'share';
  action: string;
  userId: string;
  username?: string;
  userDisplayName?: string;
  details: string;
}): Promise<void> {
  try {
    const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const log: ActivityLog = {
      id,
      entityId: params.entityId,
      entityType: params.entityType,
      action: params.action,
      userId: params.userId,
      username: params.username,
      userDisplayName: params.userDisplayName,
      details: params.details,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'activityLogs', id), log);
  } catch (err) {
    console.warn('Could not record activity log:', err);
  }
}

export function subscribeToActivityLogs(
  callback: (logs: ActivityLog[]) => void, 
  maxCount = 50,
  filterEntityId?: string
): () => void {
  let q = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(maxCount));
  if (filterEntityId) {
    q = query(
      collection(db, 'activityLogs'), 
      where('entityId', '==', filterEntityId),
      orderBy('createdAt', 'desc'), 
      limit(maxCount)
    );
  }

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
  }, (err) => {
    console.warn('Activity log subscription warning:', err);
  });
}
