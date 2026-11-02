import { useNavigate } from 'react-router-dom';
import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { collection, getDocs, addDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { DocumentInfo, Client } from '../types';
import { isSharedWith } from '../lib/rbac';
import { Loader2, FileText, Search, MoreVertical, Share2, ArrowUpDown } from 'lucide-react';
import { DriveUpload } from '../components/DriveUpload';
import { formatShortTimestampWithSeconds } from "../lib/dateUtils";
import { useUsers } from '../lib/useUsers';
import { TemplateSelector } from '../components/documents/TemplateSelector';
import { ShareResourceModal } from '../components/ShareResourceModal';
import { sanitizeClipboardHtml } from '../components/documents/clipboard/clipboard-sanitizer';
import { normalizeClipboardHtml } from '../components/documents/clipboard/clipboard-normalizer';
import { deleteDocumentOffline, repairBlankDocumentsFromHistory, getLocalDocsMap, setLocalDocsMap } from '../lib/offlineSync';

const LEGACY_DEMO_DOCUMENT_PREFIXES = ['doc-seed-'];

function isLegacyDemoDocumentId(id: string) {
  return LEGACY_DEMO_DOCUMENT_PREFIXES.some(prefix => id.startsWith(prefix));
}

function sortDocuments(docs: DocumentInfo[]) {
  return [...docs].sort((a, b) => {
    const aTime = new Date(a.lastEditedAt || a.lastSavedAt || a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.lastEditedAt || b.lastSavedAt || b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function localDocsForOfflineDisplay(): DocumentInfo[] {
  try {
    const localMap = getLocalDocsMap();
    const items = Object.values(localMap || {})
      .filter(doc => !isLegacyDemoDocumentId(doc.id))
      .map(doc => ({
        id: doc.id,
        title: doc.title || 'Untitled Document',
        content: doc.content || '',
        contentJson: doc.contentJson,
        updatedAt: doc.updatedAt,
        lastSavedAt: doc.lastSavedAt,
        lastEditedAt: doc.lastEditedAt,
        category: 'other',
        type: 'internal' as const,
        version: 1,
        ownerId: '',
        createdBy: '',
        createdAt: doc.updatedAt || new Date().toISOString(),
      } as DocumentInfo));
    return sortDocuments(items);
  } catch {
    return [];
  }
}

export function Documents() {
  const { profile, user } = useAuth();
  const [docsList, setDocsList] = useState<DocumentInfo[]>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? localDocsForOfflineDisplay() : []
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [projectsList, setProjectsList] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | '2weeks' | '1month' | 'older1month' | 'az' | 'za'>('newest');
  const [isUploading, setIsUploading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const { users } = useUsers();

  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [openPropertiesId, setOpenPropertiesId] = useState<string | null>(null);
  const [sharingDoc, setSharingDoc] = useState<DocumentInfo | null>(null);

  const handleUpdateTitle = async (id: string) => {
    if (!editTitle.trim()) return;
    setIsUpdating(true);
    const trimmedTitle = editTitle.trim();
    const now = new Date().toISOString();
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'documents', id), {
        title: trimmedTitle,
        updatedAt: now,
      });
      const localDocs = getLocalDocsMap();
      if (localDocs[id]) {
        localDocs[id].title = trimmedTitle;
        localDocs[id].updatedAt = now;
        setLocalDocsMap(localDocs);
      }
      setDocsList(prev => sortDocuments(prev.map(d => d.id === id ? { ...d, title: trimmedTitle, updatedAt: now } : d)));
      setEditingDocId(null);
    } catch (error) {
      console.error("Error updating document:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDuplicateDoc = async (docToDuplicate: DocumentInfo) => {
    if (!profile) return;
    try {
      const { id: _ignoredId, ...docData } = docToDuplicate as any;
      const newDocPayload = {
        ...docData,
        title: `${docData.title || 'Untitled Document'} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerId: profile.id,
        createdBy: profile.id,
      };
      const newDocRef = await addDoc(collection(db, 'documents'), newDocPayload);
      navigate('/documents/' + newDocRef.id, { state: { document: { id: newDocRef.id, ...newDocPayload } } });
    } catch (error) {
      console.error('Error duplicating doc:', error);
    }
  };

  const confirmDelete = (id: string) => { setDocToDelete(id); };

  const handleDeleteDoc = async (id: string) => {
    setDocToDelete(null);
    setDeletingId(id);
    try {
      setDeleteError(null);
      await deleteDocumentOffline(id);
      setDocsList(prev => prev.filter(d => d.id !== id));
      setOpenPropertiesId(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      setDeleteError(error instanceof Error ? error.message : 'Could not permanently delete this document.');
    } finally {
      setDeletingId(null);
    }
  };

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('other');
  const [newClientId, setNewClientId] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);

  const handleCreateDocument = async (
    title: string = 'Untitled Document',
    content: string = '',
    category: string = 'other',
    templateId?: string
  ) => {
    if (!profile) return;

    const normalizedTemplate = content
      ? normalizeClipboardHtml(sanitizeClipboardHtml(content), 'hubmind-template')
      : '';

    const initialHtml = normalizedTemplate || '<p></p>';
    const initialJson = normalizedTemplate ? null : { type: 'doc', content: [{ type: 'paragraph' }] };
    const initialTitle = title.trim() || 'Untitled Document';
    const now = new Date().toISOString();

    try {
      const newDocPayload: Record<string, any> = {
        title: initialTitle,
        type: 'internal',
        content: initialHtml,
        category: category || 'other',
        templateId: templateId || 'blank',
        ownerId: profile.id,
        createdBy: profile.id,
        createdAt: now,
        updatedAt: now,
        lastEditedAt: now,
        lastSavedAt: now,
      };
      if (initialJson) newDocPayload.contentJson = initialJson;

      const newDocRef = await addDoc(collection(db, 'documents'), newDocPayload);

      const localDocs = getLocalDocsMap();
      localDocs[newDocRef.id] = {
        id: newDocRef.id,
        title: initialTitle,
        content: initialHtml,
        ...(initialJson ? { contentJson: initialJson } : {}),
        updatedAt: now,
        lastSavedAt: now,
        lastEditedAt: now,
        lastModifiedBy: profile.preferredName || profile.displayName || profile.name || `@${profile.username}`,
        synced: true,
      };
      setLocalDocsMap(localDocs);

      setShowTemplates(false);
      navigate('/documents/' + newDocRef.id, { state: { document: { id: newDocRef.id, ...newDocPayload } } });
    } catch (error) {
      console.error('Error creating document:', error);
    }
  };

  useEffect(() => {
    if (!profile || !user) return;

    let cancelled = false;
    let unsubDocs: (() => void) | null = null;
    let unsubClients: (() => void) | null = null;
    let unsubProjects: (() => void) | null = null;

    setLoading(true);
    setDataError(null);

    const applyCloudDocuments = (snapshotDocs: any[]) => {
      let cloudDocs = snapshotDocs
        .map(d => ({ id: d.id, ...(d.data() as any) } as DocumentInfo))
        .filter(d => !isLegacyDemoDocumentId(d.id));

      cloudDocs = sortDocuments(cloudDocs);

      if (profile.role === 'staff') {
        cloudDocs = cloudDocs.filter(d =>
          !d.ownerId || d.ownerId === profile.id || d.createdBy === profile.id ||
          d.visibility === 'workspace' || (d.visibility === 'shared' && isSharedWith(d.sharedWith, profile.id))
        );
      }

      // Firestore is authoritative online. Only retain a local document that is
      // explicitly marked unsynced (a genuine offline/pending draft). Never merge
      // synced cache records back into the live list after a cloud deletion.
      const localMap = getLocalDocsMap();
      const cloudIds = new Set(cloudDocs.map(d => d.id));
      const pendingLocalDocs = Object.values(localMap)
        .filter(localDoc => !isLegacyDemoDocumentId(localDoc.id) && !localDoc.synced && !cloudIds.has(localDoc.id))
        .map(localDoc => ({
          id: localDoc.id,
          title: localDoc.title || 'Untitled Document',
          content: localDoc.content || '',
          contentJson: localDoc.contentJson,
          updatedAt: localDoc.updatedAt,
          lastSavedAt: localDoc.lastSavedAt,
          lastEditedAt: localDoc.lastEditedAt,
          category: 'other',
          type: 'internal' as const,
          version: 1,
          ownerId: profile.id,
          createdBy: profile.id,
          createdAt: localDoc.updatedAt || new Date().toISOString(),
        } as DocumentInfo));

      const nextDocs = sortDocuments([...cloudDocs, ...pendingLocalDocs]);

      // Reconcile the local cache to the authoritative cloud set, plus only
      // genuinely pending offline drafts. This permanently removes stale synced
      // records such as old demo documents and documents deleted in Firebase.
      const reconciledMap: Record<string, any> = {};
      cloudDocs.forEach(d => {
        reconciledMap[d.id] = {
          ...(localMap[d.id] || {}),
          id: d.id,
          title: d.title || 'Untitled Document',
          content: (d as any).content || '',
          contentJson: (d as any).contentJson,
          updatedAt: d.updatedAt || d.lastEditedAt || d.createdAt || new Date().toISOString(),
          lastSavedAt: d.lastSavedAt || d.updatedAt || d.createdAt || new Date().toISOString(),
          lastEditedAt: d.lastEditedAt || d.updatedAt || d.createdAt,
          synced: true,
        };
      });
      pendingLocalDocs.forEach(d => {
        const local = localMap[d.id];
        if (local) reconciledMap[d.id] = local;
      });
      setLocalDocsMap(reconciledMap);

      if (!cancelled) {
        setDocsList(nextDocs);
        setLoading(false);
      }
    };

    try {
      // Firestore evaluates security rules against every document returned by a
      // query. A staff user's old collection-wide listener therefore fails as
      // soon as it encounters a private document they cannot read. Subscribe to
      // four rule-safe slices instead and merge them locally.
      const documentQueries = profile.role === 'admin'
        ? [query(collection(db, 'documents'))]
        : [
            query(collection(db, 'documents'), where('ownerId', '==', profile.id)),
            query(collection(db, 'documents'), where('createdBy', '==', profile.id)),
            query(collection(db, 'documents'), where('visibility', '==', 'workspace')),
            query(
              collection(db, 'documents'),
              where('visibility', '==', 'shared'),
              where('sharedWith', 'array-contains', profile.id),
            ),
          ];

      const querySnapshots = new Map<number, any[]>();
      const refreshMergedDocuments = () => {
        const uniqueDocs = new Map<string, any>();
        querySnapshots.forEach(docs => {
          docs.forEach(snapshotDoc => uniqueDocs.set(snapshotDoc.id, snapshotDoc));
        });
        applyCloudDocuments(Array.from(uniqueDocs.values()));
      };

      const unsubs = documentQueries.map((documentQuery, index) =>
        onSnapshot(
          documentQuery,
          snapshot => {
            querySnapshots.set(index, snapshot.docs);
            refreshMergedDocuments();
          },
          error => {
            console.error('[HubMind] Documents query failed:', error);
            if (cancelled) return;
            setDataError(error instanceof Error ? error.message : 'Could not load documents from Firebase.');
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              setDocsList(localDocsForOfflineDisplay());
            }
            setLoading(false);
          },
        ),
      );

      unsubDocs = () => unsubs.forEach(unsub => unsub());
    } catch (error) {
      console.error('[HubMind] Failed to subscribe to documents:', error);
      setDataError(error instanceof Error ? error.message : 'Could not connect to Firebase.');
      setLoading(false);
    }

    unsubClients = onSnapshot(collection(db, 'clients'), snapshot => {
      if (!cancelled) setClients(snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Client)).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }, error => console.warn('[HubMind] Clients listener failed:', error));

    unsubProjects = onSnapshot(collection(db, 'projects'), snapshot => {
      if (!cancelled) setProjectsList(snapshot.docs.map(d => ({ id: d.id, name: String((d.data() as any).name || 'Untitled Project') })).sort((a, b) => a.name.localeCompare(b.name)));
    }, error => console.warn('[HubMind] Projects listener failed:', error));

    return () => {
      cancelled = true;
      unsubDocs?.();
      unsubClients?.();
      unsubProjects?.();
    };
  }, [user, profile]);

  const fetchData = async () => {
    try {
      const documentQueries = profile?.role === 'admin'
        ? [query(collection(db, 'documents'))]
        : profile
          ? [
              query(collection(db, 'documents'), where('ownerId', '==', profile.id)),
              query(collection(db, 'documents'), where('createdBy', '==', profile.id)),
              query(collection(db, 'documents'), where('visibility', '==', 'workspace')),
              query(
                collection(db, 'documents'),
                where('visibility', '==', 'shared'),
                where('sharedWith', 'array-contains', profile.id),
              ),
            ]
          : [];

      const [docSnapshots, clientsSnap] = await Promise.all([
        Promise.all(documentQueries.map(documentQuery => getDocs(documentQuery))),
        getDocs(collection(db, 'clients')),
      ]);
      const uniqueDocs = new Map<string, DocumentInfo>();
      docSnapshots.forEach(snap => {
        snap.docs.forEach(documentSnap => {
          uniqueDocs.set(documentSnap.id, { id: documentSnap.id, ...(documentSnap.data() as any) } as DocumentInfo);
        });
      });
      const docsData = Array.from(uniqueDocs.values()).filter(d => !isLegacyDemoDocumentId(d.id));
      const clientsData = clientsSnap.docs.map(documentSnap => ({ id: documentSnap.id, ...(documentSnap.data() as any) } as Client));
      setDocsList(sortDocuments(docsData));
      setClients(clientsData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setLoading(false);
    } catch (error) {
      console.error("Error fetching documents:", error);
      if (typeof navigator !== 'undefined' && !navigator.onLine) setDocsList(localDocsForOfflineDisplay());
      setLoading(false);
    }
  };

  const handleUploadSuccess = async (webViewLink: string, fileId: string) => {
    if (!user || !profile) return;
    setIsUploading(true);
    try {
      await addDoc(collection(db, 'documents'), {
        title: newTitle || 'Untitled Document',
        category: newCategory,
        clientId: newClientId || null,
        projectId: newProjectId || null,
        fileRef: webViewLink,
        fileId,
        version: 1,
        createdBy: profile.id,
        ownerId: profile.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setShowUploadForm(false);
      setNewTitle('');
      setNewClientId('');
      setNewProjectId('');
    } catch (error) {
      console.error("Error saving document record:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const openDocument = (doc: DocumentInfo) => {
    const isEditorDocument =
      doc.type === 'internal' ||
      !!(doc as any).content ||
      !!(doc as any).contentJson ||
      !!(doc as any).templateId;

    if (isEditorDocument || !(doc as any).fileRef) {
      navigate('/documents/' + doc.id, { state: { document: doc } });
      return;
    }

    window.open((doc as any).fileRef, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void repairBlankDocumentsFromHistory()
        .then(result => {
          if (!cancelled && result.repaired > 0) {
            console.info('[HubMind] Repaired blank documents:', result.repaired, 'of', result.checked);
            fetchData();
          }
        })
        .catch(error => console.warn('[HubMind] Document recovery pass failed:', error));
    }, 3500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile?.id, profile?.role]);

  const filteredDocs = useMemo(() => {
    const now = Date.now();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

    let list = docsList.filter(d => (d.title || '').toLowerCase().includes(search.toLowerCase()));

    // Apply time-range filtering if selected
    if (sortBy === '2weeks') {
      list = list.filter(d => {
        const time = new Date(d.lastEditedAt || d.lastSavedAt || d.updatedAt || d.createdAt || 0).getTime();
        return now - time <= twoWeeksMs;
      });
    } else if (sortBy === '1month') {
      list = list.filter(d => {
        const time = new Date(d.lastEditedAt || d.lastSavedAt || d.updatedAt || d.createdAt || 0).getTime();
        return now - time <= oneMonthMs;
      });
    } else if (sortBy === 'older1month') {
      list = list.filter(d => {
        const time = new Date(d.lastEditedAt || d.lastSavedAt || d.updatedAt || d.createdAt || 0).getTime();
        return now - time > oneMonthMs;
      });
    }

    // Keep the user's selected ordering within each section. Admins see their
    // own documents first, followed by documents created by other workspace users.
    const sorted = [...list].sort((a, b) => {
      const aTime = new Date(a.lastEditedAt || a.lastSavedAt || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastEditedAt || b.lastSavedAt || b.updatedAt || b.createdAt || 0).getTime();
      if (sortBy === 'oldest') return aTime - bTime;
      if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'za') return (b.title || '').localeCompare(a.title || '');
      return bTime - aTime;
    });
    if (profile?.role === 'admin') {
      sorted.sort((a, b) => {
        const aOwn = a.createdBy === profile.id || a.ownerId === profile.id;
        const bOwn = b.createdBy === profile.id || b.ownerId === profile.id;
        return Number(bOwn) - Number(aOwn);
      });
    }
    return sorted;
  }, [docsList, search, sortBy, profile?.id, profile?.role]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 flex flex-col h-full min-h-0 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Documents</h1>
          <p className="text-xs sm:text-sm text-slate-400">Company files, templates, and official records</p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto">
          {profile && (
            <>
              <button onClick={() => setShowTemplates(true)} className="flex-1 sm:flex-none h-10 px-4 py-2 bg-accent hover:bg-accent-hover text-slate-950 font-bold rounded-lg text-sm transition-all duration-150 flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] shrink-0">
                <FileText className="w-4 h-4" /><span>Create Document</span>
              </button>
              <button onClick={() => setShowUploadForm(!showUploadForm)} className="flex-1 sm:flex-none h-10 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium rounded-lg text-sm transition-all duration-150 flex items-center justify-center gap-2 border border-slate-700 active:scale-[0.98] shrink-0">
                {showUploadForm ? 'Cancel Upload' : 'Upload File'}
              </button>
            </>
          )}
        </div>
      </div>

      {dataError && (
        <div className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
          Firebase documents could not be refreshed. Hub-Mind is not substituting demo data. {dataError}
        </div>
      )}

      {showUploadForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 shrink-0">
          <h2 className="font-semibold text-lg text-white">Upload New Document</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Q3 Report" className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-4 text-sm text-slate-200 focus:outline-none focus:border-accent transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3.5 text-sm text-slate-200 focus:outline-none focus:border-accent transition-colors cursor-pointer">
                <option value="contract">Contract</option><option value="report">Report</option><option value="invoice">Invoice</option><option value="exam">Exam</option><option value="certificate">Certificate</option><option value="other">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Link to Project (Optional)</label>
              <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3.5 text-sm text-slate-200 focus:outline-none focus:border-accent transition-colors cursor-pointer">
                <option value="">None</option>{projectsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Link to Client (Optional)</label>
              <select value={newClientId} onChange={(e) => setNewClientId(e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3.5 text-sm text-slate-200 focus:outline-none focus:border-accent transition-colors cursor-pointer">
                <option value="">-- No Client --</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="pt-6 mt-2 border-t border-slate-800">
            <DriveUpload onUploadSuccess={handleUploadSuccess} />
            {isUploading && <p className="text-sm text-accent mt-2 animate-pulse font-medium">Saving document record...</p>}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" placeholder="Search documents by title..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-10 bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center">
            <ArrowUpDown className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-10 pl-9 pr-8 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-200 hover:text-white focus:outline-none focus:border-accent transition-colors cursor-pointer appearance-none"
              aria-label="Sort and filter documents"
            >
              <option value="newest">Newest / Latest</option>
              <option value="oldest">Oldest first</option>
              <option value="2weeks">Within last 2 weeks</option>
              <option value="1month">Within last month</option>
              <option value="older1month">Older than 1 month</option>
              <option value="az">Alphabetical (A - Z)</option>
              <option value="za">Alphabetical (Z - A)</option>
            </select>
          </div>
          {sortBy !== 'newest' && (
            <button
              onClick={() => setSortBy('newest')}
              className="h-10 px-3 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Reset sort"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {showTemplates && <TemplateSelector onSelect={handleCreateDocument} onClose={() => setShowTemplates(false)} />}
      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="divide-y divide-slate-800 border-y border-slate-800/70">
            {filteredDocs.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No documents found.</div>
            ) : (
              filteredDocs.map((doc, index) => {
                const client = clients.find(c => c.id === doc.clientId);
                const createdByAdmin = profile?.role === 'admin' && (doc.createdBy === profile.id || doc.ownerId === profile.id);
                const previousDoc = filteredDocs[index - 1];
                const previousCreatedByAdmin = previousDoc && (previousDoc.createdBy === profile?.id || previousDoc.ownerId === profile?.id);
                const showAdminGroupHeading = profile?.role === 'admin' && (index === 0 || createdByAdmin !== previousCreatedByAdmin);
                const canManage = profile?.role === 'admin' || doc.ownerId === profile?.id || doc.createdBy === profile?.id;
                return (
                  <React.Fragment key={doc.id}>
                  {showAdminGroupHeading && <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">{createdByAdmin ? 'Documents created by admin' : 'Documents created by workspace users'}</div>}
                  <div className="group relative p-3 sm:p-4 hover:bg-slate-800/30 transition-colors" onContextMenu={(e) => { e.preventDefault(); setOpenPropertiesId(doc.id); }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <button onClick={() => openDocument(doc)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                        <div className="w-11 h-12 sm:w-12 sm:h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-accent shrink-0 shadow-sm"><FileText className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-slate-100 truncate">{doc.title || 'Untitled Document'}</h3>
                          <p className="text-xs text-slate-500 truncate mt-1">{doc.category || 'Document'}{client ? ' • ' + client.name : ''}</p>
                          <p className="text-[11px] text-slate-500 mt-1">Edited {formatShortTimestampWithSeconds(doc.lastEditedAt || doc.updatedAt || doc.createdAt)}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openDocument(doc)} className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-slate-950 text-xs font-bold hover:bg-accent-hover transition-colors">{(doc.type === 'internal' || !!(doc as any).content || !!(doc as any).contentJson || !!(doc as any).templateId || !(doc as any).fileRef) ? 'Open' : 'View'}</button>
                        <button onClick={() => setOpenPropertiesId(openPropertiesId === doc.id ? null : doc.id)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" aria-label="Document options"><MoreVertical className="w-5 h-5" /></button>
                      </div>
                    </div>
                    {openPropertiesId === doc.id && (
                      <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 shadow-xl">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] mb-3">
                          <div><span className="text-slate-500 block">Created</span><span className="text-slate-200">{formatShortTimestampWithSeconds(doc.createdAt)}</span></div>
                          <div><span className="text-slate-500 block">Edited</span><span className="text-slate-200">{formatShortTimestampWithSeconds(doc.lastEditedAt || doc.updatedAt || doc.createdAt)}</span></div>
                          <div><span className="text-slate-500 block">Saved</span><span className="text-slate-200">{formatShortTimestampWithSeconds(doc.lastSavedAt || doc.updatedAt || doc.createdAt)}</span></div>
                          <div><span className="text-slate-500 block">Owner</span><span className="text-slate-200 truncate">{doc.ownerId && users[doc.ownerId] ? users[doc.ownerId].name : 'Workspace'}</span></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => { setOpenPropertiesId(null); openDocument(doc); }} className="px-3 py-2 rounded-lg bg-accent text-slate-950 text-xs font-bold cursor-pointer">Open</button>
                          <button onClick={() => { setOpenPropertiesId(null); setSharingDoc(doc); }} className="px-3 py-2 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-teal-500/30">
                            <Share2 className="w-3.5 h-3.5" />
                            Share with Friends
                          </button>
                          {canManage && <><button onClick={() => { setOpenPropertiesId(null); setEditingDocId(doc.id); setEditTitle(doc.title); }} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs cursor-pointer">Rename</button><button onClick={() => handleDuplicateDoc(doc)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs cursor-pointer">Duplicate</button><button onClick={() => { setOpenPropertiesId(null); confirmDelete(doc.id); }} className="px-3 py-2 rounded-lg bg-rose-950/40 text-rose-300 text-xs cursor-pointer">Delete</button></>}
                        </div>
                      </div>
                    )}
                  </div>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      )}

      {editingDocId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4">Rename Document</h3>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditingDocId(null)} className="px-4 py-2 text-sm text-slate-300">Cancel</button>
              <button onClick={() => handleUpdateTitle(editingDocId)} disabled={isUpdating} className="px-4 py-2 bg-accent text-slate-950 rounded-lg text-sm font-bold">{isUpdating ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {docToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-2">Delete Document</h3>
            <p className="text-sm text-slate-300 mb-2">Are you sure you want to permanently delete this document from Hub-Mind and Firebase? This action cannot be undone.</p>
            {deleteError && <p className="text-xs text-rose-300 mb-4">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setDocToDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-300">Cancel</button>
              <button onClick={() => handleDeleteDoc(docToDelete)} disabled={!!deletingId} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">{deletingId ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
      {sharingDoc && (
        <ShareResourceModal
          isOpen={!!sharingDoc}
          onClose={() => setSharingDoc(null)}
          resourceType="document"
          resourceId={sharingDoc.id}
          resourceTitle={sharingDoc.title || 'Untitled Document'}
        />
      )}
    </div>
  );
}
