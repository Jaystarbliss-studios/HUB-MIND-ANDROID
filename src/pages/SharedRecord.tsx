import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, getDoc } from 'firebase/firestore';
import DOMPurify from 'dompurify';
import { db } from '../firebaseConfig';
import { Loader2, ArrowLeft, Calendar, CheckSquare, FileText, Users, Folder, Clock3, ExternalLink } from 'lucide-react';

const config: Record<string, { collection: string; label: string; icon: React.ReactNode; back: string }> = {
  task: { collection: 'tasks', label: 'Task', icon: <CheckSquare className="w-5 h-5" />, back: '/tasks' },
  meeting: { collection: 'meetings', label: 'Meeting', icon: <Calendar className="w-5 h-5" />, back: '/calendar' },
  document: { collection: 'documents', label: 'Document', icon: <FileText className="w-5 h-5" />, back: '/documents' },
  client: { collection: 'clients', label: 'Client', icon: <Users className="w-5 h-5" />, back: '/clients' },
  project: { collection: 'projects', label: 'Project', icon: <Folder className="w-5 h-5" />, back: '/projects' },
  followup: { collection: 'followUps', label: 'Follow-up', icon: <Clock3 className="w-5 h-5" />, back: '/follow-ups' },
  report: { collection: 'sharedRecords', label: 'Daily Report', icon: <FileText className="w-5 h-5" />, back: '/' },
};

function valueText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  return '';
}

export function SharedRecord() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const meta = type ? config[type] : undefined;
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!meta || !id) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, meta.collection, decodeURIComponent(id)));
        if (active && snap.exists()) {
          const raw = snap.data() as any;
          setData(raw.kind === 'report' && raw.payload ? { id: snap.id, ...raw.payload, sharedRecord: true } : { id: snap.id, ...raw });
        }
      } catch (e) { console.error('Failed to load shared record', e); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [meta, id]);

  const title = useMemo(() => {
    if (!data || !meta) return meta?.label || 'Shared item';
    return data.title || data.name || (meta.label === 'Meeting' ? 'Meeting' : meta.label);
  }, [data, meta]);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400"><Loader2 className="w-7 h-7 animate-spin text-accent" /></div>;
  if (!meta || !data) return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 text-center shadow-xl">
        <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center"><ExternalLink className="w-5 h-5" /></div>
        <h1 className="text-xl font-bold">This Hub-Mind item is unavailable</h1>
        <p className="text-sm text-slate-500 mt-2">It may have been deleted, moved, or you may not have permission to view it.</p>
        <Link to="/" className="inline-flex mt-5 px-4 py-2 rounded-xl bg-accent text-slate-950 font-bold">Open Hub-Mind</Link>
      </div>
    </div>
  );

  const fields = [
    ['Status', data.status],
    ['Priority', data.priority],
    ['Date', data.date],
    ['Deadline', data.deadline],
    ['Due', data.dueAt],
    ['Person', data.person],
    ['Email', data.email],
    ['Phone', data.phone],
    ['Type', data.type],
  ].filter(([, v]) => valueText(v));

  const body = data.content || data.description || data.notesRaw || data.reason || data.report || '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to={meta.back} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /> Back</Link>
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.18em] font-bold text-accent">Hub-Mind • Shared {meta.label}</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
        <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 sm:p-7 border-b border-slate-800">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0">{meta.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider font-bold text-slate-500">{meta.label}</p>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 break-words">{title}</h1>
                <p className="text-xs text-slate-500 mt-2">Read-only shared view • ID {data.id}</p>
              </div>
            </div>
          </div>
          {fields.length > 0 && <div className="p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5"><p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{label}</p><p className="text-sm text-slate-200 mt-1 break-words">{valueText(value)}</p></div>)}</div>}
          {body && <div className="p-5 sm:p-7 border-t border-slate-800">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">{meta.label === 'Document' ? 'Document' : 'Details'}</p>
            {meta.label === 'Document' && /<\/?[a-z][\s\S]*>/i.test(String(body))
              ? <div className="prose prose-invert max-w-none bg-white text-slate-900 rounded-xl p-5 sm:p-8 overflow-x-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(String(body)) }} />
              : <div className="whitespace-pre-wrap text-sm leading-7 text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-4 sm:p-5">{String(body)}</div>}
          </div>}
          <div className="px-5 sm:px-7 py-4 bg-slate-950/40 border-t border-slate-800 text-xs text-slate-500">This view is read-only. Changes must be made from the authenticated Hub-Mind workspace.</div>
        </section>
      </main>
    </div>
  );
}
