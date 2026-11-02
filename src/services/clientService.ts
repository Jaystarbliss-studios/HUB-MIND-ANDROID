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
import { Client, User, ResourceVisibility } from '../types';
import { logActivity } from './activityService';
import { isSharedWith } from '../lib/rbac';

export async function createClient(params: {
  name: string;
  type: Client['type'];
  phone?: string;
  email?: string;
  address?: string;
  projectId?: string;
  notes?: string;
  currentUser: User;
  visibility?: ResourceVisibility;
}): Promise<Client> {
  const id = `cli_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const client: Client = {
    id,
    name: params.name.trim(),
    type: params.type || 'parent',
    phone: params.phone?.trim() || undefined,
    email: params.email?.trim() || undefined,
    address: params.address?.trim() || undefined,
    status: 'active',
    projectId: params.projectId || undefined,
    notes: params.notes?.trim() || undefined,
    ownerId: params.currentUser.id,
    createdBy: params.currentUser.id,
    visibility: params.visibility || params.currentUser.defaultVisibility || 'workspace',
    sharedWith: [],
    permissions: {},
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'clients', id), client);

  await logActivity({
    entityId: id,
    entityType: 'client',
    action: 'created',
    userId: params.currentUser.id,
    username: params.currentUser.username,
    userDisplayName: params.currentUser.displayName,
    details: `Added client "${client.name}" (${client.type})`,
  });

  return client;
}

export async function updateClient(
  clientId: string,
  data: Partial<Client>,
  currentUser: User
): Promise<void> {
  const docRef = doc(db, 'clients', clientId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteClient(clientId: string, currentUser: User): Promise<void> {
  const docRef = doc(db, 'clients', clientId);
  const snap = await getDoc(docRef);
  const name = snap.exists() ? snap.data().name : 'Client';

  await deleteDoc(docRef);

  await logActivity({
    entityId: clientId,
    entityType: 'client',
    action: 'deleted',
    userId: currentUser.id,
    username: currentUser.username,
    userDisplayName: currentUser.displayName,
    details: `Deleted client "${name}"`,
  });
}

export function subscribeToClients(
  currentUser: User,
  callback: (clients: Client[]) => void,
  projectId?: string
): () => void {
  const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snap) => {
    let clients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));

    if (currentUser.role !== 'admin') {
      clients = clients.filter(c => {
        if (c.ownerId === currentUser.id || c.createdBy === currentUser.id) return true;
        if (c.visibility === 'workspace') return true;
        if (c.visibility === 'shared' && isSharedWith(c.sharedWith, currentUser.id)) return true;
        return false;
      });
    }

    if (projectId) {
      clients = clients.filter(c => c.projectId === projectId);
    }

    callback(clients);
  }, (err) => {
    console.warn('Clients subscription warning:', err);
  });
}
