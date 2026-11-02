import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ActivityLog } from '../types';

export const logActivity = async (
  entityId: string,
  entityType: ActivityLog['entityType'],
  action: string,
  details: string,
  userId: string
) => {
  try {
    await addDoc(collection(db, 'activityLogs'), {
      entityId,
      entityType,
      action,
      details,
      userId,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to log activity", error);
  }
};
