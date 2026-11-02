import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Notification, ResourceType } from '../types';

export async function createNotification(params: {
  userId: string;
  type: string;
  title?: string;
  message: string;
  resourceType?: ResourceType;
  resourceId?: string;
  actionUrl?: string;
}): Promise<Notification> {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const notif: Notification = {
    id,
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    actionUrl: params.actionUrl,
    read: false,
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'notifications', id), notif);
  return notif;
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
}

export async function markAllNotificationsAsRead(notifications: Notification[]): Promise<void> {
  const unread = notifications.filter(n => !n.read);
  await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
}

export function subscribeToNotifications(userId: string, callback: (notifications: Notification[]) => void): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
  }, (err) => {
    console.warn('Notifications subscription warning:', err);
  });
}
