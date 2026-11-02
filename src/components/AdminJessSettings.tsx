import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { Brain, Check, Loader2, Mic, Monitor, ShieldCheck, Volume2 } from 'lucide-react';

type AdminJessConfig = {
  memoryEnabled: boolean;
  screenSharingEnabled: boolean;
  automaticVoiceModesEnabled: boolean;
  offlineVoiceControlEnabled: boolean;
  confirmDestructiveActions: boolean;
  adminInstructions: string;
};
type AdminJessToggleKey = Exclude<keyof AdminJessConfig, 'adminInstructions'>;
const DEFAULTS: AdminJessConfig = {
  memoryEnabled: true,
  screenSharingEnabled: true,
  automaticVoiceModesEnabled: true,
  offlineVoiceControlEnabled: true,
  confirmDestructiveActions: true,
  adminInstructions: '',
};

export function AdminJessSettings() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<AdminJessConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile?.role !== 'admin') { setLoading(false); setError('Administrator access is required.'); return; }
    return onSnapshot(doc(db, 'systemSettings', 'jess'), snapshot => {
      const raw = snapshot.exists() ? snapshot.data() : {};
      setSettings({
        memoryEnabled: raw.memoryEnabled ?? DEFAULTS.memoryEnabled,
        screenSharingEnabled: raw.screenSharingEnabled ?? DEFAULTS.screenSharingEnabled,
        automaticVoiceModesEnabled: raw.automaticVoiceModesEnabled ?? DEFAULTS.automaticVoiceModesEnabled,
        offlineVoiceControlEnabled: raw.offlineVoiceControlEnabled ?? DEFAULTS.offlineVoiceControlEnabled,
        confirmDestructiveActions: raw.confirmDestructiveActions ?? DEFAULTS.confirmDestructiveActions,
        adminInstructions: typeof raw.adminInstructions === 'string' ? raw.adminInstructions : DEFAULTS.adminInstructions,
      });
      setLoading(false);
    }, () => { setError('Could not read administrator settings. Check Firestore rules and access.'); setLoading(false); });
  }, [profile?.role]);

  const save = async () => {
    if (profile?.role !== 'admin') return;
    setSaving(true); setError('');
    try {
      const timestamp = new Date().toISOString();
      await Promise.all([
        setDoc(doc(db, 'systemSettings', 'jess'), {
          ...settings,
          updatedAt: timestamp,
          updatedBy: profile.id,
        }, { merge: true }),
        setDoc(doc(db, 'systemSettings', 'jessPublic'), {
          memoryEnabled: settings.memoryEnabled,
          screenSharingEnabled: settings.screenSharingEnabled,
          automaticVoiceModesEnabled: settings.automaticVoiceModesEnabled,
          offlineVoiceControlEnabled: settings.offlineVoiceControlEnabled,
          confirmDestructiveActions: settings.confirmDestructiveActions,
          updatedAt: timestamp,
        }, { merge: true }),
      ]);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.message || 'Could not save Jess settings.');
    } finally { setSaving(false); }
  };

  const toggleRows: {key: AdminJessToggleKey; icon: React.ElementType; title: string; description: string}[] = [
    { key: 'memoryEnabled', icon: Brain, title: 'Personal memory', description: 'Allow Jess to load and save user-specific memories. Conversation history remains available separately.' },
    { key: 'screenSharingEnabled', icon: Monitor, title: 'Screen sharing in chat', description: 'Allow users to deliberately share a screen snapshot with Jess while a chat is open.' },
    { key: 'automaticVoiceModesEnabled', icon: Volume2, title: 'Automatic voice-mode switching', description: 'Enable the planned intent router for dictation, live conversation, and voice commands.' },
    { key: 'offlineVoiceControlEnabled', icon: Mic, title: 'Local voice control', description: 'Permit the Wheelhouse integration work for offline speech recognition and deterministic desktop commands.' },
    { key: 'confirmDestructiveActions', icon: ShieldCheck, title: 'Confirm destructive actions', description: 'Require an explicit confirmation before Jess deletes data or changes important account access.' },
  ];

  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-slate-400"><Loader2 size={16} className="animate-spin"/> Loading Jess administrator settings…</div>;

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-accent">System configuration</p>
          <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">Jess settings</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Manage the intended behaviour of Jess across Hub-Mind. These controls record the system policy; integrations marked as planned still require their runtime work and acceptance tests before they are considered active.</p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-emerald-300"><Check size={13} className="mr-1 inline"/> Saved {savedAt}</span>}
          <button onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>} Save settings
          </button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
        {toggleRows.map(({key, icon: Icon, title, description}) => (
          <label key={key} className="flex cursor-pointer items-start justify-between gap-4 border-b border-slate-800/80 p-4 last:border-0 sm:p-5">
            <span className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-900 text-accent"><Icon size={17}/></span>
              <span className="min-w-0"><strong className="block text-sm text-slate-100">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span></span>
            </span>
            <input type="checkbox" checked={Boolean(settings[key])} onChange={event => setSettings(current => ({ ...current, [key]: event.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-teal-400"/>
          </label>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5">
        <label htmlFor="jess-admin-instructions" className="block text-sm font-semibold text-white">Administrator guidance for Jess</label>
        <p className="mt-1 text-xs leading-5 text-slate-400">Record the organisation-wide instructions that should shape Jess’s behaviour. This is configuration data; server-side enforcement must be connected before treating it as a security boundary.</p>
        <textarea id="jess-admin-instructions" value={settings.adminInstructions} onChange={event => setSettings(current => ({ ...current, adminInstructions: event.target.value.slice(0, 8000) }))} rows={6} maxLength={8000} placeholder="For example: protect client information, ask before sending external messages, and never delete records without confirmation…" className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm leading-6 text-slate-100 outline-none transition focus:border-teal-400/60 focus:ring-2 focus:ring-teal-400/10"/>
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-500"><span>Visible to administrators only.</span><span>{settings.adminInstructions.length}/8000</span></div>
      </div>
      <p className="text-[11px] leading-5 text-slate-500">Saving these settings does not by itself install Wheelhouse, activate offline AI reasoning, or enable continuous screen streaming. Those require separate implementation, permissions, and device testing.</p>
    </section>
  );
}
