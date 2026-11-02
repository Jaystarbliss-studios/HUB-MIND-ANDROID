import { doc, updateDoc, getDocFromServer, getDocs, deleteDoc, collection, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface OfflineDocRecord {
  id: string;
  title: string;
  content: string;
  contentJson?: any;
  updatedAt: string;
  lastSavedAt: string;
  lastEditedAt?: string;
  lastModifiedBy?: string;
  pageSize?: 'a4' | 'letter' | 'legal';
  orientation?: 'portrait' | 'landscape';
  marginOption?: 'normal' | 'narrow' | 'moderate' | 'wide' | 'custom';
  synced: boolean;
  allowEmpty?: boolean;
  allowUntitled?: boolean;
  forceAllowEmptyOverwrite?: boolean;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  title: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorEmail?: string;
  summary?: string;
  wordCount?: number;
  isCheckpoint?: boolean;
  checkpointName?: string;
  contentJson?: any;
}

const OFFLINE_DOCS_KEY = 'hubmind_offline_documents_v1';
const SYNC_QUEUE_KEY = 'hubmind_offline_sync_queue_v1';
const LOCAL_VERSIONS_KEY = 'hubmind_local_versions_v1';
const DELETED_DOCS_KEY = 'hubmind_deleted_documents_v1';

function getDeletedDocumentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_DOCS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch { return new Set(); }
}

function setDeletedDocumentIds(ids: Set<string>) {
  try { localStorage.setItem(DELETED_DOCS_KEY, JSON.stringify(Array.from(ids))); }
  catch (e) { console.warn('[HubMind] Failed to persist deleted document tombstones:', e); }
}

function markDocumentDeleted(docId: string) {
  const ids = getDeletedDocumentIds();
  ids.add(docId);
  setDeletedDocumentIds(ids);
}

export function isDocumentDeleted(docId: string): boolean {
  return getDeletedDocumentIds().has(docId);
}

export function isContentEffectivelyEmpty(content: any, contentJson?: any): boolean {
  const jsonToCheck = contentJson || (typeof content === 'object' && content !== null ? content : null);
  if (jsonToCheck && typeof jsonToCheck === 'object' && jsonToCheck.type === 'doc') {
    if (!Array.isArray(jsonToCheck.content) || jsonToCheck.content.length === 0) return true;
    if (jsonToCheck.content.length === 1) {
      const first = jsonToCheck.content[0];
      if (first.type === 'paragraph' && (!Array.isArray(first.content) || first.content.length === 0)) return true;
    }
    return false;
  }
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) return true;
    if (trimmed === '<p></p>' || trimmed === '<p><br></p>' || trimmed === '<p><br/></p>') return true;
    const stripped = trimmed.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    return stripped.length === 0 && !/<(img|table|hr|iframe|figure)/i.test(trimmed);
  }
  return true;
}

export function extractDocumentBody(data: any): { html: string; json: any | null } {
  if (!data) return { html: '', json: null };
  let json: any = null;
  let html = '';
  if (data.contentJson && typeof data.contentJson === 'object' && data.contentJson.type === 'doc') json = data.contentJson;
  if (data.content) {
    if (typeof data.content === 'object' && data.content.type === 'doc') json = json || data.content;
    else if (typeof data.content === 'string') {
      const trimmed = data.content.trim();
      if (trimmed.startsWith('{') && trimmed.includes('"type":"doc"')) {
        try { const parsed = JSON.parse(trimmed); if (parsed?.type === 'doc') json = json || parsed; } catch {}
      }
      html = trimmed;
    }
  }
  return { html, json };
}

export function getDefaultDocs(): Record<string, OfflineDocRecord> { return {}; }

