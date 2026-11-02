import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export type OfflineActionType =
  | 'task:create'
  | 'task:update'
  | 'task:delete'
  | 'task:status_change'
  | 'task:comment'
  | 'document:save'
  | 'document:create'
  | 'document:delete'
  | 'project:create'
  | 'project:update'
  | 'project:delete'
  | 'inbox:capture'
  | 'inbox:process'
  | 'client:create'
  | 'client:update'
  | 'meeting:create'
  | 'meeting:update'
  | 'meeting:delete'
  | 'followup:create'
  | 'followup:update'
  | 'share:create'
  | 'share:revoke';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: any;
  targetId?: string;
  timestamp: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

const OFFLINE_ACTION_QUEUE_KEY = 'hubmind_offline_action_queue_v2';
const SYNC_CHANNEL_NAME = 'hubmind_sw_offline_sync';

// Setup BroadcastChannel for cross-tab and SW communication
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === 'TRIGGER_SYNC') {
        void flushOfflineQueue();
      }
    };
  }
} catch {
  // BroadcastChannel unavailable
}

/**
 * Retrieve all pending offline actions from local storage
 */
export function getOfflineActionQueue(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ACTION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[OfflineQueue] Failed to parse local storage queue:', err);
    return [];
  }
}

/**
 * Persist queue to local storage and notify SW / tabs
 */
export function setOfflineActionQueue(queue: OfflineAction[]): void {
  try {
    localStorage.setItem(OFFLINE_ACTION_QUEUE_KEY, JSON.stringify(queue));
    notifyServiceWorkerQueueUpdated(queue.length);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hubmind:offline-queue-changed', {
          detail: { count: queue.length, queue },
        })
      );
    }
  } catch (err) {
    console.warn('[OfflineQueue] Failed to save queue to localStorage:', err);
  }
}

/**
 * Notify Service Worker of queue state
 */
export function notifyServiceWorkerQueueUpdated(count: number): void {
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'QUEUE_UPDATED', count });
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'QUEUE_UPDATED',
        count,
      });
    }
  } catch (e) {
    console.debug('[OfflineQueue] SW postMessage debug:', e);
  }
}

/**
 * Enqueue a new user action to local storage queue
 */
