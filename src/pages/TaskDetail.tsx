import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { doc, onSnapshot, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Task, TaskPriority, TaskStatus, User } from '../types';
import { 
  Loader2, 
  ArrowLeft, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Calendar as CalendarIcon, 
  Tag, 
  AlignLeft, 
  User as UserIcon, 
  Edit, 
  MessageSquare, 
  Send, 
  Share2, 
  Folder, 
  Check, 
  X, 
  AlertCircle,
  Shield,
  AtSign
} from 'lucide-react';
import { 
  acceptTask, 
  rejectTask, 
  updateTask, 
  deleteTask 
} from '../services/taskService';
import { ShareResourceModal } from '../components/ShareResourceModal';
import { subscribeToUsers } from '../services/userService';

export function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [task, setTask] = useState<Task | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Comment input
  const [commentText, setCommentText] = useState('');

  // Edit fields
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editStatus, setEditStatus] = useState<TaskStatus>('in_progress');
  const [editDeadline, setEditDeadline] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);
  const [clientsList, setClientsList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const unsubUsers = subscribeToUsers(setUsers);
    const fetchSelects = async () => {
      try {
        const [pSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'projects')),
          getDocs(collection(db, 'clients')),
        ]);
        setProjectsList(pSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
        setClientsList(cSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      } catch (e) {}
    };
    fetchSelects();
    return () => unsubUsers();
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const docRef = doc(db, 'tasks', id);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const t = { id: docSnap.id, ...docSnap.data() } as Task;
        setTask(t);
        setEditTitle(t.title);
        setEditDesc(t.description || '');
        setEditPriority(t.priority);
        setEditStatus(t.status);
        setEditDeadline(t.deadline ? t.deadline.substring(0, 10) : '');
        setEditAssignedTo(t.assignedTo || '');
        setEditProjectId(t.projectId || '');
        setEditClientId(t.clientId || '');
      } else {
        setTask(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [id]);

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-12 text-center space-y-4 max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">Task Not Found</h2>
        <p className="text-slate-400 text-xs">This task no longer exists or you do not have permission to view it.</p>
        <Link to="/tasks" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700">
          <ArrowLeft className="w-4 h-4" /> Back to Tasks
        </Link>
      </div>
    );
  }

  const isAssignedToMe = task.assignedTo === profile?.id;
  const isCreator = task.createdBy === profile?.id || task.ownerId === profile?.id;
  const canManage = profile?.role === 'admin' || isCreator || isAssignedToMe;

  const handleAccept = async () => {
    if (!profile) return;
    try {
      await acceptTask(task.id, profile);
    } catch (err: any) {
      alert(`Error accepting task: ${err.message}`);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      await rejectTask(task.id, rejectReason, profile);
      setShowRejectModal(false);
      setRejectReason('');
    } catch (err: any) {
      alert(`Error declining task: ${err.message}`);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsUpdating(true);
    try {
      let assignedUser = users.find(u => u.id === editAssignedTo);
      await updateTask(
        task.id,
        {
          title: editTitle.trim(),
          description: editDesc.trim(),
          priority: editPriority,
          status: editStatus,
          assignedTo: editAssignedTo || profile.id,
          assignedToUsername: assignedUser?.username || profile.username,
          projectId: editProjectId || undefined,
          clientId: editClientId || undefined,
          deadline: editDeadline ? new Date(editDeadline).toISOString() : undefined,
        },
        profile
      );
      setIsEditing(false);
    } catch (err: any) {
      alert(`Update error: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !commentText.trim()) return;

    const newComment = {
      userId: profile.id,
      username: profile.username,
      text: commentText.trim(),
      timestamp: new Date().toISOString(),
    };

    try {
      const comments = [...(task.comments || []), newComment];
      await updateTask(task.id, { comments }, profile);
      setCommentText('');
    } catch (err: any) {
      alert(`Error posting comment: ${err.message}`);
    }
  };

  const handleToggleChecklist = async (index: number) => {
    if (!profile) return;
    const checklist = [...(task.checklist || [])];
    checklist[index].done = !checklist[index].done;
    await updateTask(task.id, { checklist }, profile);
  };

  const handleDelete = async () => {
    if (!profile || !confirm(`Delete task "${task.title}"?`)) return;
    setIsDeleting(true);
    try {
      await deleteTask(task.id, profile);
      navigate('/tasks', { replace: true });
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link to="/tasks" className="inline-flex items-center text-xs font-semibold text-slate-400 hover:text-slate-200 mb-2 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Tasks
          </Link>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            {task.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white text-xs font-medium cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-teal-400" />
            Share
          </button>

          {canManage && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white text-xs font-medium cursor-pointer"
            >
              <Edit className="w-4 h-4 text-teal-400" />
              {isEditing ? 'Cancel Edit' : 'Edit Task'}
            </button>
          )}

          {(profile?.role === 'admin' || isCreator) && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 rounded-xl bg-rose-950/30 border border-rose-800/50 text-rose-400 hover:bg-rose-900/50 transition-colors cursor-pointer"
              title="Delete Task"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Assignment Acceptance Banner */}
      {isAssignedToMe && task.status === 'assigned' && (
        <div className="p-4 bg-teal-950/40 border border-teal-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-teal-500/5">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-teal-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              New Task Assigned to You
            </h3>
            <p className="text-xs text-slate-300">
              Please review and accept this task to start work, or decline with a reason.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleAccept}
              className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-teal-500/10 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Accept Task
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl text-xs transition-all border border-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4 text-rose-400" />
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Rejection notice if declined */}
      {task.status === 'rejected' && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/70 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <span className="font-bold text-rose-300 block">Task Declined by Assignee</span>
            <span className="text-slate-300">Reason: "{task.rejectedReason || task.rejectionReason || 'No reason specified.'}"</span>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols */}
        <div className="md:col-span-2 space-y-6">
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
              <h2 className="text-sm font-bold text-slate-200">Edit Task Details</h2>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <textarea
                  rows={4}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Lifecycle Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="draft">Draft</option>
                    <option value="assigned">Assigned</option>
                    <option value="accepted">Accepted</option>
                    <option value="in_progress">In Progress</option>
                    <option value="submitted">Submitted</option>
                    <option value="under_review">Under Review</option>
                    <option value="completed">Completed</option>
                    <option value="rejected">Rejected</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Assignee (@username)</label>
                  <select
                    value={editAssignedTo}
                    onChange={(e) => setEditAssignedTo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>@{u.username} ({u.displayName})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Deadline Date</label>
                  <input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Linked Project</label>
                  <select
                    value={editProjectId}
                    onChange={(e) => setEditProjectId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="">None</option>
                    {projectsList.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Linked Client</label>
                  <select
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="">None</option>
                    {clientsList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-teal-500/10"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-lg">
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</h3>
                <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                  {task.description || 'No detailed description provided for this task.'}
                </p>
              </div>

              {/* Checklist */}
              {task.checklist && task.checklist.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Checklist Items</h3>
                  <div className="space-y-2">
                    {task.checklist.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleToggleChecklist(idx)}
                        className="w-full p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center gap-3 text-xs text-left hover:border-slate-700 transition-all cursor-pointer"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          item.done ? 'bg-teal-500 border-teal-500 text-slate-950' : 'border-slate-600'
                        }`}>
                          {item.done && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className={item.done ? 'line-through text-slate-500' : 'text-slate-200'}>
                          {item.item}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comments Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-teal-400" />
              Task Discussion ({task.comments?.length || 0})
            </h3>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {(task.comments || []).map((c, i) => (
                <div key={i} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-teal-400 font-semibold">@{c.username || 'user'}</span>
                    <span className="text-[11px] text-slate-500">{new Date(c.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-200">{c.text}</p>
                </div>
              ))}
              {(!task.comments || task.comments.length === 0) && (
                <p className="text-xs text-slate-500 text-center py-4">No comments yet. Start the conversation below.</p>
              )}
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment or update..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-teal-500/10 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Post
              </button>
            </form>
          </div>
        </div>

        {/* Right Sidebar Meta */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Properties</h3>
            
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Status</span>
                <span className="font-mono font-semibold text-teal-400 capitalize px-2 py-0.5 rounded bg-teal-950/60 border border-teal-800/60 text-[11px]">
                  {task.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Priority</span>
                <span className="capitalize font-semibold text-slate-200">{task.priority}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Assigned To</span>
                <span className="font-mono text-teal-400">@{task.assignedToUsername || 'unassigned'}</span>
              </div>

              {task.deadline && (
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Deadline</span>
                  <span className="text-slate-200">{new Date(task.deadline).toLocaleDateString()}</span>
                </div>
              )}

              {task.projectId && (
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Project</span>
                  <Link to={`/projects/${task.projectId}`} className="text-teal-400 hover:underline flex items-center gap-1">
                    <Folder className="w-3 h-3" />
                    View Project
                  </Link>
                </div>
              )}

              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Created</span>
                <span className="text-slate-400">{new Date(task.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <X className="w-5 h-5 text-rose-400" />
              Decline Task Assignment
            </h2>
            <p className="text-xs text-slate-400">
              Please state why you are unable to take on this task. The task creator will be notified.
            </p>
            <form onSubmit={handleReject} className="space-y-4">
              <textarea
                required
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (e.g. at capacity, wrong department, need more info)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!rejectReason.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-md"
                >
                  Confirm Decline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal */}
      <ShareResourceModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        resourceType="task"
        resourceId={task.id}
        resourceTitle={task.title}
      />
    </div>
  );
}
