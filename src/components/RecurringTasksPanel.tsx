import React, { useEffect, useState } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { RecurringTaskTemplate } from '../types';
import { Repeat2, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';

const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const COLLAPSED_STORAGE_KEY = 'hubmind_recurring_tasks_collapsed';

export function RecurringTasksPanel() {
  const { profile } = useAuth();
  const [items, setItems] = useState<RecurringTaskTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<'daily'|'weekly'|'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [priority, setPriority] = useState<'low'|'medium'|'high'|'urgent'>('medium');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    return onSnapshot(collection(db, 'recurringTaskTemplates'), snap => {
      const next = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringTaskTemplate))
        .filter(x => !x.ownerId || x.ownerId === profile.id);
      setItems(next);
    }, e => console.warn('Recurring tasks subscription:', e));
  }, [profile]);

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'recurringTaskTemplates'), {
        title: title.trim(),
        description: description.trim(),
        priority,
        assignedTo: profile.id,
        frequency,
        ...(frequency === 'weekly' ? { dayOfWeek } : {}),
        ...(frequency === 'monthly' ? { dayOfMonth } : {}),
        ownerId: profile.id,
        active: true,
        createdAt: new Date().toISOString()
      });
      setTitle('');
      setDescription('');
      setFrequency('weekly');
      setDayOfWeek(1);
      setDayOfMonth(1);
      setPriority('medium');
      setOpen(false);
      setIsCollapsed(false);
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, 'false');
      } catch {}
    } catch (e) {
      console.error('Could not create recurring task:', e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (window.confirm('Stop this recurring task? Existing tasks will remain.')) {
      await deleteDoc(doc(db, 'recurringTaskTemplates', id));
    }
  };

  const label = (x: RecurringTaskTemplate) => x.frequency === 'daily'
    ? 'Every day'
    : x.frequency === 'weekly'
      ? `Every ${days[x.dayOfWeek ?? 1]}`
      : `Every month on the ${x.dayOfMonth ?? 1}${(x.dayOfMonth ?? 1)===1?'st':(x.dayOfMonth ?? 1)===2?'nd':(x.dayOfMonth ?? 1)===3?'rd':'th'}`;

  return (
    <section className="mb-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl transition-all">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex items-center gap-3 text-left group cursor-pointer select-none"
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand Recurring Tasks' : 'Collapse Recurring Tasks'}
        >
          <div className="p-2 rounded-xl bg-accent/10 text-accent group-hover:bg-accent/20 transition-colors">
            <Repeat2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white group-hover:text-accent transition-colors">Recurring Tasks</h2>
              {items.length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                  {items.length}
                </span>
              )}
              <span className="text-slate-400 group-hover:text-white transition-colors">
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </span>
            </div>
            <p className="text-xs text-slate-500">Set it once. Hub-Mind adds it when it is due.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-9 px-3 rounded-xl bg-accent hover:bg-accent/90 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4"/> Add recurring
        </button>
      </div>

      {!isCollapsed && (
        <div className="mt-4 transition-all">
          {items.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {items.map(x => (
                <div key={x.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{x.title}</p>
                    <p className="text-xs text-slate-500">{label(x)} · {x.priority}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(x.id)}
                    className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    title="Stop recurring"
                  >
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-xs text-slate-500">
              No recurring tasks configured yet. Click "+ Add recurring" to create one.
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={create} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Add recurring task</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-white">
                <X/>
              </button>
            </div>
            <input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Follow up with school clients" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"/>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional description" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white min-h-20"/>
            <div className="grid grid-cols-2 gap-3">
              <select value={frequency} onChange={e=>setFrequency(e.target.value as any)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"><option value="daily">Every day</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
              <select value={priority} onChange={e=>setPriority(e.target.value as any)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
            </div>
            {frequency==='weekly' && <select value={dayOfWeek} onChange={e=>setDayOfWeek(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">{days.map((d,i)=><option key={d} value={i}>{d}</option>)}</select>}
            {frequency==='monthly' && <input type="number" min="1" max="31" value={dayOfMonth} onChange={e=>setDayOfMonth(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"/>}
            <button disabled={saving} className="w-full bg-accent text-slate-950 font-bold rounded-lg py-2.5 text-sm hover:bg-accent/90 transition-colors cursor-pointer">{saving?'Saving…':'Save recurring task'}</button>
          </form>
        </div>
      )}
    </section>
  );
}
