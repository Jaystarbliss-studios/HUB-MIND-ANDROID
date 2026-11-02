import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { Project, Task, Meeting, DocumentInfo, ActivityLog, Client } from '../types';
import { 
  Loader2, 
  ArrowLeft, 
  Folder, 
  CheckSquare, 
  Calendar, 
  FileText, 
  Activity, 
  Share2, 
  Plus, 
  Users, 
  Clock, 
  ChevronRight,
  Shield,
  Trash2,
  CalendarRange,
  Layers,
  Flag
} from 'lucide-react';
import { ShareResourceModal } from '../components/ShareResourceModal';
import { deleteProject } from '../services/projectService';
import { ProjectGanttTimeline } from '../components/ProjectGanttTimeline';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'tasks' | 'documents' | 'meetings' | 'clients' | 'activity'>('overview');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !profile) return;

    setLoading(true);
    const unsubProject = onSnapshot(doc(db, 'projects', id), (snap) => {
      if (snap.exists()) {
        setProject({ id: snap.id, ...snap.data() } as Project);
      } else {
        setProject(null);
      }
      setLoading(false);
    });

    const tQ = query(collection(db, 'tasks'), where('projectId', '==', id));
    const mQ = query(collection(db, 'meetings'), where('projectId', '==', id));
    const dQ = query(collection(db, 'documents'), where('projectId', '==', id));
    const cQ = query(collection(db, 'clients'), where('projectId', '==', id));
    const aQ = query(collection(db, 'activityLogs'), where('entityId', '==', id));

    const unsubTasks = onSnapshot(tQ, s => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() } as Task))));
    const unsubMeetings = onSnapshot(mQ, s => setMeetings(s.docs.map(d => ({ id: d.id, ...d.data() } as Meeting))));
    const unsubDocs = onSnapshot(dQ, s => setDocuments(s.docs.map(d => ({ id: d.id, ...d.data() } as DocumentInfo))));
    const unsubClients = onSnapshot(cQ, s => setClients(s.docs.map(d => ({ id: d.id, ...d.data() } as Client))));
    const unsubLogs = onSnapshot(aQ, s => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog))));

    return () => {
      unsubProject();
      unsubTasks();
      unsubMeetings();
      unsubDocs();
      unsubClients();
      unsubLogs();
    };
  }, [id, profile]);

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-12 text-center space-y-4 max-w-md mx-auto">
        <Folder className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">Project Not Found</h2>
        <p className="text-slate-400 text-xs">This project may have been deleted or you do not have permission to view it.</p>
        <Link to="/projects" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!profile || !project) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id, profile);
      navigate('/projects', { replace: true });
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete project');
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link to="/projects" className="inline-flex items-center text-xs font-semibold text-slate-400 hover:text-slate-200 mb-2 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Projects
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">{project.name}</h1>
              <p className="text-slate-400 text-xs mt-0.5">{project.description || 'No description provided.'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-sm"
          >
            <Share2 className="w-4 h-4 text-teal-400" />
            Share Project
          </button>

          {(profile?.role === 'admin' || project.ownerId === profile?.id || project.createdBy === profile?.id) && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 rounded-xl bg-rose-950/30 border border-rose-800/50 text-rose-400 hover:bg-rose-900/50 transition-colors cursor-pointer"
              title="Delete Project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-6 text-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative shrink-0 ${
            activeTab === 'overview' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview
          {activeTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative shrink-0 flex items-center gap-1.5 ${
            activeTab === 'timeline' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarRange className="w-4 h-4" />
          Timeline & Milestones
          {activeTab === 'timeline' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative shrink-0 ${
            activeTab === 'tasks' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Tasks ({tasks.length})
          {activeTab === 'tasks' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative shrink-0 ${
            activeTab === 'documents' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Documents ({documents.length})
          {activeTab === 'documents' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>

        <button
          onClick={() => setActiveTab('meetings')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative shrink-0 ${
            activeTab === 'meetings' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Meetings ({meetings.length})
          {activeTab === 'meetings' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>

        <button
          onClick={() => setActiveTab('clients')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative shrink-0 ${
            activeTab === 'clients' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Clients ({clients.length})
          {activeTab === 'clients' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`pb-3 font-medium transition-colors cursor-pointer relative shrink-0 ${
            activeTab === 'activity' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Activity
          {activeTab === 'activity' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
        </button>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-[11px] text-slate-400 flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5 text-teal-400" /> Tasks</div>
                <div className="text-xl font-bold text-slate-100 mt-1">{tasks.length}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-[11px] text-slate-400 flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-400" /> Docs</div>
                <div className="text-xl font-bold text-slate-100 mt-1">{documents.length}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-[11px] text-slate-400 flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-amber-400" /> Meetings</div>
                <div className="text-xl font-bold text-slate-100 mt-1">{meetings.length}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-[11px] text-slate-400 flex items-center gap-1"><Users className="w-3.5 h-3.5 text-purple-400" /> Clients</div>
                <div className="text-xl font-bold text-slate-100 mt-1">{clients.length}</div>
              </div>
            </div>

            {/* Gantt Timeline Roadmap Snapshot */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-teal-400" />
                  Timeline & Milestones Roadmap
                </h3>
                <button
                  onClick={() => setActiveTab('timeline')}
                  className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  Open Gantt View <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {tasks.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {tasks.slice(0, 3).map((t) => {
                    const isDone = t.status === 'completed';
                    return (
                      <div
                        key={t.id}
                        onClick={() => setActiveTab('timeline')}
                        className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between hover:border-slate-700 transition-all text-xs cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isDone ? 'bg-emerald-400' : 'bg-teal-400'
                            }`}
                          />
                          <span
                            className={`font-medium truncate ${
                              isDone ? 'text-slate-500 line-through' : 'text-slate-200 group-hover:text-teal-300'
                            }`}
                          >
                            {t.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {t.deadline && (
                            <span className="text-[11px] text-slate-400 font-mono">
                              Due: {new Date(t.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 capitalize">
                            {t.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className="w-full py-2 text-center text-xs text-teal-400 hover:bg-teal-500/10 rounded-xl border border-teal-500/20 font-medium transition-colors cursor-pointer"
                  >
                    View Interactive Gantt Timeline ({tasks.length} Deliverables)
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-3 text-center">No timeline tasks added yet.</p>
              )}
            </div>

            {/* Recent Tasks */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-teal-400" />
                  Recent Project Tasks
                </h3>
                <button onClick={() => setActiveTab('tasks')} className="text-xs text-teal-400 hover:underline">View all</button>
              </div>
              <div className="space-y-2">
                {tasks.slice(0, 4).map(t => (
                  <Link key={t.id} to={`/tasks/${t.id}`} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between hover:border-slate-700 transition-all text-xs">
                    <span className="font-medium text-slate-200">{t.title}</span>
                    <span className="capitalize text-slate-400">{t.status.replace('_', ' ')}</span>
                  </Link>
                ))}
                {tasks.length === 0 && <p className="text-xs text-slate-500 py-3 text-center">No tasks linked to this project.</p>}
              </div>
            </div>

            {/* Recent Docs */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  Project Documents
                </h3>
                <button onClick={() => setActiveTab('documents')} className="text-xs text-teal-400 hover:underline">View all</button>
              </div>
              <div className="space-y-2">
                {documents.slice(0, 4).map(d => (
                  <Link key={d.id} to={`/documents/${d.id}`} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between hover:border-slate-700 transition-all text-xs">
                    <span className="font-medium text-slate-200">{d.title}</span>
                    <span className="text-slate-500 text-[11px]">{d.category || 'General'}</span>
                  </Link>
                ))}
                {documents.length === 0 && <p className="text-xs text-slate-500 py-3 text-center">No documents linked to this project.</p>}
              </div>
            </div>
          </div>

          {/* Right Column: Meta & Actions */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Project Details</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Status</span>
                  <span className="font-semibold text-teal-400 capitalize">{project.status}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Visibility</span>
                  <span className="text-slate-200 capitalize">{project.visibility || 'Workspace'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Created</span>
                  <span className="text-slate-300">{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Timeline & Milestones */}
      {activeTab === 'timeline' && (
        <ProjectGanttTimeline
          project={project}
          tasks={tasks}
          meetings={meetings}
          onAddTask={() => navigate(`/tasks?new=true&projectId=${project.id}`)}
        />
      )}

      {/* Tab: Tasks */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">All Tasks in Project</h2>
            <Link
              to={`/tasks?new=true&projectId=${project.id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tasks.map(t => (
              <Link key={t.id} to={`/tasks/${t.id}`} className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all space-y-2 block">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-100">{t.title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono capitalize">
                    {t.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">{t.description || 'No description'}</p>
                {t.assignedToUsername && (
                  <div className="text-[11px] text-teal-400 font-mono">Assigned: @{t.assignedToUsername}</div>
                )}
              </Link>
            ))}
            {tasks.length === 0 && (
              <p className="text-xs text-slate-500 col-span-2 text-center py-8">No tasks in this project yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Documents */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Documents in Project</h2>
            <Link
              to={`/documents?new=true&projectId=${project.id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Document
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {documents.map(d => (
              <Link key={d.id} to={`/documents/${d.id}`} className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all space-y-2 block">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-100 truncate">{d.title}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{d.category || 'General'}</span>
                  <span>v{d.version || 1}</span>
                </div>
              </Link>
            ))}
            {documents.length === 0 && (
              <p className="text-xs text-slate-500 col-span-3 text-center py-8">No documents linked to this project.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Meetings */}
      {activeTab === 'meetings' && (
        <div className="space-y-3">
          {meetings.map(m => (
            <div key={m.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100">{m.title || 'Meeting'}</div>
                <div className="text-xs text-slate-400 mt-0.5">{new Date(m.date).toLocaleString()}</div>
              </div>
              <span className="text-xs text-teal-400 capitalize">{m.status || 'scheduled'}</span>
            </div>
          ))}
          {meetings.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-8">No meetings scheduled for this project.</p>
          )}
        </div>
      )}

      {/* Tab: Clients */}
      {activeTab === 'clients' && (
        <div className="space-y-3">
          {clients.map(c => (
            <div key={c.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100">{c.name}</div>
                <div className="text-xs text-slate-400 capitalize">{c.type}</div>
              </div>
              <span className="text-xs text-emerald-400 font-medium">{c.status}</span>
            </div>
          ))}
          {clients.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-8">No clients linked to this project.</p>
          )}
        </div>
      )}

      {/* Tab: Activity */}
      {activeTab === 'activity' && (
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-semibold text-slate-200">{log.userDisplayName || log.username || 'System'}</span>
                <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-300">{log.details}</p>
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-8">No activity recorded on this project yet.</p>
          )}
        </div>
      )}

      {/* Share Modal */}
      <ShareResourceModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        resourceType="project"
        resourceId={project.id}
        resourceTitle={project.name}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Delete Project?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Are you sure you want to permanently delete <strong className="text-white">"{project.name}"</strong>? All associated workspace references will be removed.
            </p>

            {deleteError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
