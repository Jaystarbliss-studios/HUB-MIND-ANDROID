import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { AdminJessSettings } from '../components/AdminJessSettings';
import { createInvitation } from '../lib/invitations';
import { RecurringTaskTemplate, User, ActivityLog } from '../types';
import { Check, Copy, Loader2, Plus, Trash2, User as UserIcon, Pause, Play, Activity, Shield, AlertTriangle } from 'lucide-react';
import { safeFormat } from '../lib/dateUtils';

export function AdminUsers() {
  const { profile, user: firebaseUser } = useAuth();
  const [tab, setTab] = useState<'people' | 'recurring' | 'activity' | 'jess'>('people');
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState('');
  const [accessSuccess, setAccessSuccess] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<RecurringTaskTemplate[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateAssigned, setTemplateAssigned] = useState('');
  const [templateFreq, setTemplateFreq] = useState<'daily'|'weekly'|'monthly'>('daily');
  const [templatePriority, setTemplatePriority] = useState<'low'|'medium'|'high'|'urgent'>('medium');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!profile) return;
    return onSnapshot(query(collection(db, 'users')), s =>
      setUsers(s.docs.map(d => ({ id: d.id, ...d.data() } as User)))
    );
  }, [profile]);

  useEffect(() => {
    if (tab !== 'recurring') return;
    return onSnapshot(query(collection(db, 'recurringTaskTemplates')), s =>
      setTemplates(s.docs.map(d => ({ id: d.id, ...d.data() } as RecurringTaskTemplate)))
    );
  }, [tab]);

  useEffect(() => {
    if (tab !== 'activity') return;
    const q = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, s =>
      setActivityLogs(s.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)))
    );
  }, [tab]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    try {
      const result = await createInvitation({ username, displayName: name, email, phone, invitedBy: profile.id });
      setInviteLink(result.link);
      setUsername('');
      setName('');
      setEmail('');
      setPhone('');
    } catch (err: any) {
      alert(err?.message || 'Unable to create invitation.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateUserAccess = async (target: User, patch: { role?: 'admin' | 'staff'; status?: 'active' | 'suspended' | 'inactive' }) => {
    if (!firebaseUser) return;
    setAccessBusyId(target.id); setAccessError(''); setAccessSuccess('');
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch('/api/admin/users/' + encodeURIComponent(target.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not update this account.');
      setAccessSuccess('Access updated for ' + (target.name || target.email) + '.');
    } catch (error: any) {
      setAccessError(error?.message || 'Could not update this account.');
    } finally { setAccessBusyId(null); }
  };

  const deleteUserAccount = async (target: User) => {
    if (!firebaseUser) return;
    const confirmed = window.confirm(
      'Permanently delete ' + (target.name || target.email) + '?\n\nThis disables and deletes their Firebase sign-in account and removes their user profile. Existing documents, tasks, and other workspace records are retained. This cannot be undone.'
    );
    if (!confirmed) return;
    setAccessBusyId(target.id); setAccessError(''); setAccessSuccess('');
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch('/api/admin/users/' + encodeURIComponent(target.id), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not delete this account.');
      setAccessSuccess('Deleted the sign-in account and profile for ' + (target.name || target.email) + '.');
    } catch (error: any) {
      setAccessError(error?.message || 'Could not delete this account.');
    } finally { setAccessBusyId(null); }
  };

  const toggleDay = (day: number) =>
    setDaysOfWeek(current => current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort());

  const resetTemplate = () => {
    setTemplateTitle('');
    setTemplateDesc('');
    setTemplateAssigned('');
    setTemplateFreq('daily');
    setTemplatePriority('medium');
    setDaysOfWeek([1]);
    setDayOfMonth(1);
    setStartDate('');
    setEndDate('');
  };

  const createTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !templateAssigned || !templateTitle.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'recurringTaskTemplates'), {
        title: templateTitle.trim(),
        description: templateDesc,
        priority: templatePriority,
        assignedTo: templateAssigned,
        frequency: templateFreq,
        daysOfWeek: templateFreq === 'weekly' ? daysOfWeek : [],
        dayOfMonth: templateFreq === 'monthly' ? dayOfMonth : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        active: true,
        createdAt: new Date().toISOString(),
        ownerId: profile.id,
      });
      resetTemplate();
    } finally {
      setBusy(false);
    }
  };

  const toggleTemplate = async (template: RecurringTaskTemplate) =>
    updateDoc(doc(db, 'recurringTaskTemplates', template.id), { active: !template.active, updatedAt: new Date().toISOString() });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20">
      <header>
        <h1 className="text-3xl font-bold text-white">Admin Centre</h1>
        <p className="text-sm text-slate-400 mt-1">People, access, recurring work and organizational logs.</p>
      </header>

      <div className="flex gap-6 border-b border-slate-800">
        <button
          onClick={() => setTab('people')}
          className={`pb-3 text-sm font-bold transition-colors cursor-pointer ${
            tab === 'people' ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          People & Access
        </button>
        <button
          onClick={() => setTab('recurring')}
          className={`pb-3 text-sm font-bold transition-colors cursor-pointer ${
            tab === 'recurring' ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Recurring Task Templates
        </button>
        <button
          onClick={() => setTab('jess')}
          className={`pb-3 text-sm font-bold transition-colors cursor-pointer ${tab === 'jess' ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Jess Settings
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`pb-3 text-sm font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            tab === 'activity' ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" />
          Activity Log
        </button>
      </div>

      {accessError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/><span>{accessError}</span></div>}
      {accessSuccess && <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{accessSuccess}</div>}
      {tab === 'jess' && <AdminJessSettings />}
      {tab === 'people' && (
        <section className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowInvite(v => !v)}
              className="inline-flex items-center gap-2 bg-accent text-slate-950 font-bold px-4 py-2.5 rounded-xl cursor-pointer hover:bg-accent-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              {showInvite ? 'Close Form' : 'Invite Staff'}
            </button>
          </div>
          {showInvite && (
            <form onSubmit={invite} className="grid md:grid-cols-2 gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="md:col-span-2">
                <h2 className="text-white font-semibold">Invite a staff member</h2>
                <p className="text-xs text-slate-500 mt-1">Staff accounts are admitted only through an active invitation.</p>
              </div>
              <input required value={name} onChange={e => setName(e.target.value)} placeholder="Display name" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Google account email" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              <input required value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              <button disabled={busy} className="md:col-span-2 inline-flex justify-center items-center gap-2 bg-accent text-slate-950 font-bold rounded-lg py-2.5 cursor-pointer">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Create invitation
              </button>
              {inviteLink && (
                <div className="md:col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-xs text-emerald-300 mb-2">Invitation created successfully:</p>
                  <div className="flex gap-2">
                    <input readOnly value={inviteLink} className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300" />
                    <button type="button" onClick={copy} className="px-3 rounded-lg bg-slate-800 text-slate-200 hover:text-white cursor-pointer">
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {users.map(u => (
              <div key={u.id} className="p-4 border-b border-slate-800 last:border-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,auto)] gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                    {u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.name || u.displayName || 'Unnamed user'}</p>
                    <p className="text-xs text-slate-500 truncate">@{u.username} · {u.email}</p>
                    <p className="mt-1 text-[10px] text-slate-600 break-all">User ID: {u.id}</p>
                    {u.id === profile?.id && <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-teal-300"><Shield className="w-3 h-3"/> Your account</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <label className="grid gap-1 text-[9px] uppercase tracking-wider text-slate-500">
                    Role
                    <select aria-label={'Role for ' + (u.name || u.email)} disabled={accessBusyId === u.id || u.id === profile?.id} value={u.role || 'staff'} onChange={e => void updateUserAccess(u, { role: e.target.value as 'admin' | 'staff' })} className="min-w-[108px] rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs font-semibold normal-case tracking-normal text-slate-200 disabled:opacity-50">
                      <option value="staff">Staff</option><option value="admin">Admin</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-[9px] uppercase tracking-wider text-slate-500">
                    Status
                    <select aria-label={'Status for ' + (u.name || u.email)} disabled={accessBusyId === u.id || u.id === profile?.id} value={u.status || 'active'} onChange={e => void updateUserAccess(u, { status: e.target.value as 'active' | 'suspended' | 'inactive' })} className="min-w-[118px] rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs font-semibold normal-case tracking-normal text-slate-200 disabled:opacity-50">
                      <option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => void deleteUserAccount(u)} disabled={accessBusyId === u.id || u.id === profile?.id} className="mt-4 inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-rose-500/25 px-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40" title="Delete sign-in account and profile">
                    {accessBusyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Trash2 className="w-3.5 h-3.5"/>} Delete
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No approved members yet.</div>}
          </div>
        </section>
      )}

      {tab === 'recurring' && (
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white">Recurring Task Templates</h2>
              <p className="text-xs text-slate-400">Automate assignments and repeated operational workflows.</p>
            </div>
            <button
              onClick={() => setShowInvite(v => !v)}
              className="inline-flex items-center gap-2 bg-accent text-slate-950 font-bold px-4 py-2 rounded-xl text-xs cursor-pointer hover:bg-accent-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              {showInvite ? 'Close Form' : 'New Template'}
            </button>
          </div>
          {showInvite && (
            <form onSubmit={createTemplate} className="grid md:grid-cols-2 gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <input required value={templateTitle} onChange={e => setTemplateTitle(e.target.value)} placeholder="Recurring task title" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              <select value={templateAssigned} onChange={e => setTemplateAssigned(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Assign to…</option>
                {users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <textarea value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} placeholder="Description" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white md:col-span-2" />
              <select value={templateFreq} onChange={e => setTemplateFreq(e.target.value as any)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select value={templatePriority} onChange={e => setTemplatePriority(e.target.value as any)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              {templateFreq === 'weekly' && (
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, day) => (
                    <button type="button" key={label} onClick={() => toggleDay(day)} className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer ${daysOfWeek.includes(day) ? 'border-accent bg-accent/10 text-accent' : 'border-slate-800 text-slate-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {templateFreq === 'monthly' && (
                <label className="text-xs text-slate-400">
                  Day of month
                  <input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} className="mt-1 block w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                </label>
              )}
              <label className="text-xs text-slate-400">
                Start date
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">
                End date
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              </label>
              <button disabled={busy} className="md:col-span-2 bg-accent text-slate-950 font-bold rounded-lg py-2.5 text-xs cursor-pointer">
                Create recurring task
              </button>
            </form>
          )}
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{t.title}</p>
                  <p className="text-xs text-slate-500 capitalize">{t.frequency} · {t.priority} · {t.active ? 'active' : 'paused'} · {users.find(u => u.id === t.assignedTo)?.name || t.assignedTo}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => void toggleTemplate(t)} className="p-2 text-slate-500 hover:text-accent cursor-pointer" aria-label={t.active ? 'Pause' : 'Resume'}>
                    {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => void deleteDoc(doc(db, 'recurringTaskTemplates', t.id))} className="p-2 text-slate-500 hover:text-rose-400 cursor-pointer" aria-label="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-500">
                No recurring task templates configured yet.
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'activity' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">System Activity Trail</h2>
            <p className="text-xs text-slate-400">All administrative operations, records updates, and user activities.</p>
          </div>
          <div className="space-y-3">
            {activityLogs.map(log => (
              <div key={log.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-accent shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-300">
                      <span className="font-bold text-white">{log.userId}</span> {log.action} <span className="font-bold text-white">{log.details}</span>
                    </p>
                    <p className="text-xs text-slate-500 capitalize mt-0.5">{log.entityType}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-medium shrink-0">
                  {safeFormat(log.createdAt, 'MMM d, h:mm a')}
                </span>
              </div>
            ))}
            {activityLogs.length === 0 && (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-500">
                No activity records found.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
