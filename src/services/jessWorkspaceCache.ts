import {
  collection,
  onSnapshot,
  query,
  where,
  or,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from '../types';

const STORAGE_PREFIX = 'hubmind_jess_workspace_cache_v2_';
const MAX_PER_COLLECTION = 150;

type CachedRecord = { id: string; [key: string]: any };
type CacheState = Record<string, CachedRecord[]>;

let activeUserId = '';
let activeUnsubs: Unsubscribe[] = [];
let memoryCache: CacheState = {};
let lastSyncAt = 0;

const COLLECTIONS = [
  'documents',
  'tasks',
  'projects',
  'meetings',
  'clients',
  'followUps',
  'knowledge',
  'reports',
  'recurringMeetingTemplates',
];

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function loadLocal(userId: string): CacheState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistLocal() {
  if (!activeUserId) return;
  try {
    localStorage.setItem(storageKey(activeUserId), JSON.stringify(memoryCache));
  } catch {}
}

function replaceCollection(name: string, records: CachedRecord[]) {
  memoryCache[name] = records.slice(0, MAX_PER_COLLECTION);
  lastSyncAt = Date.now();
  persistLocal();
}


function authorizedQuery(collectionName: string, userId: string, isAdmin: boolean) {
  const col = collection(db, collectionName);
  if (isAdmin) return query(col, limit(MAX_PER_COLLECTION));
  return query(
    col,
    or(
      where('ownerId', '==', userId),
      where('createdBy', '==', userId),
      where('visibility', '==', 'workspace'),
      where('sharedWith.' + userId, 'in', ['read', 'write'])
    ),
    limit(MAX_PER_COLLECTION)
  );
}

function startListener(name: string, q: any) {
  const unsub = onSnapshot(
    q,
    snapshot => {
      replaceCollection(
        name,
        snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }))
      );
    },
    error => {
      console.warn(`[JessCache] ${name} listener unavailable; retaining cached data:`, error?.message || error);
    }
  );
  activeUnsubs.push(unsub);
}

export function startJessWorkspaceCache(user: User): () => void {
  stopJessWorkspaceCache();

  if (!user?.id) return () => {};
  activeUserId = user.id;
  memoryCache = loadLocal(user.id);
  lastSyncAt = Date.now();

  const isAdmin = user.role === 'admin';

  // Each listener immediately receives the SDK's locally persisted snapshot when
  // available, then updates from the server. Jess therefore has a warm local index
  // without waiting for a network round-trip during a voice session.
  startListener('documents', authorizedQuery('documents', user.id, isAdmin));
  startListener('tasks', authorizedQuery('tasks', user.id, isAdmin));
  startListener('projects', authorizedQuery('projects', user.id, isAdmin));
  startListener('meetings', authorizedQuery('meetings', user.id, isAdmin));
  startListener('clients', authorizedQuery('clients', user.id, isAdmin));
  startListener('followUps', authorizedQuery('followUps', user.id, isAdmin));
  startListener('knowledge', authorizedQuery('knowledge', user.id, isAdmin));
  startListener('reports', authorizedQuery('reports', user.id, isAdmin));
  startListener('recurringMeetingTemplates', authorizedQuery('recurringMeetingTemplates', user.id, isAdmin));

  return () => stopJessWorkspaceCache();
}

export function stopJessWorkspaceCache() {
  activeUnsubs.forEach(unsub => {
    try { unsub(); } catch {}
  });
  activeUnsubs = [];
  activeUserId = '';
  memoryCache = {};
  lastSyncAt = 0;
}

export function getCachedCollection<T = CachedRecord>(name: string): T[] {
  return ((memoryCache[name] || []) as T[]).slice();
}

export function getCachedRecord(name: string, id: string): CachedRecord | null {
  return getCachedCollection<CachedRecord>(name).find(item => item.id === id) || null;
}

export function getJessWorkspaceCacheStatus() {
  return {
    userId: activeUserId,
    lastSyncAt,
    collections: Object.fromEntries(COLLECTIONS.map(name => [name, (memoryCache[name] || []).length])),
  };
}

export function searchJessWorkspaceCache(term: string, max = 25): CachedRecord[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const results: CachedRecord[] = [];
  const seen = new Set<string>();

  for (const collectionName of COLLECTIONS) {
    for (const item of getCachedCollection<CachedRecord>(collectionName)) {
      const haystack = JSON.stringify(item).toLowerCase();
      if (!haystack.includes(q)) continue;
      const key = `${collectionName}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ ...item, _collection: collectionName });
      if (results.length >= max) return results;
    }
  }

  return results;
}
