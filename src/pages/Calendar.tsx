import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { collection, query, getDocs, where, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Task, Meeting } from '../types';
import { getLocalTasks, setLocalTasks, upsertLocalTask, getLocalMeetings, setLocalMeetings, upsertLocalMeeting } from '../lib/localWorkspaceStore';
import { Link } from 'react-router-dom';
import { 
  Loader2, ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  CheckSquare, X, Clock, MapPin, Tag, ListFilter, CalendarDays, CheckCircle2,
  AlertCircle, Globe, Link2, Unlink
} from 'lucide-react';
import { safeParseISO, safeFormat } from "../lib/dateUtils";
import { materializeRecurringMeetings } from "../lib/recurringMeetings";
import { RecurringSchedulePanel } from "../components/RecurringSchedulePanel";
import { 
  connectGoogleCalendarOnce, 
  disconnectGoogleCalendar, 
  isGoogleCalendarConnected, 
  getGoogleCalendarConnectionInfo 
} from "../lib/googleCalendar";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, isToday
} from 'date-fns';
import * as Popover from '@radix-ui/react-popover';

type CalendarViewMode = 'month' | 'agenda';
type FilterType = 'all' | 'meetings' | 'tasks';

export function Calendar() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>(() => getLocalTasks());
  const [meetings, setMeetings] = useState<Meeting[]>(() => getLocalMeetings());
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [filterType, setFilterType] = useState<FilterType>('all');

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [formType, setFormType] = useState<'task' | 'meeting' | null>(null);
  
  // Form states
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [projectsList, setProjectsList] = useState<{id: string, name: string}[]>([]);
  const [clients, setClients] = useState<{id: string, name: string}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Google Calendar one-time connection states
  const [gcalInfo, setGcalInfo] = useState(() => getGoogleCalendarConnectionInfo());
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalMessage, setGcalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setGcalInfo(getGoogleCalendarConnectionInfo());
  }, []);

  const handleConnectGcal = async () => {
    setGcalConnecting(true);
    setGcalMessage(null);
    try {
      const res = await connectGoogleCalendarOnce();
      if (res.success) {
        setGcalInfo(getGoogleCalendarConnectionInfo());
        setGcalMessage({ type: 'success', text: res.message });
      } else {
        setGcalMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setGcalMessage({ type: 'error', text: err?.message || 'Failed to connect Google Calendar.' });
    } finally {
      setGcalConnecting(false);
    }
  };

  const handleDisconnectGcal = async () => {
    if (confirm('Disconnect Google Calendar from Hub-Mind?')) {
      await disconnectGoogleCalendar();
      setGcalInfo({ connected: false, email: null, expiresAt: 0 });
      setGcalMessage({ type: 'success', text: 'Google Calendar disconnected.' });
    }
  };

  useEffect(() => {
    if (!profile) return;
    const fetchClients = async () => {
      try {
        const pSnap = await getDocs(collection(db, 'projects'));
        if (pSnap && pSnap.docs.length > 0) {
          setProjectsList(pSnap.docs.map(d => ({id: d.id, name: d.data().name})));
        }
        const snap = await getDocs(collection(db, 'clients'));
        if (snap && snap.docs.length > 0) {
          setClients(snap.docs.map(d => ({id: d.id, name: d.data().name})));
        }
      } catch (err) {
        console.warn("Could not load clients/projects for calendar:", err);
      }
    };
    fetchClients();
    // Populate upcoming occurrences from the recurring schedule templates.
    materializeRecurringMeetings(90).catch(err => console.warn('Recurring meetings:', err));

    const tasksQuery = profile.role === 'admin'
      ? query(collection(db, 'tasks'))
      : query(collection(db, 'tasks'), where('assignedTo', '==', profile.id));
      
    const meetingsQuery = query(collection(db, 'meetings'));

    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      if (snap.docs.length > 0) {
        const loadedTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        setLocalTasks(loadedTasks);
        setTasks(loadedTasks);
      } else {
        setTasks(getLocalTasks());
      }
      setLoading(false);
    }, (error) => {
      console.warn("Tasks listener warning, fallback to local storage:", error);
      setTasks(getLocalTasks());
      setLoading(false);
    });

    const unsubMeetings = onSnapshot(meetingsQuery, (snap) => {
      if (snap.docs.length > 0) {
        const loadedMeetings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Meeting));
        setLocalMeetings(loadedMeetings);
        setMeetings(loadedMeetings);
      } else {
        setMeetings(getLocalMeetings());
      }
      setLoading(false);
    }, (error) => {
      console.warn("Meetings listener warning, fallback to local storage:", error);
      setMeetings(getLocalMeetings());
      setLoading(false);
    });

    return () => {
      unsubTasks();
      unsubMeetings();
    };
  }, [profile]);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  // Full grid covering complete 7-day rows from start of week to end of week
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd
  });

  const handleCreate = async () => {
    if (!selectedDay || !title.trim() || !profile) return;
    setIsSubmitting(true);
    try {
      if (formType === 'task') {
        const deadline = new Date(selectedDay);
        const newTask: Task = {
          id: `task-${Date.now()}`,
          title,
          description: '',
          priority,
          status: 'in_progress',
          assignedTo: profile.id,
          assignedToUsername: profile.username,
          ownerId: profile.id,
          clientId: clientId || undefined,
          projectId: projectId || undefined,
          createdBy: profile.id,
          deadline: deadline.toISOString(),
          checklist: [],
          comments: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        upsertLocalTask(newTask);
        setTasks(prev => [newTask, ...prev]);

        addDoc(collection(db, 'tasks'), {
          title,
          description: '',
          priority,
          status: 'pending',
          assignedTo: profile.id,
          clientId: clientId || null,
          projectId: projectId || null,
          createdBy: profile.id,
          deadline: deadline.toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).catch(e => console.warn('Cloud task sync pending:', e));
      } else if (formType === 'meeting') {
        const [hours, minutes] = time.split(':').map(Number);
        const meetingDate = new Date(selectedDay);
        meetingDate.setHours(hours || 9, minutes || 0, 0, 0);
        
        const newMeeting: Meeting = {
          id: `meeting-${Date.now()}`,
          title,
          notesRaw: title,
          date: meetingDate.toISOString(),
          status: 'scheduled',
          attendees: [],
          actionPoints: [],
          generatedDocs: [],
          ownerId: profile.id,
          projectId: projectId || undefined,
          createdAt: new Date().toISOString()
        };
        upsertLocalMeeting(newMeeting);
        setMeetings(prev => [newMeeting, ...prev]);

        addDoc(collection(db, 'meetings'), {
          notesRaw: title,
          date: meetingDate.toISOString(),
          attendees: [],
          actionPoints: [],
          generatedDocs: [],
          ownerId: profile.id,
          projectId: projectId || null,
          createdAt: new Date().toISOString()
        }).catch(e => console.warn('Cloud meeting sync pending:', e));
      }
      
      setSelectedDay(null);
      setFormType(null);
      setTitle('');
    } catch (err) {
      console.error("Error creating calendar event:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openForm = (type: 'task' | 'meeting') => {
    setFormType(type);
    setTitle('');
    setTime('09:00');
    setClientId('');
    setProjectId('');
    setPriority('medium');
  };

  // Filter items for agenda view
  const filteredEvents = React.useMemo(() => {
    const list: { type: 'meeting' | 'task'; date: Date; raw: Meeting | Task; id: string; title: string }[] = [];
    
    if (filterType === 'all' || filterType === 'meetings') {
      meetings.forEach(m => {
        if (m.date) {
          list.push({
            type: 'meeting',
            date: safeParseISO(m.date),
            raw: m,
            id: m.id,
            title: m.notesRaw.split('\n')[0] || 'Meeting'
          });
        }
      });
    }

    if (filterType === 'all' || filterType === 'tasks') {
      tasks.forEach(t => {
        if (t.deadline) {
          list.push({
            type: 'task',
            date: safeParseISO(t.deadline),
            raw: t,
            id: t.id,
            title: t.title
          });
        }
      });
    }

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [meetings, tasks, filterType]);

  if (loading && tasks.length === 0 && meetings.length === 0) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
        <p className="text-sm text-slate-400">Loading your schedule...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5 flex flex-col min-h-0 pb-20 md:pb-8 relative">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Calendar</h1>
              <p className="text-xs md:text-sm text-slate-400">Deadlines, client sessions, and scheduled meetings</p>
            </div>
          </div>
        </div>
        
        {/* Navigation & View Switcher Bar */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          {/* Filter Pills */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                filterType === 'all' ? 'bg-teal-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({tasks.length + meetings.length})
            </button>
            <button
              onClick={() => setFilterType('meetings')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                filterType === 'meetings' ? 'bg-teal-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Meetings ({meetings.length})
            </button>
            <button
              onClick={() => setFilterType('tasks')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                filterType === 'tasks' ? 'bg-teal-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tasks ({tasks.length})
            </button>
          </div>

          {/* Month Stepper & Today Button */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button 
              onClick={goToToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Jump to Current Date"
            >
              Today
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <button onClick={prevMonth} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors" title="Previous Month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-white min-w-[130px] text-center text-sm">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button onClick={nextMonth} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors" title="Next Month">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                viewMode === 'month' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Month View
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                viewMode === 'agenda' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Agenda
            </button>
          </div>

          {/* Google Calendar One-Time Sync Trigger */}
          {gcalInfo.connected ? (
            <div className="flex items-center gap-2 bg-teal-950/40 border border-teal-800/60 rounded-xl px-3 py-1.5 text-xs text-teal-300">
              <Globe className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline font-mono text-[11px] truncate max-w-[150px]">{gcalInfo.email || 'Google Cal Connected'}</span>
              <button
                type="button"
                onClick={handleDisconnectGcal}
                title="Disconnect Google Calendar"
                className="text-slate-400 hover:text-rose-400 ml-1 p-0.5"
              >
                <Unlink className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectGcal}
              disabled={gcalConnecting}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-700 hover:border-teal-500/60 text-slate-200 hover:text-teal-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {gcalConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" /> : <Link2 className="w-3.5 h-3.5 text-teal-400" />}
              <span>{gcalConnecting ? 'Connecting...' : 'Connect Google Cal'}</span>
            </button>
          )}
        </div>
      </div>

      {gcalMessage && (
        <div className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2.5 border animate-in fade-in duration-150 ${
          gcalMessage.type === 'success' 
            ? 'bg-teal-950/50 border-teal-800 text-teal-300' 
            : 'bg-rose-950/50 border-rose-800 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {gcalMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{gcalMessage.text}</span>
          </div>
          <button onClick={() => setGcalMessage(null)} className="p-1 text-slate-400 hover:text-slate-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Recurring Schedule Panel - Visible to all users so they can manage their classes and routines */}
      <RecurringSchedulePanel />

      {/* Main Calendar Card */}
      {viewMode === 'month' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col flex-1">
          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/60 shrink-0">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          
          {/* 7-column Calendar Grid */}
          <div className="grid grid-cols-7 divide-y divide-x divide-slate-800/80 overflow-y-auto flex-1">
            {calendarDays.map(day => {
              const isCurrentMonthDay = isSameMonth(day, currentDate);
              const isTodayDay = isToday(day);
              
              const dayTasks = tasks.filter(t => t.deadline && isSameDay(safeParseISO(t.deadline), day));
              const dayMeetings = meetings.filter(m => m.date && isSameDay(safeParseISO(m.date), day));
              
              const visibleTasks = (filterType === 'all' || filterType === 'tasks') ? dayTasks : [];
              const visibleMeetings = (filterType === 'all' || filterType === 'meetings') ? dayMeetings : [];
              const totalItems = visibleMeetings.length + visibleTasks.length;

              const isSelected = selectedDay && isSameDay(selectedDay, day);
              
              return (
                <Popover.Root 
                  key={day.toISOString()} 
                  open={isSelected || false} 
                  onOpenChange={(open) => {
                    if (open) {
                      setSelectedDay(day);
                      setFormType(null);
                    } else {
                      setSelectedDay(null);
                    }
                  }}
                >
                  <Popover.Trigger asChild>
                    <button 
                      className={`min-h-[105px] md:min-h-[125px] p-2 md:p-2.5 transition-all text-left flex flex-col items-stretch justify-start group relative focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-400 ${
                        !isCurrentMonthDay ? 'bg-slate-950/40 text-slate-600 opacity-60' : 'hover:bg-slate-800/40'
                      } ${isTodayDay ? 'bg-teal-500/5' : ''}`}
                    >
                      {/* Day Number Header & Dot Indicators */}
                      <div className="flex justify-between items-center mb-1.5">
                        <div className={`text-xs font-bold w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-lg transition-transform ${
                          isTodayDay 
                            ? 'bg-teal-400 text-slate-950 font-black shadow-md shadow-teal-500/30 ring-2 ring-teal-400/50' 
                            : isCurrentMonthDay 
                              ? 'text-slate-300 group-hover:text-white' 
                              : 'text-slate-600'
                        }`}>
                          {format(day, 'd')}
                        </div>
                        
                        {/* Event Count Dot Badges for quick scan */}
                        <div className="flex items-center gap-1">
                          {visibleMeetings.length > 0 && (
                            <span 
                              className="w-2 h-2 rounded-full bg-cyan-400" 
                              title={`${visibleMeetings.length} Meeting(s)`} 
                            />
                          )}
                          {visibleTasks.length > 0 && (
                            <span 
                              className="w-2 h-2 rounded-full bg-emerald-400" 
                              title={`${visibleTasks.length} Task(s)`} 
                            />
                          )}
                        </div>
                      </div>
                      
                      {/* Desktop Events Stack */}
                      <div className="space-y-1 flex-1 overflow-hidden">
                        {/* Render Meetings */}
                        {visibleMeetings.slice(0, 2).map(m => (
                          <div 
                            key={m.id} 
                            className={`text-[10px] md:text-[11px] px-1.5 py-0.5 md:py-1 rounded-md border font-medium truncate flex items-center gap-1 ${
                              m.status === 'in_session' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' :
                              m.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                              m.status === 'canceled' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
                              'bg-cyan-950/40 text-cyan-200 border-cyan-800/40'
                            }`}
                          >
                            <Clock className="w-2.5 h-2.5 shrink-0 text-cyan-400" />
                            <span className="shrink-0 text-[9px] opacity-80">{safeFormat(m.date, 'h:mma')}</span>
                            <span className="truncate">{m.notesRaw.split('\n')[0] || 'Meeting'}</span>
                          </div>
                        ))}

                        {/* Render Tasks */}
                        {visibleTasks.slice(0, Math.max(1, 3 - visibleMeetings.slice(0, 2).length)).map(t => (
                          <div 
                            key={t.id} 
                            className={`text-[10px] md:text-[11px] px-1.5 py-0.5 md:py-1 rounded-md border font-medium truncate flex items-center gap-1 ${
                              t.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 line-through opacity-70' :
                              t.priority === 'urgent' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
                              t.priority === 'high' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                              'bg-slate-800 text-slate-300 border-slate-700/60'
                            }`}
                          >
                            <CheckSquare className="w-2.5 h-2.5 shrink-0 text-emerald-400" />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}

                        {/* +N More Counter */}
                        {totalItems > 3 && (
                          <div className="text-[10px] text-teal-400 font-semibold px-1 py-0.5 hover:underline">
                            +{totalItems - 3} more items
                          </div>
                        )}
                      </div>
                    </button>
                  </Popover.Trigger>

                  {/* Day Detail & Add Popover */}
                  <Popover.Portal>
                    <Popover.Content 
                      side="bottom"
                      align="center"
                      avoidCollisions={true} 
                      sideOffset={8} 
                      collisionPadding={16}
                      className="z-50 w-[calc(100vw-32px)] max-w-sm sm:w-88 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 outline-none"
                    >
                      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
                        <div>
                          <h3 className="font-bold text-white text-base">
                            {format(day, 'EEEE, MMMM d')}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}, {dayMeetings.length} meeting{dayMeetings.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <Popover.Close className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
                          <X className="w-4 h-4" />
                        </Popover.Close>
                      </div>

                      <div className="p-4 max-h-[60vh] overflow-y-auto">
                        {!formType ? (
                          <div className="space-y-4">
                            {dayTasks.length > 0 || dayMeetings.length > 0 ? (
                              <div className="space-y-2.5">
                                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                  Scheduled Events & Deadlines
                                </h4>

                                {dayMeetings.map(m => (
                                  <Link 
                                    to={`/meetings/${m.id}`} 
                                    key={m.id} 
                                    className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors group"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <CalendarIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                                        <p className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">
                                          {m.notesRaw.split('\n')[0] || 'Meeting Session'}
                                        </p>
                                      </div>
                                      <span className="text-xs font-mono font-bold text-cyan-300 shrink-0">
                                        {safeFormat(m.date, 'h:mm a')}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                        m.status === 'in_session' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' :
                                        m.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                                        m.status === 'canceled' ? 'bg-red-500/15 text-red-300 border border-red-500/30' :
                                        'bg-slate-800 text-slate-300 border border-slate-700'
                                      }`}>
                                        {(m.status || 'scheduled').replace('_', ' ')}
                                      </span>
                                    </div>
                                  </Link>
                                ))}

                                {dayTasks.map(t => (
                                  <Link 
                                    to={`/tasks/${t.id}`} 
                                    key={t.id} 
                                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors group"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">
                                          {t.title}
                                        </p>
                                        <span className={`text-[10px] font-semibold uppercase ${
                                          t.priority === 'urgent' ? 'text-red-400' :
                                          t.priority === 'high' ? 'text-amber-400' : 'text-slate-400'
                                        }`}>
                                          Priority: {t.priority || 'medium'}
                                        </span>
                                      </div>
                                    </div>
                                    <span className="text-[11px] font-semibold text-slate-400 capitalize">
                                      {t.status.replace('_', ' ')}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-6">
                                <CalendarDays className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                                <p className="text-sm text-slate-400">No events or deadlines for this date.</p>
                              </div>
                            )}

                            {/* Quick Add Action Buttons */}
                            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-800">
                              <button 
                                onClick={() => openForm('task')}
                                className="flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold px-3 py-2.5 rounded-xl transition-colors text-xs"
                              >
                                <Plus className="w-4 h-4 text-emerald-400" /> New Task
                              </button>
                              <button 
                                onClick={() => openForm('meeting')}
                                className="flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold px-3 py-2.5 rounded-xl transition-colors text-xs"
                              >
                                <Plus className="w-4 h-4 text-cyan-400" /> New Meeting
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3.5">
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
                              <button onClick={() => setFormType(null)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800">
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <h4 className="text-sm font-bold text-white">
                                Create New {formType === 'task' ? 'Task' : 'Meeting'}
                              </h4>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">
                                {formType === 'task' ? 'Task Title' : 'Meeting Title / Agenda'}
                              </label>
                              <input 
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={formType === 'task' ? "e.g. Complete Student Audit" : "e.g. Executive Board Sync"}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-400"
                                autoFocus
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                                <input 
                                  type="date"
                                  value={format(selectedDay, 'yyyy-MM-dd')}
                                  onChange={e => {
                                    const newDate = safeParseISO(e.target.value);
                                    if (!isNaN(newDate.getTime())) {
                                      setSelectedDay(newDate);
                                    }
                                  }}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-400 [color-scheme:dark]"
                                />
                              </div>
                              
                              {formType === 'meeting' ? (
                                <div>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Time</label>
                                  <input 
                                    type="time"
                                    value={time}
                                    onChange={e => setTime(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-400 [color-scheme:dark]"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                                  <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value as any)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-400"
                                  >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                  </select>
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Related Project (Optional)</label>
                              <select 
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-400 text-xs"
                              >
                                <option value="">None</option>
                                {projectsList.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>

                            {formType === 'task' && (
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Related Client (Optional)</label>
                                <select 
                                  value={clientId}
                                  onChange={(e) => setClientId(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-400 text-xs"
                                >
                                  <option value="">None</option>
                                  {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <button 
                              onClick={handleCreate}
                              disabled={!title.trim() || isSubmitting}
                              className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-colors text-xs mt-3 shadow-lg shadow-teal-500/20"
                            >
                              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                              Save {formType === 'task' ? 'Task' : 'Meeting'}
                            </button>
                          </div>
                        )}
                      </div>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda / Chronological Schedule View */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-teal-400" />
              Upcoming Schedule & Deadlines
            </h2>
            <span className="text-xs text-slate-400">
              {filteredEvents.length} scheduled item{filteredEvents.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredEvents.length > 0 ? (
            <div className="divide-y divide-slate-800/80">
              {filteredEvents.map(item => (
                <div key={`${item.type}-${item.id}`} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl mt-0.5 shrink-0 ${
                      item.type === 'meeting' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {item.type === 'meeting' ? <CalendarIcon className="w-5 h-5" /> : <CheckSquare className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-200 text-sm group-hover:text-white">
                        {item.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1 font-mono text-teal-300">
                          <Clock className="w-3.5 h-3.5" />
                          {safeFormat(item.date, 'EEEE, MMM d, yyyy • h:mm a')}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="uppercase font-bold text-[10px] text-slate-400">
                          {item.type}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-11 sm:pl-0">
                    <Link
                      to={item.type === 'meeting' ? `/meetings/${item.id}` : `/tasks/${item.id}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CalendarDays className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-40" />
              <h3 className="text-base font-semibold text-slate-300">No scheduled items found</h3>
              <p className="text-xs text-slate-400 mt-1">Try changing filters or select a date on the month view to add items.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
