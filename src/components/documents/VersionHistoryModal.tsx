import React, { useState, useEffect } from 'react';
import { 
  History, Clock, RotateCcw, Check, User, FileText, 
  Bookmark, Plus, X, Eye, Loader2, AlertCircle 
} from 'lucide-react';
import { DocumentVersion, fetchDocumentVersionHistory, createNamedCheckpoint } from '../../lib/offlineSync';
import { formatExactTimestamp, formatTimeWithSeconds } from '../../lib/dateUtils';
import { OfficialLetterhead } from './OfficialLetterhead';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  currentContentHtml: string;
  onRestoreVersion: (contentHtml: string, versionTitle?: string) => void;
  userProfile?: { name?: string; preferredName?: string; email?: string };
}

export function VersionHistoryModal({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  currentContentHtml,
  onRestoreVersion,
  userProfile,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [checkpointNameInput, setCheckpointNameInput] = useState('');
  const [showNewCheckpointInput, setShowNewCheckpointInput] = useState(false);
  const [isSavingCheckpoint, setIsSavingCheckpoint] = useState(false);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !documentId) return;

    let isMounted = true;
    setLoading(true);
    setHistoryError(null);

    async function loadVersions() {
      try {
        const history = await fetchDocumentVersionHistory(documentId, { throwOnRemoteError: true });
        if (isMounted) {
          setVersions(history);
          if (history.length > 0) {
            setSelectedVersionId(history[0].id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load version history', err);
        if (isMounted) setHistoryError(err?.message || 'Revision history could not be loaded. Check your document permissions and connection.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadVersions();
    return () => {
      isMounted = false;
    };
  }, [isOpen, documentId]);

  if (!isOpen) return null;

  const selectedVersion = versions.find(v => v.id === selectedVersionId) || versions[0] || null;

  const handleRestore = () => {
    if (!selectedVersion) return;
    setIsRestoring(true);
    try {
      onRestoreVersion(selectedVersion.content, selectedVersion.title);
      setRestoreSuccessMessage(`Successfully restored revision from ${formatTimeWithSeconds(selectedVersion.createdAt)}`);
      setTimeout(() => {
        setRestoreSuccessMessage(null);
        onClose();
      }, 1400);
    } catch (err) {
      console.error('Failed to restore version', err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointNameInput.trim()) return;

    setIsSavingCheckpoint(true);
    try {
      const author = userProfile?.preferredName || userProfile?.name || 'User';
      const newVersion = await createNamedCheckpoint(
        documentId,
        checkpointNameInput.trim(),
        documentTitle,
        currentContentHtml,
        author,
        userProfile?.email
      );

      setVersions(prev => [newVersion, ...prev]);
      setSelectedVersionId(newVersion.id);
      setCheckpointNameInput('');
      setShowNewCheckpointInput(false);
    } catch (err) {
      console.error('Failed to create checkpoint', err);
    } finally {
      setIsSavingCheckpoint(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-6xl h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">Version History</h2>
                <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full font-mono font-medium">
                  {versions.length} revisions
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md">
                {documentTitle || 'Untitled Document'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!showNewCheckpointInput ? (
              <button
                onClick={() => setShowNewCheckpointInput(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                title="Create named snapshot of current document state"
              >
                <Bookmark className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">Name Checkpoint</span>
              </button>
            ) : null}

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Checkpoint Name Input Form */}
        {showNewCheckpointInput && (
          <form 
            onSubmit={handleCreateCheckpoint}
            className="px-6 py-3 bg-slate-950/80 border-b border-teal-500/30 flex items-center gap-3 animate-in slide-in-from-top-2 duration-150"
          >
            <Bookmark className="w-4 h-4 text-teal-400 shrink-0" />
            <input
              type="text"
              value={checkpointNameInput}
              onChange={(e) => setCheckpointNameInput(e.target.value)}
              placeholder="Enter checkpoint name (e.g., 'Initial Draft', 'Reviewed with Team', 'Final Approval')..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={isSavingCheckpoint || !checkpointNameInput.trim()}
              className="px-3 py-1.5 bg-teal-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-teal-400 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSavingCheckpoint ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Snapshot
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewCheckpointInput(false);
                setCheckpointNameInput('');
              }}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg"
            >
              Cancel
            </button>
          </form>
        )}

        {/* Success Banner */}
        {restoreSuccessMessage && (
          <div className="bg-emerald-950/90 border-b border-emerald-500/50 px-6 py-2 flex items-center gap-2 text-xs text-emerald-200 animate-in fade-in duration-150">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{restoreSuccessMessage}</span>
          </div>
        )}

        {/* Main Body: Left Timeline + Right Live Render Preview */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {/* Left Timeline Revision List */}
          <div className="w-full md:w-80 lg:w-96 flex flex-col bg-slate-950/60 shrink-0 min-h-0 overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
              <span>Saved Revisions</span>
              <span>{versions.length} Total</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
                  <span className="text-xs">Loading revisions...</span>
                </div>
              ) : historyError ? (
                <div role="alert" className="p-5 text-center text-rose-300 text-xs">
                  <AlertCircle className="w-7 h-7 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold">Could not load revision history</p>
                  <p className="mt-2 text-rose-200/80 break-words">{historyError}</p>
                  <button type="button" onClick={() => { setHistoryError(null); setLoading(true); void fetchDocumentVersionHistory(documentId, { throwOnRemoteError: true }).then(items => { setVersions(items); setLoading(false); }).catch(err => { setHistoryError(err?.message || 'Revision history could not be loaded.'); setLoading(false); }); }} className="mt-3 px-3 py-2 rounded-lg border border-rose-400/30 hover:bg-rose-500/10">Try again</button>
                </div>
              ) : versions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="font-semibold text-slate-400">No revisions yet</p>
                  <p className="mt-1 text-slate-500">No saved revisions were found on this device or in the cloud.</p>
                </div>
              ) : (
                versions.map((ver, idx) => {
                  const isSelected = ver.id === selectedVersion?.id;
                  const isLatest = idx === 0;

                  return (
                    <button
                      key={ver.id}
                      onClick={() => setSelectedVersionId(ver.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-teal-500/10 border-teal-500/50 shadow-md ring-1 ring-teal-500/20'
                          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ver.isCheckpoint ? (
                            <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          )}
                          <span className={`text-xs font-bold truncate ${isSelected ? 'text-teal-300' : 'text-slate-200'}`}>
                            {ver.checkpointName || (isLatest ? 'Current Revision' : `Revision #${versions.length - idx}`)}
                          </span>
                        </div>
                        {isLatest && (
                          <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full font-bold">
                            Latest
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>{formatTimeWithSeconds(ver.createdAt)}</span>
                        <span>{ver.wordCount !== undefined ? `${ver.wordCount} words` : ''}</span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                        <User className="w-3 h-3" />
                        <span className="truncate">{ver.authorName || 'User'}</span>
                        {ver.summary && <span className="text-slate-600">• {ver.summary}</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Selected Version Preview & Restore Pane */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950 overflow-hidden">
            {selectedVersion ? (
              <>
                {/* Revision Top Action Bar */}
                <div className="px-6 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Viewing revision:</span>
                      <strong className="text-sm font-semibold text-white truncate">
                        {selectedVersion.checkpointName || formatExactTimestamp(selectedVersion.createdAt)}
                      </strong>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Authored by {selectedVersion.authorName} • {selectedVersion.wordCount || 0} words
                    </p>
                  </div>

                  <button
                    onClick={handleRestore}
                    disabled={isRestoring}
                    className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg hover:shadow-teal-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Restore this historical version into the document editor"
                  >
                    {isRestoring ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    <span>Restore this Version</span>
                  </button>
                </div>

                {/* Live Sheet Preview */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800">
                  <div className="w-full max-w-3xl bg-white text-slate-950 p-8 sm:p-12 rounded shadow-2xl border border-slate-300 min-h-[900px]">
                    <OfficialLetterhead theme="white" />
                    <div
                      className="prose prose-slate max-w-none text-slate-900 leading-relaxed font-sans text-[11pt] pt-4 prose-headings:font-bold prose-headings:text-slate-950 prose-h1:text-2xl prose-h1:mb-3 prose-h2:text-xl prose-h2:mb-2.5 prose-h3:text-lg prose-h3:mb-2 prose-p:my-2.5 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:border-l-4 prose-blockquote:border-slate-300 prose-blockquote:pl-4 prose-blockquote:italic prose-table:border-collapse prose-th:bg-slate-100 prose-th:border prose-th:border-slate-300 prose-th:p-2 prose-td:border prose-td:border-slate-300 prose-td:p-2"
                      dangerouslySetInnerHTML={{
                        __html: selectedVersion.content || '<p class="text-slate-400 italic">Empty revision content.</p>'
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Select a revision to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
