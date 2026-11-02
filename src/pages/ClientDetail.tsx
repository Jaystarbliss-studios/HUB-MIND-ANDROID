import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { doc, getDoc, collection, query, where, getDocs, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Client, Task, Meeting } from '../types';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Loader2, ArrowLeft, Mail, Phone, Building2, User, Users as UsersIcon, Calendar as CalendarIcon, CheckSquare, Edit, Trash2, Share2 } from 'lucide-react';
import { shareHubMindItem, copyShareUrl } from '../lib/shareLinks';
import { safeParseISO, safeFormat } from "../lib/dateUtils";
import { format, parseISO } from 'date-fns';
import { useUsers } from '../lib/useUsers';
import { getThumbnailUrl } from '../lib/cloudinary';

export function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { users } = useUsers();
  
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editType, setEditType] = useState<any>('other');
  const [editStatus, setEditStatus] = useState<any>('lead');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'clients', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const c = { id: docSnap.id, ...docSnap.data() } as Client;
          setClient(c);
          setEditName(c.name);
          setEditEmail(c.email || '');
          setEditPhone(c.phone || '');
          setEditType(c.type);
          setEditStatus(c.status);
        }
        
        // Fetch tasks
        const tasksQ = query(collection(db, 'tasks'), where('clientId', '==', id));
        const tasksSnap = await getDocs(tasksQ);
        const t = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
        setTasks(t.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        
        // Fetch meetings
        const meetingsQ = query(collection(db, 'meetings'), where('clientId', '==', id));
        const meetingsSnap = await getDocs(meetingsQ);
        const m = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Meeting));
        setMeetings(m.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        
      } catch (error) {
        console.error("Error fetching client details:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id]);

  
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !client) return;
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'clients', id), {
        name: editName,
        email: editEmail,
        phone: editPhone,
        type: editType,
        status: editStatus,
        updatedAt: new Date().toISOString()
      });
      setClient({ ...client, name: editName, email: editEmail, phone: editPhone, type: editType, status: editStatus });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating client:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', id));
      navigate('/clients');
    } catch (error) {
      console.error("Error deleting client:", error);
      setIsDeleting(false);
    }
  };
  
  const getClientIcon = (type: string) => {
    switch (type) {
      case 'school': return <Building2 className="w-8 h-8 text-indigo-400" />;
      case 'parent': return <User className="w-8 h-8 text-emerald-400" />;
      default: return <UsersIcon className="w-8 h-8 text-slate-400" />;
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (!client) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl text-slate-200 font-bold mb-4">Client not found</h2>
        <button onClick={() => navigate('/clients')} className="text-accent hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 flex flex-col h-full min-h-0 pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          <button onClick={async () => { if (!client) return; const path = `/clients/${client.id}?shared=1`; try { await copyShareUrl(path); } catch {} await shareHubMindItem(path, client.name); }} className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 rounded-lg transition-colors text-sm font-semibold" title="Share client">
            <Share2 className="w-4 h-4" /><span className="hidden sm:inline">Share</span>
          </button>
          {!isEditing && (
            <>
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors text-sm font-semibold">
                <Edit className="w-4 h-4" /> Edit
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors text-sm font-semibold">
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
              </button>
            </>
          )}
        </div>
      </div>

      <Dialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl z-50 focus:outline-none">
            <Dialog.Title className="text-xl font-bold text-white mb-2">Delete Client</Dialog.Title>
            <Dialog.Description className="text-slate-400 mb-6">
              Are you sure you want to delete this client? This action cannot be undone and will not automatically delete related tasks or meetings.
            </Dialog.Description>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 font-semibold text-slate-300 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isDeleting} className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-colors">
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
  
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shrink-0">
        
        {isEditing ? (
          <form onSubmit={handleUpdate} className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-4">Edit Client Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                <input type="text" required value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Phone</label>
                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Type</label>
                  <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent">
                    <option value="school">School</option>
                    <option value="parent">Parent</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Status</label>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent">
                    <option value="lead">Lead</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-400 hover:text-white font-semibold">Cancel</button>
              <button type="submit" disabled={isUpdating} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-slate-950 px-4 py-2 rounded-lg font-bold transition-colors">
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 items-start">
  
          {client.photoUrl ? (
            <img src={getThumbnailUrl(client.photoUrl, 128, 128)} alt="" className="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover border border-slate-700" />
          ) : (
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700 shrink-0">
              {getClientIcon(client.type)}
            </div>
          )}
          
          <div className="flex-1 space-y-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 px-2 py-1 rounded">{client.type}</span>
                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${
                  client.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                  client.status === 'lead' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-400'
                }`}>{client.status}</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">{client.name}</h1>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 text-sm text-slate-300">
              {client.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <a href={`mailto:${client.email}`} className="hover:text-accent transition-colors">{client.email}</a>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-500" />
                  <a href={`tel:${client.phone}`} className="hover:text-accent transition-colors">{client.phone}</a>
                </div>
              )}
            </div>
                    </div>
        </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-y-auto pb-4">
        {/* Tasks Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-accent" />
              Related Tasks
            </h2>
            <span className="text-xs font-semibold bg-slate-800 text-slate-400 px-2 py-1 rounded">{tasks.length}</span>
          </div>
          <div className="p-2 overflow-y-auto flex-1">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No tasks for this client.</div>
            ) : (
              <div className="space-y-2">
                {tasks.map(task => (
                  <Link key={task.id} to={`/tasks/${task.id}`} className="block p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                        task.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400' :
                        task.status === 'under_review' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        {task.status.replace('_', ' ')}
                      </span>
                      {task.deadline && <span className="text-xs text-slate-500">{safeFormat(task.deadline, 'MMM d, yyyy')}</span>}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200">{task.title}</h3>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Meetings Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-400" />
              Meetings
            </h2>
            <span className="text-xs font-semibold bg-slate-800 text-slate-400 px-2 py-1 rounded">{meetings.length}</span>
          </div>
          <div className="p-2 overflow-y-auto flex-1">
            {meetings.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No meetings scheduled.</div>
            ) : (
              <div className="space-y-2">
                {meetings.map(meeting => (
                  <Link key={meeting.id} to={`/meetings/${meeting.id}`} className="block p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        meeting.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                        meeting.status === 'in_session' ? 'bg-blue-500/10 text-blue-400' :
                        meeting.status === 'canceled' ? 'bg-red-500/10 text-red-400' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        {(meeting.status || 'scheduled').replace('_', ' ')}
                      </span>
                      {meeting.date && <span className="text-xs text-slate-500">{safeFormat(meeting.date, 'MMM d, h:mm a')}</span>}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200">{meeting.notesRaw.split('\\n')[0] || 'Meeting'}</h3>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
