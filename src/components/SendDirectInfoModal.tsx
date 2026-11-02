import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { User, DocumentInfo, Task, Project } from '../types';
import { sendDirectInformation } from '../services/sharingService';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { 
  Send, 
  FileText, 
  CheckSquare, 
  FolderKanban, 
  MessageSquare, 
  MessageCircle, 
  Copy, 
  Check, 
  AlertCircle, 
  Loader2, 
  X,
  Share2,
  AtSign
} from 'lucide-react';

interface SendDirectInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: User | null;
}

type InfoType = 'document' | 'task' | 'project' | 'note';

export function SendDirectInfoModal({
  isOpen,
  onClose,
  targetUser,
}: SendDirectInfoModalProps) {
  const { profile } = useAuth();
  const [activeType, setActiveType] = useState<InfoType>('document');
  
  // Resources owned by user
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  
  const [loadingResources, setLoadingResources] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedText, setCopiedText] = useState(false);

  useEffect(() => {
    if (!isOpen || !profile) return;
    setError('');
    setSuccess('');
    setSelectedResourceId('');
    setNoteTitle('');
    setNoteContent('');
    setCustomMessage('');

    const fetchMyResources = async () => {
      setLoadingResources(true);
      try {
        const [docsSnap, tasksSnap, projSnap] = await Promise.all([
          getDocs(collection(db, 'documents')),
          getDocs(collection(db, 'tasks')),
          getDocs(collection(db, 'projects')),
        ]);

        const myDocs = docsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as DocumentInfo))
          .filter(d => !d.ownerId || d.ownerId === profile.id || profile.role === 'admin');
        setDocuments(myDocs);

        const myTasks = tasksSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Task))
          .filter(t => !t.createdBy || t.createdBy === profile.id || profile.role === 'admin');
        setTasks(myTasks);

        const myProjects = projSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Project))
          .filter(p => !p.ownerId || p.ownerId === profile.id || profile.role === 'admin');
        setProjects(myProjects);
      } catch (err: any) {
        console.warn('Error fetching resources for sharing:', err);
      } finally {
        setLoadingResources(false);
      }
    };

    fetchMyResources();
  }, [isOpen, profile]);

  if (!isOpen || !targetUser || !profile) return null;

  const targetName = targetUser.displayName || targetUser.name || `@${targetUser.username}`;

  const getPayloadDetails = () => {
    let title = '';
    let content = customMessage.trim();
    let resourceId = '';

    if (activeType === 'document') {
      const doc = documents.find(d => d.id === selectedResourceId);
      title = doc?.title || 'Document';
      resourceId = doc?.id || '';
    } else if (activeType === 'task') {
      const task = tasks.find(t => t.id === selectedResourceId);
      title = task?.title || 'Task';
      resourceId = task?.id || '';
      if (task?.description) {
        content = content ? `${content}\n\nTask Details: ${task.description}` : task.description;
      }
    } else if (activeType === 'project') {
      const proj = projects.find(p => p.id === selectedResourceId);
      title = proj?.name || 'Project';
      resourceId = proj?.id || '';
      if (proj?.description) {
        content = content ? `${content}\n\nProject Details: ${proj.description}` : proj.description;
      }
    } else {
      title = noteTitle.trim() || 'Quick Briefing Note';
      content = noteContent.trim();
    }

    return { title, content, resourceId };
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const { title, content, resourceId } = getPayloadDetails();

    if (activeType !== 'note' && !resourceId) {
      setError(`Please select a ${activeType} to send.`);
      return;
    }

    if (activeType === 'note' && !content) {
      setError('Please provide the note content to send.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await sendDirectInformation({
        senderId: profile.id,
        senderName: profile.displayName || profile.name || `@${profile.username}`,
        recipientId: targetUser.id,
        recipientName: targetName,
        type: activeType,
        title,
        content,
        resourceId: resourceId || undefined,
        permission: 'write',
      });

      setSuccess(`Successfully sent ${activeType} "${title}" to ${targetName}!`);
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      setError(err?.message || 'Failed to send information.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareToWhatsApp = () => {
    const { title, content, resourceId } = getPayloadDetails();
    const link = resourceId ? `${window.location.origin}/${activeType}s/${resourceId}` : window.location.origin;
    const text = `Hi ${targetName},\n\nHere is the *${activeType.toUpperCase()}* information from Hub-Mind:\n\n*${title}*\n${content ? `${content}\n\n` : ''}Access in Hub-Mind: ${link}\n\n— Sent by ${profile.displayName || profile.name || `@${profile.username}`}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCopySummary = () => {
    const { title, content, resourceId } = getPayloadDetails();
    const link = resourceId ? `${window.location.origin}/${activeType}s/${resourceId}` : window.location.origin;
    const summary = `*${title}* (${activeType})\n${content ? `${content}\n` : ''}Link: ${link}`;
    navigator.clipboard.writeText(summary);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-400 font-bold flex items-center justify-center border border-teal-500/20 text-sm shrink-0">
              {targetUser.photoUrl ? (
                <img src={targetUser.photoUrl} alt={targetName} className="w-full h-full rounded-2xl object-cover" />
              ) : (
                (targetName.charAt(0) || '?').toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Send Info to {targetName}
              </h2>
              <div className="text-[11px] text-teal-400 font-mono flex items-center gap-0.5">
                <AtSign className="w-3 h-3" />
                {targetUser.username || 'user'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-teal-950/50 border border-teal-800 text-teal-300 text-xs rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Type Selector Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              What would you like to send?
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => { setActiveType('document'); setSelectedResourceId(''); }}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  activeType === 'document'
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Document</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveType('task'); setSelectedResourceId(''); }}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  activeType === 'task'
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                <span>Task</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveType('project'); setSelectedResourceId(''); }}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  activeType === 'project'
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderKanban className="w-4 h-4" />
                <span>Project</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveType('note'); setSelectedResourceId(''); }}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  activeType === 'note'
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Note</span>
              </button>
            </div>
          </div>

          {/* Form controls */}
          <form onSubmit={handleSend} className="space-y-4">
            {loadingResources ? (
              <div className="py-6 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                <span>Loading your workspace items...</span>
              </div>
            ) : (
              <>
                {activeType === 'document' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Select Document
                    </label>
                    {documents.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                        No documents available. Create one in Documents first.
                      </p>
                    ) : (
                      <select
                        value={selectedResourceId}
                        onChange={(e) => setSelectedResourceId(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500/60 cursor-pointer"
                      >
                        <option value="">Choose a document...</option>
                        {documents.map(d => (
                          <option key={d.id} value={d.id}>{d.title || 'Untitled Document'}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {activeType === 'task' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Select Task
                    </label>
                    {tasks.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                        No tasks available. Create one in Tasks first.
                      </p>
                    ) : (
                      <select
                        value={selectedResourceId}
                        onChange={(e) => setSelectedResourceId(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500/60 cursor-pointer"
                      >
                        <option value="">Choose a task...</option>
                        {tasks.map(t => (
                          <option key={t.id} value={t.id}>{t.title} ({t.priority || 'medium'})</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {activeType === 'project' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Select Project
                    </label>
                    {projects.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                        No projects available. Create one in Projects first.
                      </p>
                    ) : (
                      <select
                        value={selectedResourceId}
                        onChange={(e) => setSelectedResourceId(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500/60 cursor-pointer"
                      >
                        <option value="">Choose a project...</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {activeType === 'note' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Subject / Title
                      </label>
                      <input
                        type="text"
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        placeholder="e.g. Weekly Updates, Important Notice..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Note Content
                      </label>
                      <textarea
                        rows={4}
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Type the message or information here..."
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60 resize-none"
                      />
                    </div>
                  </div>
                )}

                {activeType !== 'note' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Accompanying Note (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Add a message for your colleague..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60 resize-none"
                    />
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-2.5">
              <button
                type="submit"
                disabled={submitting || (activeType !== 'note' && !selectedResourceId) || (activeType === 'note' && !noteContent.trim())}
                className="flex-1 flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md shadow-teal-500/10 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send to {targetName}
              </button>

              <button
                type="button"
                onClick={handleShareToWhatsApp}
                className="flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-semibold py-2.5 px-4 rounded-xl text-xs transition-all border border-emerald-500/30 cursor-pointer"
                title="Send via WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleCopySummary}
                className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 px-3 rounded-xl text-xs transition-all border border-slate-700 cursor-pointer"
                title="Copy Summary"
              >
                {copiedText ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
