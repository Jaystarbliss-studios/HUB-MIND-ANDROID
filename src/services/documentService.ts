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
import { DocumentInfo, DocumentVersion, ResourceVisibility, User } from '../types';
import { logActivity } from './activityService';

export async function createDocument(params: {
  title: string;
  category?: string;
  type?: 'internal' | 'external';
  projectId?: string;
  clientId?: string;
  content?: string;
  templateId?: string;
  currentUser: User;
  visibility?: ResourceVisibility;
}): Promise<DocumentInfo> {
  const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const docData: DocumentInfo = {
    id,
    title: params.title.trim() || 'Untitled Document',
    category: params.category || 'General',
    type: params.type || 'internal',
    projectId: params.projectId || undefined,
    clientId: params.clientId || undefined,
    templateId: params.templateId || undefined,
    content: params.content || '<p></p>',
    ownerId: params.currentUser.id,
    createdBy: params.currentUser.id,
    updatedBy: params.currentUser.id,
    lastModifiedBy: params.currentUser.preferredName || params.currentUser.displayName || `@${params.currentUser.username}`,
    lastSavedAt: now,
    lastEditedAt: now,
    visibility: params.visibility || params.currentUser.defaultVisibility || 'workspace',
    sharedWith: [],
    permissions: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    pageSize: 'a4',
    orientation: 'portrait',
    marginOption: 'normal',
  };

  await setDoc(doc(db, 'documents', id), docData);

  // Save initial version snapshot
  await saveDocumentVersionSnapshot(id, 1, docData.title, docData.content || '', params.currentUser, 'Initial draft created');

  await logActivity({
    entityId: id,
    entityType: 'document',
    action: 'created',
    userId: params.currentUser.id,
    username: params.currentUser.username,
    userDisplayName: params.currentUser.displayName,
    details: `Created document "${docData.title}"`,
  });

  return docData;
}

export async function saveDocumentVersionSnapshot(
  documentId: string,
  versionNumber: number,
  title: string,
  content: string,
  user: User,
  changeSummary?: string
): Promise<void> {
  const versionId = `v_${versionNumber}_${Date.now()}`;
  const versionData: DocumentVersion = {
    id: versionId,
    documentId,
    versionNumber,
    title,
    content,
    savedBy: user.id,
    savedByUsername: user.username,
    savedAt: new Date().toISOString(),
    changeSummary: changeSummary || `Version ${versionNumber}`,
  };

  await setDoc(doc(db, 'documents', documentId, 'versions', versionId), versionData);
}

export async function getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  try {
    const q = query(
      collection(db, 'documents', documentId, 'versions'),
      orderBy('versionNumber', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentVersion));
  } catch (err) {
    console.warn('Get document versions error:', err);
    return [];
  }
}

export async function updateDocumentContent(params: {
  documentId: string;
  title?: string;
  content: string;
  currentUser: User;
  createSnapshot?: boolean;
  changeSummary?: string;
  pageSize?: DocumentInfo['pageSize'];
  orientation?: DocumentInfo['orientation'];
  marginOption?: DocumentInfo['marginOption'];
  projectId?: string;
}): Promise<void> {
  const docRef = doc(db, 'documents', params.documentId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Document does not exist.');

  const existing = snap.data() as DocumentInfo;
  const newVersion = (existing.version || 1) + 1;
  const now = new Date().toISOString();

  const updatePayload: Partial<DocumentInfo> = {
    content: params.content,
    updatedAt: now,
    lastSavedAt: now,
    lastEditedAt: now,
    updatedBy: params.currentUser.id,
    lastModifiedBy: params.currentUser.preferredName || params.currentUser.displayName || `@${params.currentUser.username}`,
  };

  if (params.title !== undefined) updatePayload.title = params.title.trim();
  if (params.pageSize !== undefined) updatePayload.pageSize = params.pageSize;
  if (params.orientation !== undefined) updatePayload.orientation = params.orientation;
  if (params.marginOption !== undefined) updatePayload.marginOption = params.marginOption;
  if (params.projectId !== undefined) updatePayload.projectId = params.projectId;

  if (params.createSnapshot) {
    updatePayload.version = newVersion;
    await saveDocumentVersionSnapshot(
      params.documentId,
      newVersion,
      params.title || existing.title,
      params.content,
      params.currentUser,
      params.changeSummary
    );
  }

  await updateDoc(docRef, updatePayload);
}

export async function deleteDocument(documentId: string, currentUser: User): Promise<void> {
  const docRef = doc(db, 'documents', documentId);
  const snap = await getDoc(docRef);
  const title = snap.exists() ? snap.data().title : 'Document';

  await deleteDoc(docRef);

  await logActivity({
    entityId: documentId,
    entityType: 'document',
    action: 'deleted',
    userId: currentUser.id,
    username: currentUser.username,
    userDisplayName: currentUser.displayName,
    details: `Deleted document "${title}"`,
  });
}

export async function getDocumentById(documentId: string): Promise<DocumentInfo | null> {
  const snap = await getDoc(doc(db, 'documents', documentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DocumentInfo;
}

export function subscribeToDocument(
  documentId: string, 
  callback: (doc: DocumentInfo | null) => void
): () => void {
  return onSnapshot(doc(db, 'documents', documentId), (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback({ id: snap.id, ...snap.data() } as DocumentInfo);
    }
  }, (err) => {
    console.warn('Document subscription error:', err);
  });
}

export function subscribeToDocuments(
  currentUser: User,
  callback: (docs: DocumentInfo[]) => void,
  projectId?: string
): () => void {
  const documentQueries = currentUser.role === 'admin'
    ? [query(collection(db, 'documents'), orderBy('updatedAt', 'desc'))]
    : [
        query(collection(db, 'documents'), where('ownerId', '==', currentUser.id)),
        query(collection(db, 'documents'), where('createdBy', '==', currentUser.id)),
        query(collection(db, 'documents'), where('visibility', '==', 'workspace')),
        query(
          collection(db, 'documents'),
          where('visibility', '==', 'shared'),
          where('sharedWith', 'array-contains', currentUser.id),
        ),
      ];

  const querySnapshots = new Map<number, any[]>();
  const refresh = () => {
    const uniqueDocs = new Map<string, DocumentInfo>();
    querySnapshots.forEach(snapshotDocs => {
      snapshotDocs.forEach(d => uniqueDocs.set(d.id, { id: d.id, ...d.data() } as DocumentInfo));
    });

    let docs = Array.from(uniqueDocs.values()).filter(d => !d.id.startsWith('doc-seed-'));
    if (projectId) docs = docs.filter(d => d.projectId === projectId);
    docs.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    callback(docs);
  };

  const unsubs = documentQueries.map((documentQuery, index) =>
    onSnapshot(documentQuery, snap => {
      querySnapshots.set(index, snap.docs);
      refresh();
    }, err => console.warn('Documents subscription warning:', err))
  );

  return () => unsubs.forEach(unsub => unsub());
}