export function enqueueOfflineAction(
  type: OfflineActionType,
  payload: any,
  targetId?: string
): OfflineAction {
  const action: OfflineAction = {
    id: `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type,
    payload,
    targetId,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };

  const currentQueue = getOfflineActionQueue();
  currentQueue.push(action);
  setOfflineActionQueue(currentQueue);

  console.log(`[OfflineQueue] Enqueued offline action: ${type}`, action);

  // If online right now, try to flush immediately
  if (navigator.onLine) {
    void flushOfflineQueue();
  }

  return action;
}

let isFlushing = false;

/**
 * Process all queued offline actions and sync them to Firestore
 */
export async function flushOfflineQueue(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  if (isFlushing) return { synced: 0, failed: 0, remaining: getOfflineActionQueue().length };
  if (!navigator.onLine) {
    return { synced: 0, failed: 0, remaining: getOfflineActionQueue().length };
  }

  const queue = getOfflineActionQueue();
  if (queue.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  isFlushing = true;
  let synced = 0;
  let failed = 0;
  const remaining: OfflineAction[] = [];

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hubmind:sync-status', {
      detail: { status: 'syncing', queueCount: queue.length },
    }));
  }

  try {
    for (const item of queue) {
      // Exhausted actions stay in the durable queue until the user explicitly
      // retries them. Never turn an empty active queue into a false "synced".
      if (item.status === 'failed' && (item.retryCount || 0) >= 5) {
        remaining.push(item);
        failed++;
        continue;
      }
      try {
        item.status = 'syncing';
        await processSingleAction(item);
        synced++;
      } catch (err: any) {
        console.error(`[OfflineQueue] Error syncing action ${item.id} (${item.type}):`, err);
        item.retryCount = (item.retryCount || 0) + 1;
        item.error = err?.message || 'Sync failed';
        item.status = item.retryCount >= 5 ? 'failed' : 'pending';
        // Always retain failed work. Items at five retries become a manual
        // recovery item and are excluded from background retry attempts.
        remaining.push(item);
        failed++;
      }
    }
  } finally {
    isFlushing = false;
  }

  setOfflineActionQueue(remaining);
  const hasExhaustedFailures = remaining.some(item => item.status === 'failed' && (item.retryCount || 0) >= 5);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hubmind:sync-status', {
      detail: {
        status: remaining.length === 0 ? 'synced' : hasExhaustedFailures ? 'failed' : 'pending',
        syncedCount: synced,
        failedCount: failed,
        queueCount: remaining.length,
      },
    }));
  }

  return { synced, failed, remaining: remaining.length };
}

/**
 * Reset exhausted actions for an explicit user-requested retry.
 */
export async function retryFailedOfflineActions(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const queue = getOfflineActionQueue();
  let retried = 0;
  for (const item of queue) {
    if (item.status === 'failed') {
      item.retryCount = 0;
      item.status = 'pending';
      delete item.error;
      retried++;
    }
  }
  if (retried > 0) setOfflineActionQueue(queue);
  return flushOfflineQueue();
}

/**
 * Execute single action against Firestore
 */
async function processSingleAction(action: OfflineAction): Promise<void> {
  const { type, payload, targetId } = action;

  switch (type) {
    case 'task:create': {
      if (payload.id) {
        await setDoc(doc(db, 'tasks', payload.id), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...payload,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'task:update':
    case 'task:status_change': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Task ID missing for update');
      const updateData = { ...payload };
      delete updateData.id;
      updateData.updatedAt = new Date().toISOString();
      await updateDoc(doc(db, 'tasks', id), updateData);
      break;
    }

    case 'task:delete': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Task ID missing for delete');
      await deleteDoc(doc(db, 'tasks', id));
      break;
    }

    case 'task:comment': {
      const id = targetId || payload.taskId;
      if (!id) throw new Error('Task ID missing for comment');
      const taskRef = doc(db, 'tasks', id);
      const snap = await getDoc(taskRef);
      if (snap.exists()) {
        const existingComments = snap.data()?.comments || [];
        await updateDoc(taskRef, {
          comments: [...existingComments, payload.comment],
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'document:save':
    case 'document:create': {
      const docId = targetId || payload.id;
      if (docId) {
        await setDoc(
          doc(db, 'documents', docId),
          {
            ...payload,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        await addDoc(collection(db, 'documents'), {
          ...payload,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'document:delete': {
      const docId = targetId || payload.id;
      if (!docId) throw new Error('Document ID missing for delete');
      await deleteDoc(doc(db, 'documents', docId));
      break;
    }

    case 'project:create': {
      if (payload.id) {
        await setDoc(doc(db, 'projects', payload.id), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, 'projects'), {
          ...payload,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'project:update': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Project ID missing for update');
      const updateData = { ...payload };
      delete updateData.id;
      updateData.updatedAt = new Date().toISOString();
      await updateDoc(doc(db, 'projects', id), updateData);
      break;
    }

    case 'project:delete': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Project ID missing for delete');
      await deleteDoc(doc(db, 'projects', id));
      break;
    }

    case 'inbox:capture': {
      await addDoc(collection(db, 'inbox'), {
        ...payload,
        createdAt: payload.createdAt || new Date().toISOString(),
      });
      break;
    }

    case 'inbox:process': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Inbox ID missing for process');
      await updateDoc(doc(db, 'inbox', id), {
        status: payload.status || 'processed',
        processedAt: new Date().toISOString(),
        processedType: payload.processedType,
        targetId: payload.targetId,
      });
      break;
    }

    case 'client:create': {
      if (payload.id) {
        await setDoc(doc(db, 'clients', payload.id), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, 'clients'), {
          ...payload,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'client:update': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Client ID missing for update');
      const updateData = { ...payload };
      delete updateData.id;
      updateData.updatedAt = new Date().toISOString();
      await updateDoc(doc(db, 'clients', id), updateData);
      break;
    }

    case 'meeting:create': {
      if (payload.id) {
        await setDoc(doc(db, 'meetings', payload.id), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, 'meetings'), {
          ...payload,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'meeting:update': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Meeting ID missing for update');
      const updateData = { ...payload };
      delete updateData.id;
      updateData.updatedAt = new Date().toISOString();
      await updateDoc(doc(db, 'meetings', id), updateData);
      break;
    }

    case 'meeting:delete': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Meeting ID missing for delete');
      await deleteDoc(doc(db, 'meetings', id));
      break;
    }

    case 'followup:create': {
      if (payload.id) {
        await setDoc(doc(db, 'followUps', payload.id), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, 'followUps'), {
          ...payload,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      break;
    }

    case 'followup:update': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Followup ID missing for update');
      const updateData = { ...payload };
      delete updateData.id;
      updateData.updatedAt = new Date().toISOString();
      await updateDoc(doc(db, 'followUps', id), updateData);
      break;
    }

    case 'share:create': {
      await addDoc(collection(db, 'resourceShares'), {
        ...payload,
        createdAt: payload.createdAt || new Date().toISOString(),
      });
      break;
    }

    case 'share:revoke': {
      const id = targetId || payload.id;
      if (!id) throw new Error('Share ID missing for revoke');
      await deleteDoc(doc(db, 'resourceShares', id));
      break;
    }

    default:
      console.warn(`[OfflineQueue] Unknown action type: ${type}`);
  }
}

// Global window event listeners to trigger flush on network reconnect
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineQueue] Network online detected. Flushing offline queue...');
    void flushOfflineQueue();
  });

  // Background sync registration if supported
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then((reg) => {
        (reg as any).sync?.register?.('sync-workspace-queue').catch(() => {});
      })
      .catch(() => {});
  }
}
