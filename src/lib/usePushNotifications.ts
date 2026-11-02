import { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export function usePushNotifications(profileId?: string) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const initTime = useRef(new Date().toISOString());

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setPermission(perm);
  };

  useEffect(() => {
    if (!profileId || permission !== 'granted') return;

    const q = query(
      collection(db, 'activityLogs'),
      where('createdAt', '>', initTime.current)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.userId !== profileId) {
              try {
                new Notification('Hub-Mind', {
                  body: `New Activity: ${data.details}`,
                  icon: '/icon.png',
                });
              } catch (e) {
                console.warn('Could not display notification', e);
              }
            }
          }
        });
      },
      (error) => {
        console.warn('Push notification subscription error:', error);
      }
    );

    return () => unsub();
  }, [profileId, permission]);

  return { permission, requestPermission };
}
