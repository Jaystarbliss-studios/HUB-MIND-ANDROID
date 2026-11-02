import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  getDocsFromCache,
  setDoc, 
  deleteDoc, 
  query, 
  limit, 
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { UserMemory, MemoryCategory } from '../types';

const LOCAL_MEMORY_PREFIX = 'hubmind_memories_';

function getLocalMemories(userId: string): UserMemory[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_MEMORY_PREFIX}${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function setLocalMemories(userId: string, memories: UserMemory[]) {
  if (!userId) return;
  try {
    localStorage.setItem(`${LOCAL_MEMORY_PREFIX}${userId}`, JSON.stringify(memories));
  } catch {}
}

// Tool capabilities are runtime-dependent. Never persist assistant capability claims
// as user memories; purge old claims narrowly without touching user preferences.
function isCapabilityClaimMemory(memory: Partial<UserMemory>): boolean {
  const text = `${String(memory.key || '')} ${String(memory.content || '')}`;
  return /\b(?:jess|hub-?mind|assistant|native tool|desktop agent)\b[\s\S]{0,100}\b(?:can't|cannot|unable to|doesn't support|not supported|not available|lacks)\b|\b(?:can't|cannot|unable to|doesn't support|not supported|not available|lacks)\b[\s\S]{0,100}\b(?:minimize windows|control windows|click|type|launch apps|desktop control|native actions|access the screen)\b/i.test(text);
}

/**
 * Resolves the authenticated user ID safely to prevent unauthenticated Firestore queries.
 */
function getEffectiveUserId(providedUserId?: string): string | null {
  const currentUid = auth.currentUser?.uid;
  if (currentUid) return currentUid;
  if (providedUserId && providedUserId.trim()) return providedUserId.trim();
  return null;
}

export async function saveUserMemory(
  userId: string, 
  data: {
    key?: string;
    content: string;
    category?: MemoryCategory;
    importance?: number | 'high' | 'medium' | 'low';
    source?: 'voice' | 'chat' | 'system' | 'explicit';
  }
): Promise<UserMemory> {
  const cleanContent = data.content?.trim();
  if (!cleanContent) {
    throw new Error('Memory content is required.');
  }
  if (isCapabilityClaimMemory({ key: data.key, content: cleanContent })) {
    throw new Error('Runtime capability claims are not stored as user memories.');
  }

  const effectiveUid = getEffectiveUserId(userId);
  const targetUserId = effectiveUid || userId || 'anonymous';
  const now = new Date().toISOString();
  const cleanKey = (data.key || cleanContent.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_')).trim();
  const category: MemoryCategory = data.category || 'preference';
  
  // Deterministic memory ID based on key or generate unique ID
  const memoryId = data.key 
    ? `mem_${targetUserId}_${cleanKey}` 
    : `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const memory: UserMemory = {
    id: memoryId,
    userId: targetUserId,
    key: cleanKey,
    content: cleanContent,
    category,
    importance: data.importance || 'medium',
    source: data.source || 'explicit',
    createdAt: now,
    updatedAt: now,
    lastReferencedAt: now,
  };

  // Only attempt Firestore write if the user is authenticated
  if (auth.currentUser) {
    try {
      const memRef = doc(db, 'users', auth.currentUser.uid, 'memories', memoryId);
      await setDoc(memRef, memory, { merge: true });
    } catch (err: any) {
      // Graceful non-blocking fallback
      console.warn('[MemoryService] Firestore save notice (cached locally):', err?.message || err);
    }
  }

  // Update local cache
  const local = getLocalMemories(targetUserId);
  const existingIdx = local.findIndex(m => m.id === memoryId || (m.key && m.key === cleanKey));
  if (existingIdx >= 0) {
    local[existingIdx] = memory;
  } else {
    local.unshift(memory);
  }
  setLocalMemories(targetUserId, local);

  return memory;
}

export async function getUserMemories(userId: string): Promise<UserMemory[]> {
  const effectiveUid = getEffectiveUserId(userId);
  if (!effectiveUid) return [];

  const cached = getLocalMemories(effectiveUid);
  const invalidLocal = cached.filter(isCapabilityClaimMemory);
  const local = cached.filter(memory => !isCapabilityClaimMemory(memory));
  if (invalidLocal.length) {
    setLocalMemories(effectiveUid, local);
    for (const memory of invalidLocal) {
      if (auth.currentUser && memory.id) {
        void deleteDoc(doc(db, 'users', auth.currentUser.uid, 'memories', memory.id)).catch(() => {});
      }
    }
  }

  // Memory is cache-first. Jess must never block voice startup on a network round-trip.
  // Firestore's persistent web cache is queried immediately; a server refresh runs in
  // the background and updates the local user-scoped memory cache when available.
  if (auth.currentUser) {
    const memoryOwnerUid = auth.currentUser.uid;
    const colRef = collection(db, 'users', memoryOwnerUid, 'memories');
    const mergeAndCache = (firestoreMemories: UserMemory[]) => {
      const invalidRemote = firestoreMemories.filter(isCapabilityClaimMemory);
      for (const memory of invalidRemote) {
        if (memory.id) void deleteDoc(doc(db, 'users', memoryOwnerUid, 'memories', memory.id)).catch(() => {});
      }
      const safeRemote = firestoreMemories.filter(memory => !isCapabilityClaimMemory(memory));
      if (!safeRemote.length && !local.length) return;
      const map = new Map<string, UserMemory>();
      local.forEach(m => map.set(m.id, m));
      safeRemote.forEach(m => map.set(m.id, m));
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      );
      setLocalMemories(effectiveUid, merged);
    };

    try {
      const cachedSnap = await getDocsFromCache(query(colRef, limit(60)));
      mergeAndCache(cachedSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserMemory)));
    } catch {}

    // Do not block the caller on the server. The next session gets the refreshed cache.
    void getDocs(query(colRef, limit(60)))
      .then(snap => mergeAndCache(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserMemory))))
      .catch(err => console.warn('[MemoryService] Background memory refresh notice:', err?.message || err));
  }

  return getLocalMemories(effectiveUid);
}

export async function deleteUserMemory(userId: string, memoryIdOrKey: string): Promise<boolean> {
  const effectiveUid = getEffectiveUserId(userId);
  if (!effectiveUid || !memoryIdOrKey) return false;

  if (auth.currentUser) {
    try {
      const memRef = doc(db, 'users', auth.currentUser.uid, 'memories', memoryIdOrKey);
      await deleteDoc(memRef).catch(() => {});
    } catch (err: any) {
      console.warn('[MemoryService] Delete notice:', err?.message || err);
    }
  }

  const local = getLocalMemories(effectiveUid).filter(
    m => m.id !== memoryIdOrKey && m.key !== memoryIdOrKey
  );
  setLocalMemories(effectiveUid, local);
  return true;
}

export function subscribeToUserMemories(
  userId: string, 
  callback: (memories: UserMemory[]) => void
): () => void {
  let unsubFirestore: Unsubscribe | null = null;
  let isDisposed = false;

  const targetId = userId || auth.currentUser?.uid || '';
  // 1. Immediately emit locally cached memories
  if (targetId) {
    callback(getLocalMemories(targetId));
  }

  // 2. Attach Firestore listener once user is properly authenticated
  const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
    if (isDisposed) return;

    if (unsubFirestore) {
      unsubFirestore();
      unsubFirestore = null;
    }

    if (!firebaseUser) {
      if (targetId) callback(getLocalMemories(targetId));
      return;
    }

    const currentUid = firebaseUser.uid;
    callback(getLocalMemories(currentUid));

    try {
      const colRef = collection(db, 'users', currentUid, 'memories');
      unsubFirestore = onSnapshot(colRef, (snap) => {
        if (isDisposed) return;
        const memories = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserMemory));
        memories.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
        setLocalMemories(currentUid, memories);
        callback(memories);
      }, (err) => {
        console.warn('[MemoryService] Snapshot notice (fallback to local):', err?.message || err);
        callback(getLocalMemories(currentUid));
      });
    } catch (err) {
      console.warn('[MemoryService] Listener setup notice:', err);
    }
  });

  return () => {
    isDisposed = true;
    unsubAuth();
    if (unsubFirestore) {
      unsubFirestore();
      unsubFirestore = null;
    }
  };
}

export function formatMemoriesForPrompt(memories: UserMemory[]): string {
  if (!memories || memories.length === 0) {
    return 'No specific past user memories stored yet.';
  }

  const grouped: Record<string, string[]> = {};

  memories.slice(0, 25).forEach(m => {
    const cat = m.category || 'preference';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(`• ${m.content}${m.key ? ` [${m.key}]` : ''}`);
  });

  const sections = Object.entries(grouped).map(([category, items]) => {
    const title = category.toUpperCase();
    return `[${title}]\n${items.join('\n')}`;
  });

  return sections.join('\n\n');
}

export interface ExtractedDetail {
  key: string;
  content: string;
  category: MemoryCategory;
  importance: 'high' | 'medium' | 'low';
}

/**
 * Enhanced multi-pattern extraction engine that notices subtle nuances, personal preferences,
 * habits, working styles, schedule constraints, and colleague/client details dropped in conversation.
 */
export function extractNuancedDetails(userMessage: string): ExtractedDetail[] {
  if (!userMessage || userMessage.trim().length < 4) return [];
  const text = userMessage.trim();
  const results: ExtractedDetail[] = [];

  const add = (key: string, content: string, category: MemoryCategory, importance: 'high' | 'medium' | 'low' = 'medium') => {
    const cleanContent = content.trim().replace(/^[:,-]\s*/, '').replace(/[.!?]+$/, '');
    if (cleanContent.length < 4) return;
    if (!results.some(r => r.key === key || r.content.toLowerCase() === cleanContent.toLowerCase())) {
      results.push({ key, content: cleanContent, category, importance });
    }
  };

  // 1. Explicit Directives ("Remember that...", "Keep in mind that...", "Don't forget that...")
  const rememberMatch = text.match(/(?:remember(?:\s+that)?|keep in mind(?:\s+that)?|don't forget(?:\s+that)?|make sure to remember)\s+([^.!?\n]+)/i);
  if (rememberMatch && rememberMatch[1]) {
    add('user_note', rememberMatch[1].trim(), 'instruction', 'high');
  }

  // 2. Strong Preferences, likes, and dislikes.
  const preferMatch = text.match(/(?:i prefer|i always prefer|my preference is|i like to have|i like my|i like|i love|i enjoy)\s+([^.!?\n]+)/i);
  if (preferMatch && preferMatch[1]) {
    add('user_preference', `User preference/like: ${preferMatch[1].trim()}`, 'preference', 'high');
  }

  // 3. Dislikes & Constraints ("I don't like...", "Avoid...", "Never...", "Don't schedule...")
  const dislikeMatch = text.match(/(?:i (?:don't|do not) like|i hate|i dislike|avoid|never|do not schedule|don't schedule|please avoid)\s+([^.!?\n]+)/i);
  if (dislikeMatch && dislikeMatch[1]) {
    add('user_constraint', `Constraint/Dislike: ${dislikeMatch[1].trim()}`, 'preference', 'high');
  }

  // 4. Working Habits & Timing ("I usually work...", "I start my day at...", "I'm off on...", "My working hours are...")
  const habitMatch = text.match(/(?:i usually|i typically|i tend to|my work hours are|i start work at|i'm off on|i am off on)\s+([^.!?\n]+)/i);
  if (habitMatch && habitMatch[1]) {
    add('working_habit', `Working style/habit: ${habitMatch[1].trim()}`, 'workflow', 'medium');
  }

  // 5. Identity, Pronouns & Preferred Names ("Call me...", "My preferred name is...", "My role is...", "I am the...")
  const nameMatch = text.match(/(?:call me|my preferred name is|you can call me)\s+([A-Za-z0-9_-]+)/i);
  if (nameMatch && nameMatch[1]) {
    add('preferred_name', `User prefers to be called "${nameMatch[1].trim()}".`, 'preference', 'high');
  }

  const roleMatch = text.match(/(?:i am the|my role is|i work as|i lead the|i'm responsible for|i handle the)\s+([^.!?\n]+)/i);
  if (roleMatch && roleMatch[1]) {
    add('user_role_context', `User role/responsibility: ${roleMatch[1].trim()}`, 'workflow', 'high');
  }

  // 6. Colleague & Client Nuances ("Sarah is our...", "Client X prefers...", "John is handling...")
  const colleagueMatch = text.match(/(?:([A-Z][a-z]+)\s+is (?:handling|leading|the lead for|our|in charge of|responsible for)\s+[^.!?\n]+)/);
  if (colleagueMatch && colleagueMatch[0]) {
    const name = colleagueMatch[1]?.toLowerCase() || 'colleague';
    add(`team_${name}`, colleagueMatch[0].trim(), 'workflow', 'medium');
  }

  // 7. Schedule & Events ("I have a flight on...", "I'm traveling to...", "Our launch is on...", "I will be OOO...")
  const scheduleMatch = text.match(/(?:i have a flight|i'm traveling to|i am traveling to|i will be (?:out of office|ooo|away)|our launch is on|deadline is on)\s+([^.!?\n]+)/i);
  if (scheduleMatch && scheduleMatch[0]) {
    add('upcoming_event', `Upcoming schedule note: ${scheduleMatch[0].trim()}`, 'workflow', 'medium');
  }

  // 8. Personal Details ("My daughter's name is...", "My birthday is...", "I'm allergic to...")
  const personalMatch = text.match(/(?:my (?:daughter|son|wife|husband|partner|dog|cat|birthday) (?:is|'s name is)|i am allergic to|i'm allergic to)\s+([^.!?\n]+)/i);
  if (personalMatch && personalMatch[0]) {
    add('personal_detail', personalMatch[0].trim(), 'personal', 'medium');
  }

  // 9. Timezone & Location ("My timezone is...", "I'm based in...", "I live in...")
  const locationMatch = text.match(/(?:my timezone is|i'm based in|i am based in|i live in)\s+([^.!?\n]+)/i);
  if (locationMatch && locationMatch[1]) {
    add('user_location_tz', `Location/Timezone: ${locationMatch[1].trim()}`, 'preference', 'medium');
  }

  return results;
}

/**
 * Extracts and saves automatic user details and nuances across conversations into persistent memory.
 */
export async function autoExtractMemory(userId: string, userMessage: string): Promise<UserMemory | null> {
  if (!userMessage) return null;

  const extracted = extractNuancedDetails(userMessage);
  if (extracted.length === 0) return null;

  const targetId = userId || auth.currentUser?.uid || '';
  const primary = extracted[0];
  const saved = await saveUserMemory(targetId, {
    key: primary.key,
    content: primary.content,
    category: primary.category,
    importance: primary.importance,
    source: 'chat',
  });

  // Save any secondary details in background
  if (extracted.length > 1) {
    for (let i = 1; i < extracted.length; i++) {
      const sec = extracted[i];
      void saveUserMemory(targetId, {
        key: sec.key,
        content: sec.content,
        category: sec.category,
        importance: sec.importance,
        source: 'chat',
      }).catch(() => {});
    }
  }

  return saved;
}