export function getLocalDocsMap(): Record<string, OfflineDocRecord> {
  try {
    const raw = localStorage.getItem(OFFLINE_DOCS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (e) {
    console.warn('[HubMind] Failed to parse offline document cache:', e);
    return {};
  }
}

export function setLocalDocsMap(map: Record<string, OfflineDocRecord>) {
  try { localStorage.setItem(OFFLINE_DOCS_KEY, JSON.stringify(map)); }
  catch (e) { console.warn('[HubMind] Failed to write offline document cache:', e); }
}

function getSyncQueue(): string[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function setSyncQueue(queue: string[]) {
  try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(Array.from(new Set(queue)))); }
  catch (e) { console.warn('[HubMind] Failed to write document sync queue:', e); }
}

function getLocalVersions(documentId: string): DocumentVersion[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_VERSIONS_KEY}_${documentId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveLocalVersion(version: DocumentVersion) {
  try {
    const list = getLocalVersions(version.documentId);
    localStorage.setItem(`${LOCAL_VERSIONS_KEY}_${version.documentId}`, JSON.stringify([version, ...list.filter(v => v.id !== version.id)].slice(0, 50)));
  } catch (e) { console.warn('[HubMind] Failed to save local document version:', e); }
}

export async function saveDocumentOffline(docId: string, data: Partial<OfflineDocRecord>, userProfile?: { name?: string; preferredName?: string; email?: string }): Promise<OfflineDocRecord> {
  if (!docId) throw new Error('Document ID is required');
  if (isDocumentDeleted(docId)) throw new Error('This document has been deleted and can no longer be saved.');

  const now = new Date().toISOString();
  const docsMap = getLocalDocsMap();
  const existing = docsMap[docId];
  let safeTitle = existing?.title || 'Untitled Document';
  if (data.title !== undefined) {
    const trimmed = data.title.trim();
    if (trimmed && (trimmed !== 'Untitled Document' || data.allowUntitled || !existing?.title || existing.title === 'Untitled Document')) safeTitle = trimmed;
  }
  let safeContent = existing?.content || '';
  let safeContentJson = existing?.contentJson;
  if (data.content !== undefined) {
    const targetEmpty = isContentEffectivelyEmpty(data.content, data.contentJson);
    const existingEmpty = existing ? isContentEffectivelyEmpty(existing.content, existing.contentJson) : true;
    if (!targetEmpty || existingEmpty || data.forceAllowEmptyOverwrite) {
      safeContent = data.content as string;
      safeContentJson = data.contentJson;
    } else {
      console.warn(`[HubMind] Blocked blank overwrite for document ${docId}; retaining existing content.`);
    }
  }

  const updatedRecord: OfflineDocRecord = {
    ...(existing || { id: docId, title: safeTitle, content: safeContent, updatedAt: now, lastSavedAt: now, synced: false }),
    ...data,
    id: docId,
    title: safeTitle,
    content: safeContent,
    ...(safeContentJson !== undefined ? { contentJson: safeContentJson } : {}),
    updatedAt: data.updatedAt || now,
    lastSavedAt: now,
    lastModifiedBy: userProfile?.preferredName || userProfile?.name || 'User',
    synced: false,
  };
  docsMap[docId] = updatedRecord;
  setLocalDocsMap(docsMap);

  if (!isContentEffectivelyEmpty(updatedRecord.content, updatedRecord.contentJson)) {
    const wordCount = typeof updatedRecord.content === 'string' ? updatedRecord.content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length : 0;
    const versionSnapshot: DocumentVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      documentId: docId,
      title: updatedRecord.title,
      content: updatedRecord.content,
      ...(updatedRecord.contentJson ? { contentJson: updatedRecord.contentJson } : {}),
      createdAt: now,
      authorName: updatedRecord.lastModifiedBy || 'User',
      authorEmail: userProfile?.email || '',
      summary: `Autosaved (${wordCount} words)`,
      wordCount,
    };
    saveLocalVersion(versionSnapshot);
    if (navigator.onLine) {
      try { await addDoc(collection(db, 'documents', docId, 'versions'), versionSnapshot); }
      catch (err) { console.warn('[HubMind] Could not write document version:', err); }
    }
  }

  if (navigator.onLine) {
    try {
      const updatePayload: Record<string, any> = { updatedAt: updatedRecord.updatedAt, lastSavedAt: now, lastModifiedBy: updatedRecord.lastModifiedBy };
      if (data.title !== undefined) updatePayload.title = safeTitle;
      if (data.content !== undefined) {
        updatePayload.content = safeContent;
        if (safeContentJson !== undefined) updatePayload.contentJson = safeContentJson;
      }
      if (data.lastEditedAt !== undefined) updatePayload.lastEditedAt = data.lastEditedAt;
      if (data.pageSize !== undefined) updatePayload.pageSize = data.pageSize;
      if (data.orientation !== undefined) updatePayload.orientation = data.orientation;
      if (data.marginOption !== undefined) updatePayload.marginOption = data.marginOption;
      await updateDoc(doc(db, 'documents', docId), updatePayload);
      updatedRecord.synced = true;
      docsMap[docId] = updatedRecord;
      setLocalDocsMap(docsMap);
      setSyncQueue(getSyncQueue().filter(id => id !== docId));
      window.dispatchEvent(new CustomEvent('hubmind:sync-status', { detail: { status: 'synced', docId, queueCount: getSyncQueue().length } }));
      return updatedRecord;
    } catch (err) {
      console.error('[HubMind] Firestore document update failed; queued locally:', err);
    }
  }

  const queue = getSyncQueue();
  if (!queue.includes(docId)) queue.push(docId);
  setSyncQueue(queue);
  window.dispatchEvent(new CustomEvent('hubmind:sync-status', { detail: { status: 'offline-queued', docId, queueCount: queue.length } }));
  return updatedRecord;
}

export async function deleteDocumentOffline(docId: string): Promise<void> {
  if (!docId) throw new Error('Document ID is required');
  if (!navigator.onLine) throw new Error('You must be online to permanently delete a document.');

  // Tombstone FIRST. Any autosave, title-save, or background sync that races
  // this operation now fails closed instead of writing stale local state back.
  markDocumentDeleted(docId);
  try {
    await deleteDoc(doc(db, 'documents', docId));
    const verify = await getDocFromServer(doc(db, 'documents', docId));
    if (verify.exists()) throw new Error('Firebase still has this document. It was not permanently deleted.');
  } catch (error) {
    // Keep the tombstone on uncertainty: a delete may have reached the server
    // even when a subsequent verification request failed.
    throw error instanceof Error ? error : new Error('Document deletion could not be confirmed.');
  }

  const docsMap = getLocalDocsMap();
  delete docsMap[docId];
  setLocalDocsMap(docsMap);
  setSyncQueue(getSyncQueue().filter(id => id !== docId));
  try { localStorage.removeItem(`${LOCAL_VERSIONS_KEY}_${docId}`); } catch {}
  window.dispatchEvent(new CustomEvent('hubmind:document-deleted', { detail: { docId } }));
}

export async function repairBlankDocumentsFromHistory(): Promise<{ repaired: number; checked: number }> {
  if (!navigator.onLine) return { repaired: 0, checked: 0 };
  const docsSnap = await getDocs(collection(db, 'documents'));
  const localDocs = getLocalDocsMap();
  let repaired = 0;
  for (const docSnap of docsSnap.docs) {
    if (isDocumentDeleted(docSnap.id)) continue;
    const data = docSnap.data() as any;
    const { html, json } = extractDocumentBody(data);
    if (!isContentEffectivelyEmpty(html, json)) continue;
    let recovery: any = null;
    try {
      const versionsSnap = await getDocs(query(collection(db, 'documents', docSnap.id, 'versions'), orderBy('createdAt', 'desc'), limit(100)));
      recovery = versionsSnap.docs.map(v => v.data() as any).find(v => !isContentEffectivelyEmpty(v.content, v.contentJson));
    } catch (err) { console.warn('[HubMind recovery] Firestore history unavailable:', err); }
    if (!recovery) recovery = getLocalVersions(docSnap.id).find(v => !isContentEffectivelyEmpty(v.content, v.contentJson));
    if (!recovery && localDocs[docSnap.id] && !isContentEffectivelyEmpty(localDocs[docSnap.id].content, localDocs[docSnap.id].contentJson)) recovery = localDocs[docSnap.id];
    if (!recovery) continue;
    const restoredContent = typeof recovery.content === 'string' ? recovery.content : '';
    const restoredJson = recovery.contentJson || (typeof recovery.content === 'object' ? recovery.content : null);
    const restoredTitle = (!data.title || data.title === 'Untitled Document') && recovery.title && recovery.title !== 'Untitled Document' ? recovery.title : (data.title || 'Untitled Document');
    try {
      const update: Record<string, any> = { content: restoredContent, lastRecoveredAt: new Date().toISOString() };
      if (restoredJson) update.contentJson = restoredJson;
      if (restoredTitle !== data.title) update.title = restoredTitle;
      await updateDoc(doc(db, 'documents', docSnap.id), update);
      localDocs[docSnap.id] = { ...(localDocs[docSnap.id] || { id: docSnap.id, updatedAt: data.updatedAt || new Date().toISOString(), lastSavedAt: data.lastSavedAt || new Date().toISOString(), synced: true }), title: restoredTitle, content: restoredContent, ...(restoredJson ? { contentJson: restoredJson } : {}), synced: true } as OfflineDocRecord;
      repaired++;
    } catch (err: any) {
      console.warn('[HubMind recovery] Document skipped or write restricted:', docSnap.id, err?.message || err);
    }
  }
  setLocalDocsMap(localDocs);
  return { repaired, checked: docsSnap.size };
}

export async function getDocumentWithOfflineFallback(docId: string): Promise<any> {
  if (isDocumentDeleted(docId)) return null;
  const localDocs = getLocalDocsMap();
  const cached = localDocs[docId];
  if (navigator.onLine) {
    try {
      const docRef = doc(db, 'documents', docId);
      const snap = await Promise.race([
        getDocFromServer(docRef),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Firestore fetch timeout')), 3500))
      ]);
      if (!snap.exists()) {
        // A confirmed server-side absence is authoritative. Purge every local
        // representation so an old offline copy can never resurrect the doc.
        markDocumentDeleted(docId);
        delete localDocs[docId];
        setLocalDocsMap(localDocs);
        setSyncQueue(getSyncQueue().filter(id => id !== docId));
        try { localStorage.removeItem(`${LOCAL_VERSIONS_KEY}_${docId}`); } catch {}
        return null;
      }

      const cloudData = snap.data();
      const { html: cloudHtml, json: cloudJson } = extractDocumentBody(cloudData);
      const { html: localHtml, json: localJson } = extractDocumentBody(cached);
      let recoveredHtml = cloudHtml;
      let recoveredJson = cloudJson;
      let recoveredTitle = cloudData.title || cached?.title || 'Untitled Document';
      let recovered = false;

      if (isContentEffectivelyEmpty(recoveredHtml, recoveredJson)) {
        try {
          const versionSnap = await getDocs(query(collection(db, 'documents', docId, 'versions'), orderBy('createdAt', 'desc'), limit(50)));
          const version = versionSnap.docs.map(v => v.data() as any).find(v => !isContentEffectivelyEmpty(v.content, v.contentJson));
          if (version) {
            recoveredHtml = typeof version.content === 'string' ? version.content : '';
            recoveredJson = version.contentJson || (typeof version.content === 'object' ? version.content : null);
            if ((!recoveredTitle || recoveredTitle === 'Untitled Document') && version.title && version.title !== 'Untitled Document') recoveredTitle = version.title;
            recovered = true;
          }
        } catch (err) { console.warn('[HubMind] Version recovery failed:', err); }
        if (isContentEffectivelyEmpty(recoveredHtml, recoveredJson)) {
          const localVersion = getLocalVersions(docId).find(v => !isContentEffectivelyEmpty(v.content, v.contentJson));
          if (localVersion) {
            recoveredHtml = typeof localVersion.content === 'string' ? localVersion.content : '';
            recoveredJson = localVersion.contentJson || (typeof localVersion.content === 'object' ? localVersion.content : null);
            if ((!recoveredTitle || recoveredTitle === 'Untitled Document') && localVersion.title && localVersion.title !== 'Untitled Document') recoveredTitle = localVersion.title;
            recovered = true;
          }
        }
        if (isContentEffectivelyEmpty(recoveredHtml, recoveredJson) && !isContentEffectivelyEmpty(localHtml, localJson)) {
          recoveredHtml = localHtml;
          recoveredJson = localJson;
          if ((!recoveredTitle || recoveredTitle === 'Untitled Document') && cached?.title) recoveredTitle = cached.title;
          recovered = true;
        }
      }

      if (cached && !cached.synced && new Date(cached.updatedAt).getTime() > new Date(cloudData.updatedAt || 0).getTime()) {
        const localEmpty = isContentEffectivelyEmpty(localHtml, localJson);
        const cloudEmpty = isContentEffectivelyEmpty(recoveredHtml, recoveredJson);
        if (!localEmpty || cloudEmpty) return { ...cloudData, ...cached, isOfflineLocal: true };
      }
      if (recovered && !isContentEffectivelyEmpty(recoveredHtml, recoveredJson)) {
        try {
          const update: Record<string, any> = { content: recoveredHtml, lastRecoveredAt: new Date().toISOString() };
          if (recoveredJson) update.contentJson = recoveredJson;
          if (recoveredTitle !== cloudData.title) update.title = recoveredTitle;
          await updateDoc(docRef, update);
          cloudData.content = recoveredHtml;
          cloudData.contentJson = recoveredJson;
          cloudData.title = recoveredTitle;
        } catch (err) { console.warn('[HubMind] Displayed recovered content but could not repair Firebase:', err); }
      }

      const syncedRecord: OfflineDocRecord = {
        id: docId,
        title: recoveredTitle,
        content: recoveredHtml,
        contentJson: recoveredJson,
        updatedAt: cloudData.updatedAt || cached?.updatedAt || new Date().toISOString(),
        lastSavedAt: cloudData.lastSavedAt || cloudData.updatedAt || new Date().toISOString(),
        lastEditedAt: cloudData.lastEditedAt || cloudData.updatedAt,
        lastModifiedBy: cloudData.lastModifiedBy || 'User',
        pageSize: cloudData.pageSize,
        orientation: cloudData.orientation,
        marginOption: cloudData.marginOption,
        synced: true,
      };
      localDocs[docId] = syncedRecord;
      setLocalDocsMap(localDocs);
      return { ...cloudData, content: recoveredHtml, contentJson: recoveredJson, title: syncedRecord.title };
    } catch (err) {
      // Do NOT fall back to a cached document while online. A stale cache is
      // exactly what caused deleted documents to appear to come back.
      console.warn('[HubMind] Firestore document fetch failed; refusing stale-cache resurrection:', err);
      throw err;
    }
  }
  return cached ? { ...cached, isOfflineLocal: true } : null;
}

export async function processOfflineSyncQueue(): Promise<{ syncedCount: number; errors: number }> {
  if (!navigator.onLine) return { syncedCount: 0, errors: 0 };
  const queue = getSyncQueue();
  if (!queue.length) return { syncedCount: 0, errors: 0 };
  const docsMap = getLocalDocsMap();
  const remaining: string[] = [];
  let syncedCount = 0;
  let errors = 0;

  for (const docId of queue) {
    if (isDocumentDeleted(docId)) {
      delete docsMap[docId];
      continue;
    }
    const record = docsMap[docId];
    if (!record) continue;
    if (isContentEffectivelyEmpty(record.content, record.contentJson) && !record.allowEmpty) continue;
    try {
      await updateDoc(doc(db, 'documents', docId), {
        title: record.title,
        content: record.content,
        ...(record.contentJson ? { contentJson: record.contentJson } : {}),
        updatedAt: record.updatedAt,
        lastEditedAt: record.lastEditedAt || record.updatedAt,
        lastSavedAt: new Date().toISOString(),
        lastModifiedBy: record.lastModifiedBy || 'User (Offline Synced)',
        ...(record.pageSize ? { pageSize: record.pageSize } : {}),
        ...(record.orientation ? { orientation: record.orientation } : {}),
        ...(record.marginOption ? { marginOption: record.marginOption } : {}),
      });
      record.synced = true;
      docsMap[docId] = record;
      syncedCount++;
    } catch (err) {
      console.error(`[HubMind] Failed to sync document ${docId}:`, err);
      remaining.push(docId);
      errors++;
    }
  }
  setLocalDocsMap(docsMap);
  setSyncQueue(remaining);
  window.dispatchEvent(new CustomEvent('hubmind:sync-status', { detail: { status: 'synced', syncedCount, queueCount: remaining.length } }));
  return { syncedCount, errors };
}

export async function fetchDocumentVersionHistory(docId: string, options: { throwOnRemoteError?: boolean } = {}): Promise<DocumentVersion[]> {
  const versionMap = new Map<string, DocumentVersion>();
  if (isDocumentDeleted(docId)) return [];
  getLocalVersions(docId).forEach(v => versionMap.set(v.id, v));
  if (navigator.onLine) {
    try {
      const snap = await getDocs(query(collection(db, 'documents', docId, 'versions'), orderBy('createdAt', 'desc'), limit(40)));
      snap.forEach(versionDoc => {
        const data = versionDoc.data() as DocumentVersion;
        versionMap.set(versionDoc.id || data.id, { ...data, id: versionDoc.id || data.id });
      });
    } catch (err) {
      console.warn('[HubMind] Could not query document versions:', err);
      if (options.throwOnRemoteError && versionMap.size === 0) {
        throw new Error(`Remote revision history could not be read${err instanceof Error ? `: ${err.message}` : '.'}`);
      }
    }
  }
  return Array.from(versionMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createNamedCheckpoint(docId: string, checkpointName: string, title: string, content: string, authorName: string, authorEmail?: string): Promise<DocumentVersion> {
  if (isDocumentDeleted(docId)) throw new Error('This document has been deleted and cannot receive checkpoints.');
  const now = new Date().toISOString();
  const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  const version: DocumentVersion = {
    id: `checkpoint_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    documentId: docId,
    title,
    content,
    createdAt: now,
    authorName,
    authorEmail,
    summary: `Checkpoint: ${checkpointName}`,
    wordCount,
    isCheckpoint: true,
    checkpointName,
  };
  saveLocalVersion(version);
  if (navigator.onLine) {
    try { await addDoc(collection(db, 'documents', docId, 'versions'), version); }
    catch (err) { console.warn('[HubMind] Failed to save named checkpoint:', err); }
  }
  return version;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void processOfflineSyncQueue(); });
  window.addEventListener('offline', () => {
    window.dispatchEvent(new CustomEvent('hubmind:sync-status', { detail: { status: 'offline', queueCount: getSyncQueue().length } }));
  });
}
