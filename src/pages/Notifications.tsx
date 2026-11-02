import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ActivityLog } from '../types';
import { safeParseISO, safeFormat } from "../lib/dateUtils";
import { format, parseISO } from 'date-fns';
import { Activity, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Notifications() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    
    const q = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
      setLoading(false);
    }, (error) => {
      console.warn("Real-time activity logs listener warning:", error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [profile]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Activity className="w-6 h-6 text-accent" />
          Activity Center
        </h1>
        <p className="text-sm text-slate-400 mt-1">Operational feed and audit trail.</p>
      </div>

      <div className="space-y-4">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
            No recent activity.
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 uppercase shrink-0">
                  {log.userId.substring(0, 2)}
                </div>
                <div>
                  <p className="text-sm text-slate-300">
                    <span className="font-bold text-white">{log.userId}</span> {log.action} <span className="font-bold text-white">{log.details}</span>
                  </p>
                  <p className="text-xs text-slate-500 capitalize mt-0.5">{log.entityType}</p>
                </div>
              </div>
              <span className="text-xs text-slate-500 font-medium shrink-0 ml-12 sm:ml-0">
                {safeFormat(log.createdAt, 'MMM d, h:mm a')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
