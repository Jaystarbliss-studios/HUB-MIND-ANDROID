import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useLoading } from '../lib/loadingContext';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Task, Meeting, Client, DocumentInfo, InboxItem, ActivityLog } from '../types';
import { getLocalTasks, getLocalProjects, getLocalMeetings, getLocalClients } from '../lib/localWorkspaceStore';
import { safeParseISO, safeFormat } from "../lib/dateUtils";
import { isToday, isBefore, startOfDay, parseISO, format, startOfWeek, endOfWeek } from 'date-fns';
import { CheckCircle2, Clock, Calendar as CalendarIcon, FileText, Loader2, Bell, Users, Inbox, Activity, Check, Clock3, Bot } from 'lucide-react';
import { setDoc, doc, getDoc, addDoc } from 'firebase/firestore';
import { getLocalDocsMap, setLocalDocsMap } from '../lib/offlineSync';
import { Link } from 'react-router-dom';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getGreeting(name: string) {
  const hour = new Date().getHours();
  
  if (hour >= 0 && hour < 5) {
    const greetings = [
      `Welcome Midnight Owl, ${name}!`,
      `Working late, ${name}?`,
      `The world sleeps, but you conquer, ${name}.`,
      `Early wee hours, ${name}!`,
      `Still awake, ${name}?`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  } else if (hour >= 5 && hour < 12) {
    const greetings = [
      `GOOD MORNING, ${name}!`,
      `Early work, ${name}?`,
      `Rise and shine, ${name}!`,
      `Ready to seize the day, ${name}?`,
      `A fresh start, ${name}!`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  } else if (hour >= 12 && hour < 17) {
    const greetings = [
      `Afternoon! ${name}.`,
      `Keep up the momentum, ${name}!`,
      `Hope your day is going well, ${name}.`,
      `Afternoon hustle, ${name}!`,
      `Halfway there, ${name}!`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  } else if (hour >= 17 && hour < 21) {
    const greetings = [
      `A cool evening, ${name}.`,
      `Good evening, ${name}!`,
      `Winding down the day, ${name}?`,
      `Evening productivity, ${name}!`,
      `Hope you had a great day, ${name}.`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  } else {
    const greetings = [
      `Good night, ${name}!`,
      `Late night hustle, ${name}?`,
      `Nighttime productivity, ${name}!`,
      `Almost time to rest, ${name}.`,
      `Wrapping up the night, ${name}?`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
}

export function Dashboard() {
  const { user, profile } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const [loading, setLoading] = useState(true);

  // Data states initialized from durable local store for zero-latency initial paint
  const [urgentTasksCount, setUrgentTasksCount] = useState(() => {
    const local = getLocalTasks();
    return local.filter(t => t.priority === 'urgent' && t.status !== 'completed' && t.status !== 'archived').length;
  });
  const [todayMeetingsCount, setTodayMeetingsCount] = useState(() => {
    const local = getLocalMeetings();
    return local.filter(m => isToday(safeParseISO(m.date))).length;
  });
  const [clientsWaitingCount, setClientsWaitingCount] = useState(() => {
    const local = getLocalClients();
    return local.filter(c => c.status === 'lead').length;
  });
  const [inboxItemsCount, setInboxItemsCount] = useState(0);
  const [tasksOverdueCount, setTasksOverdueCount] = useState(() => {
    const local = getLocalTasks();
    const startOfToday = startOfDay(new Date());
    return local.filter(t => t.deadline && isBefore(safeParseISO(t.deadline), startOfToday) && t.status !== 'completed' && t.status !== 'archived').length;
  });
  const [meetingsThisWeekCount, setMeetingsThisWeekCount] = useState(() => {
    const local = getLocalMeetings();
    const today = new Date();
    const weekStart = startOfWeek(today);
    const weekEnd = endOfWeek(today);
    return local.filter(m => {
      const d = safeParseISO(m.date);
      return d >= weekStart && d <= weekEnd;
    }).length;
  });
  const [totalTasksCount, setTotalTasksCount] = useState(() => getLocalTasks().length);
  const [completedTasksCount, setCompletedTasksCount] = useState(() => getLocalTasks().filter(t => t.status === 'completed').length);
  const [totalProjectsCount, setTotalProjectsCount] = useState(() => getLocalProjects().length);
  const [activeProjectsCount, setActiveProjectsCount] = useState(() => getLocalProjects().filter(p => p.status === 'active').length);
  const [followUpsDueCount, setFollowUpsDueCount] = useState(0);
  const [followUpsWaitingCount, setFollowUpsWaitingCount] = useState(0);
  const [documentsAttentionCount, setDocumentsAttentionCount] = useState(0);
  const [paymentsAwaitingCount, setPaymentsAwaitingCount] = useState(0);
  const [weekTasksCount, setWeekTasksCount] = useState(() => {
    const local = getLocalTasks();
    const today = new Date();
    const weekStart = startOfWeek(today);
    const weekEnd = endOfWeek(today);
    return local.filter(t => t.deadline && safeParseISO(t.deadline) >= weekStart && safeParseISO(t.deadline) <= weekEnd && t.status !== 'archived').length;
  });
  const [reportText, setReportText] = useState('');
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [scheduleSending, setScheduleSending] = useState(false);
  
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [greeting, setGreeting] = useState('Welcome!');

  useEffect(() => {
    const displayName = profile?.displayName || profile?.preferredName || profile?.name;
    if (displayName) {
      const firstName = displayName.split(' ')[0];
      setGreeting(getGreeting(firstName));
    }
  }, [profile?.displayName, profile?.preferredName, profile?.name]);

  useEffect(() => {
    if (!profile) return;
    startLoading('dashboard');

    const unsubscribers: (() => void)[] = [];

    try {
      // 1. Real-time Tasks Listener
      const tasksQuery = profile.role === 'admin' 
         ? query(collection(db, 'tasks'))
         : query(collection(db, 'tasks'), where('assignedTo', '==', profile.id));

      const unsubTasks = onSnapshot(tasksQuery, (tasksSnap) => {
        const today = new Date();
        const startOfToday = startOfDay(today);
        const weekStart = startOfWeek(today);
        const weekEnd = endOfWeek(today);
        let urgentTasks = 0;
        let overdueTasks = 0;
        let completedTasks = 0;
        tasksSnap.docs.forEach(doc => {
          const t = doc.data() as Task;
          if (t.status === 'completed') {
            completedTasks++;
          } else if (t.status !== 'archived') {
            if (t.priority === 'urgent') urgentTasks++;
            if (t.deadline && isBefore(safeParseISO(t.deadline), startOfToday)) overdueTasks++;
          }
        });
        setUrgentTasksCount(urgentTasks);
        setTasksOverdueCount(overdueTasks);
        setTotalTasksCount(tasksSnap.docs.length);
        setCompletedTasksCount(completedTasks);
        setWeekTasksCount(tasksSnap.docs.filter(d => {
          const t = d.data() as Task;
          return t.deadline && safeParseISO(t.deadline) >= weekStart && safeParseISO(t.deadline) <= weekEnd && t.status !== 'archived';
        }).length);
        setLoading(false);
        stopLoading('dashboard');
      }, (e) => {
        console.warn('Dashboard tasks subscription fallback:', e);
        setLoading(false);
        stopLoading('dashboard');
      });
      unsubscribers.push(unsubTasks);

      // 2. Real-time Projects Listener
      const unsubProjects = onSnapshot(collection(db, 'projects'), (projSnap) => {
        setTotalProjectsCount(projSnap.docs.length);
        const active = projSnap.docs.filter(d => (d.data() as any).status === 'active').length;
        setActiveProjectsCount(active);
      }, (e) => console.warn('Dashboard projects subscription fallback:', e));
      unsubscribers.push(unsubProjects);

      // 3. Real-time Meetings Listener
      const meetingsQuery = query(collection(db, 'meetings'));
      const unsubMeetings = onSnapshot(meetingsQuery, (meetingsSnap) => {
        const today = new Date();
        const weekStart = startOfWeek(today);
        const weekEnd = endOfWeek(today);
        let meetingsToday = 0;
        let meetingsWeek = 0;
        meetingsSnap.docs.forEach(doc => {
          const m = doc.data() as Meeting;
          const mDate = safeParseISO(m.date);
          if (isToday(mDate)) meetingsToday++;
          if (mDate >= weekStart && mDate <= weekEnd) meetingsWeek++;
        });
        setTodayMeetingsCount(meetingsToday);
        setMeetingsThisWeekCount(meetingsWeek);
      }, (e) => console.warn('Dashboard meetings subscription fallback:', e));
      unsubscribers.push(unsubMeetings);

      // 4. Real-time Clients Waiting Listener
      const clientsQuery = query(collection(db, 'clients'), where('status', '==', 'lead'));
      const unsubClients = onSnapshot(clientsQuery, (clientsSnap) => {
        setClientsWaitingCount(clientsSnap.docs.length);
      }, (e) => console.warn('Dashboard clients subscription fallback:', e));
      unsubscribers.push(unsubClients);

      // 5. Real-time Inbox Listener
      const inboxQuery = profile.role === 'admin'
         ? query(collection(db, 'inbox'), where('status', '==', 'unprocessed'))
         : query(collection(db, 'inbox'), where('status', '==', 'unprocessed'), where('createdBy', '==', profile.id));
      const unsubInbox = onSnapshot(inboxQuery, (inboxSnap) => {
        setInboxItemsCount(inboxSnap.docs.length);
      }, (e) => console.warn('Dashboard inbox subscription fallback:', e));
      unsubscribers.push(unsubInbox);

      // 6. Real-time Follow-Ups Listener
      const followUpsQuery = profile.role === 'admin'
        ? query(collection(db, 'followUps'))
        : query(collection(db, 'followUps'), where('ownerId', '==', profile.id));
      const unsubFollowUps = onSnapshot(followUpsQuery, (followUpsSnap) => {
        const active = followUpsSnap.docs.filter(d => !['resolved', 'cancelled'].includes((d.data() as any).status));
        const now = Date.now();
        setFollowUpsDueCount(active.filter(d => new Date((d.data() as any).dueAt).getTime() <= now).length);
        setFollowUpsWaitingCount(active.filter(d => (d.data() as any).status === 'waiting').length);
      }, (e) => console.warn('Dashboard follow-ups subscription fallback:', e));
      unsubscribers.push(unsubFollowUps);

      // 7. Real-time Activity Logs Listener
      const activityQuery = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(10));
      const unsubActivity = onSnapshot(activityQuery, (activitySnap) => {
        setRecentActivity(activitySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
      }, (e) => console.warn('Dashboard activity subscription fallback:', e));
      unsubscribers.push(unsubActivity);

      // 8. One-time reads for Documents Attention & Notes
      getDocs(collection(db, 'documents')).then((docsSnap) => {
        const attention = docsSnap.docs.filter(d => {
          const x = d.data() as any;
          return x.status === 'pending_review' || x.status === 'needs_review' || x.reviewRequired === true;
        }).length;
        setDocumentsAttentionCount(attention);
      }).catch((e) => console.warn('Dashboard documents attention warning:', e));

      const paymentReads = profile.role === 'admin'
        ? [getDocs(collection(db, 'payments'))]
        : [
            getDocs(query(collection(db, 'payments'), where('ownerId', '==', profile.id))),
            getDocs(query(collection(db, 'payments'), where('userId', '==', profile.id))),
          ];
      Promise.all(paymentReads).then((paymentSnapshots) => {
        const uniquePayments = new Map<string, any>();
        paymentSnapshots.forEach(snapshot => snapshot.docs.forEach(payment => uniquePayments.set(payment.id, payment.data())));
        const awaiting = Array.from(uniquePayments.values()).filter(payment =>
          ['pending', 'awaiting_confirmation', 'awaiting_payment', 'pending_confirmation'].includes(payment.status)
        ).length;
        setPaymentsAwaitingCount(awaiting);
      }).catch((e) => console.warn('Dashboard payments query fallback:', e));

      getDoc(doc(db, 'users', profile.id, 'private', 'quickNotes')).then((notesDoc) => {
        if (notesDoc.exists()) {
          setNotes(notesDoc.data().content || '');
        }
      }).catch((e) => console.warn('Dashboard quick notes warning:', e));

    } catch (err) {
      console.error('Error setting up dashboard subscriptions:', err);
      setLoading(false);
      stopLoading('dashboard');
    }

    return () => {
      unsubscribers.forEach(unsub => {
        try { unsub(); } catch {}
      });
      stopLoading('dashboard');
    };
  }, [profile, startLoading, stopLoading]);

  const sendTodayScheduleToWhatsApp = async () => {
    if (!profile) return;
    setScheduleSending(true);
    try {
      const today = new Date();
      const [tasksSnap, meetingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), profile.role === 'admin' ? undefined : where('assignedTo', '==', profile.id) as any)),
        getDocs(collection(db, 'meetings'))
      ]);
      const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        .filter((t: any) => t.deadline && isToday(safeParseISO(t.deadline)));
      const meetings = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        .filter((m: any) => m.date && isToday(safeParseISO(m.date)));
      const lines = [
        `Schedule for Today - ${format(today, 'dd MMMM yyyy')}`,
        '',
        'MEETINGS:',
        ...(meetings.length ? meetings.sort((a:any,b:any)=>safeParseISO(a.date).getTime()-safeParseISO(b.date).getTime()).map((m:any)=>`• ${safeFormat(m.date, 'h:mma')} — ${(m.notesRaw || 'Meeting').replace(/\\\\r?\\\\n|\\n|\\r/g, ' ').trim()}`) : ['• No meetings scheduled']),
        '',
        'TASKS:',
        ...(tasks.length ? tasks.sort((a:any,b:any)=>safeParseISO(a.deadline).getTime()-safeParseISO(b.deadline).getTime()).map((t:any)=>`• ${t.title}${t.priority ? ` [${t.priority}]` : ''}`) : ['• No tasks due today']),
        '',
        '— Sent from Hub-Mind'
      ];
      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
    } finally {
      setTimeout(() => setScheduleSending(false), 700);
    }
  };

  const saveDailyReport = async () => {
    if (!profile || !reportText.trim()) return;
    setReportSaving(true);
    setReportSaved(false);
    try {
      const now = new Date();
      const dateKey = format(now, 'yyyy-MM-dd');
      const formattedDate = format(now, 'dd MMMM yyyy');
      const nowIso = now.toISOString();

      // 1. Save to private dailyReports
      await setDoc(doc(db, 'users', profile.id, 'dailyReports', dateKey), {
        date: dateKey,
        authorId: profile.id,
        authorName: profile.displayName || profile.preferredName || profile.name || `@${profile.username}`,
        report: reportText.trim(),
        updatedAt: nowIso,
        snapshot: { urgentTasksCount, todayMeetingsCount, inboxItemsCount, followUpsDueCount, followUpsWaitingCount, paymentsAwaitingCount }
      }, { merge: true });

      // 2. Also save as a document in Documents workspace
      const htmlContent = reportText
        .split('\n')
        .map(line => {
          if (!line.trim()) return '<br/>';
          if (line.startsWith('•')) return `<li>${line.substring(1).trim()}</li>`;
          if (line.endsWith(':') || line.includes('DAILY REPORT')) return `<h3><strong>${line}</strong></h3>`;
          return `<p>${line}</p>`;
        })
        .join('');

      const docPayload = {
        title: `Daily Report — ${formattedDate}`,
        content: htmlContent,
        category: 'report',
        ownerId: profile.id,
        createdBy: profile.id,
        visibility: 'workspace',
        createdAt: nowIso,
        updatedAt: nowIso,
        lastEditedAt: nowIso,
        lastSavedAt: nowIso,
        version: 1,
        type: 'internal',
      };

      const docRef = await addDoc(collection(db, 'documents'), docPayload);
      const localDocs = getLocalDocsMap();
      localDocs[docRef.id] = {
        id: docRef.id,
        title: docPayload.title,
        content: htmlContent,
        updatedAt: nowIso,
        lastSavedAt: nowIso,
        lastEditedAt: nowIso,
        synced: true,
      };
      setLocalDocsMap(localDocs);

      setReportSaved(true);
    } catch (e) {
      console.error('Failed to save daily report:', e);
    } finally {
      setReportSaving(false);
    }
  };

  const generateDailyReport = async () => {
    if (!profile) return;
    setReportGenerating(true);
    setReportSaved(false);
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      const tasksQuery = profile.role === 'admin'
        ? query(collection(db, 'tasks'))
        : query(collection(db, 'tasks'), where('assignedTo', '==', profile.id));
      const [tasksSnap, followUpsSnap, meetingsSnap] = await Promise.all([
        getDocs(tasksQuery),
        getDocs(collection(db, 'followUps')),
        getDocs(collection(db, 'meetings')),
      ]);

      const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const followUps = followUpsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const meetings = meetingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const isSameDay = (value: any, date: Date) => {
        if (!value) return false;
        try { return format(safeParseISO(value), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'); } catch { return false; }
      };

      const completedToday = tasks.filter(t =>
        t.status === 'completed' &&
        (isSameDay(t.completedAt, today) || isSameDay(t.updatedAt, today) || isSameDay(t.completedDate, today))
      );
      const dueToday = tasks.filter(t =>
        t.status !== 'completed' && t.status !== 'archived' && isSameDay(t.deadline, today)
      );
      const overdueTasks = tasks.filter(t =>
        t.status !== 'completed' && t.status !== 'archived' && t.deadline && isBefore(safeParseISO(t.deadline), startOfDay(today))
      );
      const tomorrowTasks = tasks.filter(t =>
        t.status !== 'completed' && t.status !== 'archived' && isSameDay(t.deadline, tomorrow)
      );
      const waitingFollowUps = followUps.filter(f =>
        !['resolved', 'cancelled'].includes(f.status) &&
        (f.status === 'waiting' || (f.dueAt && isSameDay(f.dueAt, today)))
      );
      const decisionItems = [
        ...tasks.filter(t => t.status !== 'completed' && t.needsDecision === true),
        ...followUps.filter(f => !['resolved', 'cancelled'].includes(f.status) && (f.needsDecision === true || f.decisionRequired === true))
      ];
      const todayMeetings = meetings.filter(m => m.date && isToday(safeParseISO(m.date)));

      const section = (title: string, items: any[], empty: string, formatter: (x:any) => string) => [
        title,
        ...(items.length ? items.map(formatter) : [empty])
      ];

      const authorName = profile.preferredName || profile.displayName || profile.name || 'Jaystarbliss';
      const lines = [
        `DAILY OPERATIONAL REPORT — ${format(today, 'dd MMMM yyyy')}`,
        `Prepared for ${authorName}`,
        '',
        ...section('1. WHAT WAS COMPLETED TODAY:', completedToday, '• No items flagged as completed today.', t => `• ${t.title || 'Completed task'}`),
        '',
        ...section('2. WHAT IS PENDING & DUE:', [...dueToday, ...overdueTasks], '• All due tasks for today are clear.', t => `• ${t.title || 'Pending task'}${t.priority ? ` [${t.priority.toUpperCase()}]` : ''}`),
        '',
        ...section('3. FOLLOW-UPS & CLIENTS AWAITING:', waitingFollowUps, '• No follow-ups currently waiting.', f => `• ${f.title || f.subject || 'Follow-up item'}${f.status === 'waiting' ? ' (waiting on response)' : ''}`),
        '',
        ...section('4. WHAT NEEDS YOUR DECISION:', decisionItems, '• Nothing currently requiring your decision.', x => `• ${x.title || x.subject || 'Decision item'}`),
        '',
        ...section('5. TOMORROW & UPCOMING:', tomorrowTasks, '• No tasks scheduled for tomorrow.', t => `• ${t.title || 'Upcoming task'}`),
        '',
        '6. EXECUTIVE SUMMARY:',
        `• ${completedToday.length} task(s) completed today, ${dueToday.length + overdueTasks.length} pending, ${todayMeetings.length} meeting(s) held. Operations healthy.`,
        '',
        '— Generated by Hub-Mind'
      ];
      setReportText(lines.join('\n'));
    } catch (e) {
      console.error('Failed to generate daily report:', e);
    } finally {
      setReportGenerating(false);
    }
  };

  useEffect(() => {
    if (profile && !reportText) {
      void generateDailyReport();
    }
  }, [profile]);

  const buildDailyReportMessage = () => {
    const dateLabel = format(new Date(), 'dd MMMM yyyy');
    return [
      `JAYSTARBLISS DAILY REPORT — ${dateLabel}`,
      '',
      reportText.trim(),
      '',
      '— Sent from Hub-Mind'
    ].join('\\n');
  };

  const sendReportToWhatsApp = async () => {
    if (!reportText.trim()) return;
    setWhatsappSending(true);
    try {
      const sharedSnap = await addDoc(collection(db, 'sharedRecords'), {
        kind: 'report',
        createdBy: profile?.id || null,
        createdAt: new Date().toISOString(),
        payload: {
          title: `Daily Report — ${format(new Date(), 'dd MMMM yyyy')}`,
          report: reportText.trim(),
          date: format(new Date(), 'yyyy-MM-dd'),
          authorName: profile?.name || 'Hub-Mind'
        }
      });
      const shareUrl = new URL(`/share/report/${sharedSnap.id}`, window.location.origin).toString();
      const message = `${buildDailyReportMessage()}\n\nOpen the full report in Hub-Mind:\n${shareUrl}`;
      const encoded = encodeURIComponent(message);
      // WhatsApp's supported share URL opens the user's contact picker with the
      // report already composed. No phone number or WhatsApp API credential is stored.
      const whatsappUrl = `https://wa.me/?text=${encoded}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setTimeout(() => setWhatsappSending(false), 700);
    }
  };

  const handleSaveNotes = async () => {
    if (!profile) return;
    setSavingNotes(true);
    try {
      await setDoc(doc(db, 'users', profile.id, 'private', 'quickNotes'), {
        content: notes,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error("Error saving notes:", error);
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="mb-10">
        <h2 className="text-3xl font-bold text-white tracking-tight">{greeting}</h2>
        <p className="text-slate-400">Welcome to your Operations Hub.</p>
      </div>

      {/* Circular Progress Indicators Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
        {/* Gauge 1: Task Completion Rate */}
        {(() => {
          const taskPct = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
          const radius = 38;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (taskPct / 100) * circumference;

          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Task Completion
                </span>
                <h4 className="text-2xl font-extrabold text-white tracking-tight">{taskPct}%</h4>
                <p className="text-xs text-slate-400 mt-1">
                  {completedTasksCount} of {totalTasksCount} tasks done
                </p>
              </div>
              <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="text-slate-800"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="text-teal-400 transition-all duration-1000 ease-out"
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>
                <span className="absolute text-xs font-bold text-teal-300">{taskPct}%</span>
              </div>
            </div>
          );
        })()}

        {/* Gauge 2: Active Projects Health */}
        {(() => {
          const projPct = totalProjectsCount > 0 ? Math.round((activeProjectsCount / totalProjectsCount) * 100) : 100;
          const radius = 38;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (projPct / 100) * circumference;

          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Active Projects
                </span>
                <h4 className="text-2xl font-extrabold text-white tracking-tight">{activeProjectsCount}</h4>
                <p className="text-xs text-slate-400 mt-1">
                  {activeProjectsCount} active • {totalProjectsCount} total
                </p>
              </div>
              <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="text-slate-800"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="text-blue-400 transition-all duration-1000 ease-out"
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>
                <span className="absolute text-xs font-bold text-blue-300">{activeProjectsCount}</span>
              </div>
            </div>
          );
        })()}

        {/* Gauge 3: Deadline & Schedule Reliability */}
        {(() => {
          const reliabilityPct = tasksOverdueCount === 0 ? 100 : Math.max(10, 100 - tasksOverdueCount * 25);
          const radius = 38;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (reliabilityPct / 100) * circumference;

          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Schedule Health
                </span>
                <h4 className="text-2xl font-extrabold text-white tracking-tight">{reliabilityPct}%</h4>
                <p className="text-xs text-slate-400 mt-1">
                  {tasksOverdueCount === 0 ? '0 overdue deadlines' : `${tasksOverdueCount} overdue item(s)`}
                </p>
              </div>
              <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="text-slate-800"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className={`${
                      tasksOverdueCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                    } transition-all duration-1000 ease-out`}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>
                <span
                  className={`absolute text-xs font-bold ${
                    tasksOverdueCount > 0 ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  {reliabilityPct}%
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Today's Focus */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Today's Focus</h3>
            <button onClick={sendTodayScheduleToWhatsApp} disabled={scheduleSending} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-bold hover:bg-emerald-500/20 disabled:opacity-50" title="Share today's schedule through WhatsApp">
              {scheduleSending ? 'Opening WhatsApp…' : 'Share Today’s Schedule'}
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors cursor-pointer">
              <CheckCircle2 className="w-5 h-5 text-accent" />
              <span className="font-medium">{urgentTasksCount} Urgent Tasks</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors cursor-pointer">
              <CalendarIcon className="w-5 h-5 text-accent" />
              <span className="font-medium">{todayMeetingsCount} Meeting{todayMeetingsCount !== 1 ? 's' : ''} Today</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors cursor-pointer">
              <Users className="w-5 h-5 text-accent" />
              <span className="font-medium">{clientsWaitingCount} Client{clientsWaitingCount !== 1 ? 's' : ''} Waiting</span>
            </div>
            <Link to="/follow-ups" className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors">
              <Clock3 className="w-5 h-5 text-accent" />
              <span className="font-medium">{followUpsDueCount} Follow-up{followUpsDueCount !== 1 ? 's' : ''} Due</span>
            </Link>
            <Link to="/inbox" className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors">
              <Inbox className="w-5 h-5 text-accent" />
              <span className="font-medium">{inboxItemsCount} Inbox Item{inboxItemsCount !== 1 ? 's' : ''}</span>
            </Link>
            <Link to="/follow-ups" className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors">
              <Clock className="w-5 h-5 text-accent" />
              <span className="font-medium">{followUpsWaitingCount} Waiting on Someone</span>
            </Link>
            <Link to="/documents" className="flex items-center gap-3 text-slate-300 hover:text-white transition-colors">
              <FileText className="w-5 h-5 text-accent" />
              <span className="font-medium">{documentsAttentionCount} Documents Need Attention</span>
            </Link>
            <div className="flex items-center gap-3 text-slate-300">
              <Clock className="w-5 h-5 text-accent" />
              <span className="font-medium">{paymentsAwaitingCount} Payments Awaiting Confirmation</span>
            </div>
          </div>
        </section>

        {/* Business Health */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Business Health</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Tasks Overdue</span>
              <span className={cn("text-sm font-bold", tasksOverdueCount > 0 ? "text-red-400" : "text-emerald-400")}>
                {tasksOverdueCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Meetings This Week</span>
              <span className="text-sm font-bold text-slate-200">{meetingsThisWeekCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Documents Pending Review</span>
              <span className="text-sm font-bold text-slate-200">{documentsAttentionCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Team Availability</span>
              <span className="text-sm font-bold text-emerald-400">Normal</span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        <section className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">End-of-Day Report</h3>
              <button
                onClick={generateDailyReport}
                disabled={reportGenerating}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-bold hover:bg-accent/20 disabled:opacity-50 cursor-pointer"
                title="AI pre-fill from workspace data"
              >
                <Bot className="w-3.5 h-3.5" />
                {reportGenerating ? 'Analyzing Workspace…' : 'AI Pre-fill'}
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">Record what was completed, what is pending, and what needs decision. Saved as a workspace document.</p>
            <textarea
              value={reportText}
              onChange={e => { setReportText(e.target.value); setReportSaved(false); }}
              placeholder="Completed…&#10;Pending…&#10;Needs your decision…&#10;Tomorrow…"
              className="w-full min-h-[160px] rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs sm:text-sm text-slate-200 outline-none focus:border-accent resize-y font-mono leading-relaxed"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-3 border-t border-slate-800/80">
            <span className="text-xs text-slate-500">Auto-saved to your daily reports & workspace documents.</span>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveDailyReport} disabled={reportSaving || !reportText.trim()} className="px-4 py-2 rounded-lg bg-accent text-slate-950 text-xs sm:text-sm font-bold disabled:opacity-50 cursor-pointer shadow-xs active:scale-98">
                {reportSaving ? 'Saving…' : reportSaved ? 'Saved as Document ✓' : 'Save Report'}
              </button>
              <button onClick={sendReportToWhatsApp} disabled={whatsappSending || !reportText.trim()} className="px-4 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs sm:text-sm font-bold hover:bg-emerald-500/20 disabled:opacity-50 cursor-pointer">
                {whatsappSending ? 'Opening WhatsApp…' : 'Send via WhatsApp'}
              </button>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col p-6 min-h-[300px]">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" /> Personal Scratchpad
          </h3>
          <p className="text-xs text-slate-400 mb-3">Quick thoughts, temporary notes, and immediate reminders.</p>
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl flex flex-col p-4 relative overflow-hidden flex-1"> 
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down quick thoughts here..."
              className="flex-1 w-full bg-transparent text-sm text-slate-300 leading-relaxed resize-none focus:outline-none min-h-[140px]"
            />
            <div className="mt-3 pt-3 border-t border-slate-800/70 flex justify-between items-center shrink-0">
               <button 
                 onClick={handleSaveNotes}
                disabled={savingNotes}
                className="text-xs font-semibold text-slate-400 hover:text-accent flex items-center gap-1.5 transition-colors cursor-pointer"
               >
                 {savingNotes ? 'Saving...' : saveSuccess ? <><Check className="w-4 h-4 text-emerald-400" /> Saved!</> : <><span className="text-base leading-none mb-0.5">+</span> Save note</>}
               </button>
               <span className="text-[11px] text-slate-500">Private to your account</span>
            </div>
          </div>
        </section>
      </div>

    </div>
  );
}
