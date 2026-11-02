import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { RecurringMeetingTemplate } from '../types';
import { CalendarClock, Plus, Trash2, X, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { materializeRecurringMeetings, recurringMeetingSummary } from '../lib/recurringMeetings';

const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const fullDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const COLLAPSED_STORAGE_KEY = 'hubmind_recurring_schedule_collapsed';

export function RecurringSchedulePanel() {
  const { profile } = useAuth();
  const [items, setItems] = useState<RecurringMeetingTemplate[]>([]);
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
  const [type, setType] = useState<RecurringMeetingTemplate['type']>('class');
  const [frequency, setFrequency] = useState<RecurringMeetingTemplate['frequency']>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!profile) return;
    const templatesQuery = collection(db, 'recurringMeetingTemplates');
    return onSnapshot(templatesQuery, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringMeetingTemplate));
      const visible = profile.role === 'admin'
        ? all
        : all.filter(x => x.ownerId === profile.id);
      setItems(visible.filter(x => x.active !== false));
    }, e => {
      console.error('Recurring schedule subscription failed:', e);
      setError('Unable to load recurring events. Please check your permissions or connection.');
    });
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

  const reset = () => {
    setTitle(''); setType('class'); setFrequency('weekly'); setSelectedDays([1]);
    setStartTime('09:00'); setEndTime('10:00'); setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setEndDate(''); setLocation(''); setDescription('');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!profile || !title.trim()) {
      setError('Please enter an event title.');
      return;
    }
    if (frequency === 'weekly' && selectedDays.length === 0) {
      setError('Select at least one day for a weekly event.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('The end date cannot be before the start date.');
      return;
    }
    if (endTime && endTime <= startTime) {
      setError('The end time must be later than the start time.');
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, 'recurringMeetingTemplates'), {
        title: title.trim(),
        type,
        frequency,
        daysOfWeek: frequency === 'weekly' ? selectedDays : [],
        dayOfMonth: frequency === 'monthly' ? Number(startDate.slice(8, 10)) : null,
        startTime,
        endTime: endTime || null,
        startDate,
        endDate: endDate || null,
        location: location.trim() || null,
        description: description.trim() || null,
        ownerId: profile.id,
        attendees: [],
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await materializeRecurringMeetings(90, profile);

      reset();
      setOpen(false);
      setIsCollapsed(false);
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, 'false');
      } catch {}
      setSuccess('Recurring event added to your schedule.');
    } catch (e) {
      console.error('Create recurring schedule failed:', e);
      const code = (e as any)?.code;
      setError(code === 'permission-denied'
        ? 'Firebase denied this recurring-event write. Your account is authenticated, but its workspace permission is not being accepted. Refresh once and try again.'
        : e instanceof Error ? e.message : 'Could not save the recurring event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => setSelectedDays(v => v.includes(day) ? v.filter(x => x !== day) : [...v, day].sort());

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl transition-all">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex gap-3 items-center text-left group cursor-pointer select-none"
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand Recurring Schedule' : 'Collapse Recurring Schedule'}
        >
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
            <CalendarClock className="w-5 h-5"/>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-sm group-hover:text-cyan-300 transition-colors">Recurring Schedule</h2>
              {items.length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                  {items.length}
                </span>
              )}
              <span className="text-slate-400 group-hover:text-white transition-colors">
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </span>
            </div>
            <p className="text-xs text-slate-500">Classes, meetings and appointments that repeat automatically.</p>
          </div>
        </button>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <button
            type="button"
            onClick={() => { setError(''); setSuccess(''); setOpen(true); }}
            className="px-3 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4"/> Add recurring event
          </button>
        </div>
      </div>

      {success && <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><CheckCircle2 className="w-4 h-4 shrink-0"/>{success}</div>}
      {error && !open && <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}

      {!isCollapsed && (
        <div className="mt-4 transition-all">
          {items.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-2">
              {items.map(x => (
                <div key={x.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between gap-3 hover:border-slate-700 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{x.title}</p>
                    <p className="text-xs text-cyan-400 mt-0.5">{recurringMeetingSummary(x)} · {x.startTime}{x.endTime ? `–${x.endTime}` : ''}</p>
                    <p className="text-[11px] text-slate-500 mt-1 capitalize">{x.type.replace('_',' ')}{x.location ? ` · ${x.location}` : ''}</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm('Stop this recurring event? Existing occurrences remain.')) {
                        try {
                          await deleteDoc(doc(db, 'recurringMeetingTemplates', x.id));
                        } catch (e) {
                          console.error(e);
                          setError('Could not stop this recurring event.');
                        }
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-red-400 shrink-0 transition-colors"
                    title="Delete recurring event"
                  >
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-xs text-slate-500">
              No recurring classes or meetings scheduled yet. Click "+ Add recurring event" to set one up.
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={create} className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Add recurring event</h3>
                <p className="text-xs text-slate-500">Set it once; Hub-Mind keeps your calendar populated.</p>
              </div>
              <button type="button" onClick={() => { reset(); setOpen(false); setError(''); }} className="text-slate-500 hover:text-white">
                <X/>
              </button>
            </div>
            {error && <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}</div>}
            <input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. JDI Music Class" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white"/>
            <div className="grid grid-cols-2 gap-3">
              <select value={type} onChange={e=>setType(e.target.value as any)} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white"><option value="class">Class</option><option value="meeting">Meeting</option><option value="appointment">Appointment</option><option value="school_event">School event</option><option value="other">Other</option></select>
              <select value={frequency} onChange={e=>setFrequency(e.target.value as any)} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white"><option value="weekly">Every week</option><option value="daily">Every day</option><option value="monthly">Every month</option></select>
            </div>
            {frequency==='weekly' && <div><label className="text-xs font-medium text-slate-400 block mb-2">Repeats on</label><div className="grid grid-cols-7 gap-1.5">{days.map((d,i)=><button type="button" key={d} onClick={()=>toggleDay(i)} className={`rounded-lg py-2 text-xs font-bold border ${selectedDays.includes(i)?'bg-teal-500 text-slate-950 border-teal-400':'bg-slate-950 text-slate-500 border-slate-800'}`}>{d}</button>)}</div><p className="text-[11px] text-slate-500 mt-2">{selectedDays.length ? selectedDays.map(i=>fullDays[i]).join(', ') : 'Select at least one day'}</p></div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 block mb-1">Start time</label><input required type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"/></div>
              <div><label className="text-xs text-slate-400 block mb-1">End time</label><input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 block mb-1">Starts</label><input required type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"/></div>
              <div><label className="text-xs text-slate-400 block mb-1">Ends (optional)</label><input type="date" value={endDate} min={startDate} onChange={e=>setEndDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"/></div>
            </div>
            <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Location or meeting room (optional)" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white"/>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Notes (optional)" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white min-h-20"/>
            <button disabled={saving || (frequency==='weekly' && selectedDays.length===0)} className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer">{saving?'Saving…':'Create recurring event'}</button>
          </form>
        </div>
      )}
    </section>
  );
}
