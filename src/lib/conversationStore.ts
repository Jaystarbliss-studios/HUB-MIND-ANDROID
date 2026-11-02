import { doc, getDocs, setDoc, collection, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChatMessage, StoredConversation } from '../types';

const LOCAL_STORAGE_KEY_PREFIX = 'hubmind_conv_';

export function getActiveBranchMessages(
  messages: ChatMessage[],
  activeLeafId?: string | null
): ChatMessage[] {
  if (!messages || messages.length === 0) return [];
  const hasTreeLinks = messages.some((m) => m.parentMessageId !== undefined);
  if (!hasTreeLinks) return messages;

  const msgMap = new Map<string, ChatMessage>();
  messages.forEach((m) => msgMap.set(m.id, m));
  let currentId: string | null = activeLeafId || null;
  if (!currentId || !msgMap.has(currentId)) currentId = messages[messages.length - 1]?.id || null;

  const path: ChatMessage[] = [];
  const visited = new Set<string>();
  while (currentId && msgMap.has(currentId) && !visited.has(currentId)) {
    visited.add(currentId);
    const msg = msgMap.get(currentId)!;
    path.unshift(msg);
    currentId = msg.parentMessageId || null;
  }
  return path;
}

export function getSiblingsInfo(
  allMessages: ChatMessage[],
  messageId: string
): { siblings: ChatMessage[]; currentIndex: number; total: number } {
  const currentMsg = allMessages.find((m) => m.id === messageId);
  if (!currentMsg) return { siblings: [], currentIndex: 0, total: 1 };
  const parentId = currentMsg.parentMessageId || null;
  const siblings = allMessages.filter((m) => (m.parentMessageId || null) === parentId && m.sender === currentMsg.sender);
  const currentIndex = siblings.findIndex((m) => m.id === messageId);
  return { siblings, currentIndex: currentIndex >= 0 ? currentIndex : 0, total: Math.max(siblings.length, 1) };
}

export async function saveConversationToFirestore(
  userId: string,
  conversation: StoredConversation
): Promise<void> {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}_${conversation.id}`, JSON.stringify(conversation));
  } catch {}

  if (!userId) return;
  try {
    const convRef = doc(db, 'users', userId, 'conversations', conversation.id);
    await setDoc(convRef, { ...conversation, userId, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('Error saving conversation to Firestore; local copy retained:', err);
  }
}

export async function loadUserConversations(userId: string): Promise<StoredConversation[]> {
  if (!userId) return [];

  try {
    const convCollection = collection(db, 'users', userId, 'conversations');
    const q = query(convCollection, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    // Online UI is cloud-authoritative. Local storage is intentionally not merged
    // here because doing so resurrects conversations deleted from Firestore.
    return snapshot.docs
      .map((docSnap) => docSnap.data() as StoredConversation)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (err) {
    console.warn('Could not load Firestore conversations:', err);
    if (typeof navigator === 'undefined' || navigator.onLine) return [];

    const conversations: StoredConversation[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(`${LOCAL_STORAGE_KEY_PREFIX}${userId}_`)) continue;
        const item = localStorage.getItem(key);
        if (item) conversations.push(JSON.parse(item) as StoredConversation);
      }
    } catch {}
    return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}

export async function deleteUserConversation(userId: string, conversationId: string): Promise<void> {
  try { localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${userId}_${conversationId}`); } catch {}
  if (!userId) return;
  try {
    await deleteDoc(doc(db, 'users', userId, 'conversations', conversationId));
  } catch (err) {
    console.warn('Error deleting conversation from Firestore:', err);
    throw err;
  }
}
