import { Share2 } from 'lucide-react';
import { shareHubMindItem, copyShareUrl } from '../lib/shareLinks';
import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { FollowUp, FollowUpStatus, TaskPriority } from '../types';
import { CalendarClock, CheckCircle2, Clock3, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react';

const statusOptions: FollowUpStatus[] = ['scheduled', 'due', 'contacted', 'waiting', 'resolved', 'cancelled'];
const priorityOptions: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

function statusLabel(status: FollowUpStatus) {
  return status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function dueState(item: FollowUp): FollowUpStatus {
  if (item.status === 'resolved' || item.status === 'cancelled') return item.status;
  return new Date(item.dueAt).getTime() <= Date.now() ? 'due' : item.status;
}

export function FollowUps() {
  const { profile } = useAuth();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [person, setPerson] = useState('');
  const [reason, setReason] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);

    const base = collection(db, 'followUps');
    const q = profile.role === 'admin'
      ? query(base, orderBy('dueAt', 'asc'))
      : query(base, where('ownerId', '==', profile.id));

    const unsubscribe = onSnapshot(q, (snap) => {
      const next = snap.docs.map(d => ({ id: d.id, ...d.data() } as FollowUp));
      next.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
      setItems(next);
      setLoading(false);
    }, (e) => {
      console.warn('Real-time follow-ups listener fallback:', e);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile?.id, profile?.role]);

  const summary = useMemo(() => {
    const active = items.filter(i => !['resolved', 'cancelled'].includes(i.status));
    return {
      overdue: active.filter(i => new Date(i.dueAt).getTime() <= Date.now()).length,
      today: active.filter(i => {
        const d = new Date(i.dueAt); const n = new Date();
        return d.toDateString() === n.toDateString();
      }).length,
      waiting: active.filter(i => i.status === 'waiting').length,
      resolved: items.filter(i => i.status === 'resolved').length,
    };
  }, [items]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !title.trim() || !dueAt) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'followUps'), {
        title: title.trim(),
        person: person.trim() || undefined,
        reason: reason.trim() || undefined,
        ownerId: profile.id,
        dueAt: new Date(dueAt).toISOString(),
        status: 'scheduled',
        priority,
        createdAt: now,
        updatedAt: now,
      });
      setTitle(''); setPerson(''); setReason(''); setDueAt(''); setPriority('medium');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item: FollowUp, status: FollowUpStatus) => {
    await updateDoc(doc(db, 'followUps', item.id), {
      status,
      lastContactAt: status === 'contacted' ? new Date().toISOString() : item.lastContactAt || null,
      updatedAt: new Date().toISOString(),
    });
  };

  const remove = async (item: FollowUp) => {
    if (!window.confirm(`Delete follow-up “${item.title}”?`)) return;
    await deleteDoc(doc(db, 'followUps', item.id));
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent font-bold">Operations</p>
          <h1 className="text-3xl font-bold text-white mt-1">Follow-ups</h1>
          <p className="text-slate-400 text-sm mt-1">Never lose track of a person, promise, payment or pending response.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="inline-flex items-center justify-center gap-2 bg-accent text-slate-950 font-bold px-4 py-2.5 rounded-xl">
          <Plus className="w-4 h-4" /> New Follow-up
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Overdue', summary.overdue, 'text-red-400'],
          ['Due today', summary.today, 'text-amber-400'],
          ['Waiting', summary.waiting, 'text-cyan-400'],
          ['Resolved', summary.resolved, 'text-emerald-400'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">{label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="What needs following up?" className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" />
          <input value={person} onChange={e => setPerson(e.target.value)} placeholder="Person / organisation" className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" />
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (e.g. payment, proposal, response)" className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" />
          <input value={dueAt} onChange={e => setDueAt(e.target.value)} required type="datetime-local" className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" />
          <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white">
            {priorityOptions.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-slate-400">Cancel</button>
            <button disabled={saving} className="px-5 py-2 rounded-xl bg-accent text-slate-950 font-bold">{saving ? 'Saving…' : 'Create Follow-up'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-accent" /></div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <CalendarClock className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <h2 className="text-white font-bold">No follow-ups yet</h2>
          <p className="text-slate-500 text-sm mt-1">Capture the next thing someone owes you or you owe them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const state = dueState(item);
            const overdue = state === 'due' && new Date(item.dueAt).getTime() <= Date.now();
            return (
              <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${overdue ? 'bg-red-500/10 text-red-400' : 'bg-accent/10 text-accent'}`}>
                  {state === 'resolved' ? <CheckCircle2 className="w-5 h-5" /> : <Clock3 className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-white truncate">{item.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                    {item.person && <span className="inline-flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{item.person}</span>}
                    <span className={overdue ? 'text-red-400 font-bold' : ''}>{new Date(item.dueAt).toLocaleString()}</span>
                    {item.reason && <span>{item.reason}</span>}
                    <span className="uppercase font-bold">{item.priority}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={state} onChange={e => changeStatus(item, e.target.value as FollowUpStatus)} className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200">
                    {statusOptions.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                  <button onClick={async () => { const path = `/follow-ups/${item.id}?shared=1`; try { await copyShareUrl(path); } catch {} await shareHubMindItem(path, item.title); }} className="p-2 rounded-lg text-accent hover:bg-accent/10" title="Share follow-up"><Share2 className="w-4 h-4" /></button>
                  <button onClick={() => remove(item)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
