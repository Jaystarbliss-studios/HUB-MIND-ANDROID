import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User, UserStatus } from '../types';

export const ADMIN_EMAILS = ['johnrufai242@gmail.com', 'rufaijohnny@gmail.com'];
export const ADMIN_EMAIL = 'johnrufai242@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((admin) => admin.toLowerCase() === clean);
}

/**
 * Normalizes username to strictly lowercase alphanumeric + underscore (3-30 chars)
 */
export function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
}

/**
 * Extracts the first name / handle from a Gmail address or Google Account display name.
 * E.g., 'johnrufai242@gmail.com' -> 'john'
 * E.g., 'jane.doe@gmail.com' -> 'jane'
 * E.g., 'alex_turner@gmail.com' -> 'alex'
 */
export function extractHandleFromEmail(email: string, displayName?: string): string {
  if (!email) {
    if (displayName) {
      const firstWord = displayName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (firstWord.length >= 2) return firstWord.slice(0, 20);
    }
    return 'user';
  }

  const localPart = email.split('@')[0].toLowerCase();
  
  // 1. Look for leading alphabetic first name before numbers, dots, dashes, or underscores
  // e.g. "johnrufai242" -> "john", "jane.doe" -> "jane", "alex_smith" -> "alex"
  const alphaMatch = localPart.match(/^([a-z]+)/);
  if (alphaMatch && alphaMatch[1]) {
    const rawAlpha = alphaMatch[1];
    // Common first name lengths: if 3 or more chars, use it
    if (rawAlpha.length >= 3) {
      // If the word has common combined names or is decent length, take reasonable handle
      return rawAlpha.slice(0, 20);
    }
  }

  // 2. If displayName is provided, extract first word
  if (displayName) {
    const firstWord = displayName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (firstWord.length >= 3) {
      return firstWord.slice(0, 20);
    }
  }

  // 3. Fallback: clean the entire local part
  const cleaned = localPart.replace(/[^a-z0-9_]/g, '').slice(0, 20);
  return cleaned.length >= 3 ? cleaned : 'user';
}

/**
 * Generates an available unique username starting from a base handle
 */
export async function generateAvailableUsername(baseHandle: string, excludeUserId?: string): Promise<string> {
  const cleanBase = normalizeUsername(baseHandle) || 'user';
  let candidate = cleanBase.length >= 3 ? cleanBase : `${cleanBase}123`;
  
  const isFree = await isUsernameAvailable(candidate, excludeUserId);
  if (isFree) return candidate;

  let counter = 1;
  while (counter <= 100) {
    const testCandidate = `${cleanBase}${counter}`;
    const testFree = await isUsernameAvailable(testCandidate, excludeUserId);
    if (testFree) return testCandidate;
    counter++;
  }

  return `${cleanBase}_${Math.floor(Math.random() * 8999 + 1000)}`;
}

export async function getUserProfile(userId: string): Promise<User | null> {
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as User;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  try {
    const q = query(collection(db, 'users'), where('username', '==', normalized), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as User;
    }
    return null;
  } catch (error) {
    console.error('Error finding user by username:', error);
    return null;
  }
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) return false;
  const existing = await getUserByUsername(normalized);
  if (!existing) return true;
  return excludeUserId ? existing.id === excludeUserId : false;
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export function subscribeToUsers(callback: (users: User[]) => void): () => void {
  const q = collection(db, 'users');
  return onSnapshot(q, (snap) => {
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
    users.sort((a, b) => {
      const nameA = a.displayName || a.name || a.username || '';
      const nameB = b.displayName || b.name || b.username || '';
      return nameA.localeCompare(nameB);
    });
    callback(users);
  }, (err) => {
    console.warn('Subscribe to users error:', err);
  });
}

export async function updateUserStatus(userId: string, status: UserStatus): Promise<void> {
  const docRef = doc(db, 'users', userId);
  await updateDoc(docRef, { status, updatedAt: new Date().toISOString() });
}

export async function updateUserProfile(
  userId: string, 
  data: Partial<Pick<User, 'displayName' | 'preferredName' | 'phone' | 'photoUrl' | 'defaultVisibility' | 'username'>>
): Promise<void> {
  const docRef = doc(db, 'users', userId);
  const cleanData: Record<string, any> = { updatedAt: new Date().toISOString() };
  
  if (data.displayName !== undefined) cleanData.displayName = data.displayName.trim();
  if (data.preferredName !== undefined) cleanData.preferredName = data.preferredName.trim();
  if (data.phone !== undefined) cleanData.phone = data.phone.trim();
  if (data.photoUrl !== undefined) cleanData.photoUrl = data.photoUrl;
  if (data.defaultVisibility !== undefined) cleanData.defaultVisibility = data.defaultVisibility;
  if (data.username !== undefined) {
    const normalized = normalizeUsername(data.username);
    if (normalized.length >= 3) {
      const available = await isUsernameAvailable(normalized, userId);
      if (!available) throw new Error(`@${normalized} is already taken.`);
      cleanData.username = normalized;
    }
  }

  await updateDoc(docRef, cleanData);
}
