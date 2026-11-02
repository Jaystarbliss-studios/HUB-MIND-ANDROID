import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { readJessExecutionEvents, type JessExecutionEvent } from '../services/jessExecutionRuntime';
import { Brain, ShieldCheck, SlidersHorizontal, Loader2, MonitorCog, Layers, Download, ExternalLink } from 'lucide-react';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { JessMcpServersSettings } from '../components/JessMcpServersSettings';

type JessPreferences = {
  permissionMode: 'ask' | 'allow-routine' | 'allow-everything';
  fullControlEnabled: boolean;
  startInFullControl: boolean;
  confirmHighRiskOutLoud: boolean;
  memoryEnabled: boolean;
  contextEnabled: boolean;
  personalization: string;
  webResearchEnabled: boolean;
  screenVerificationEnabled: boolean;
  allowSystemWideFileScan: boolean;
  allowAutomatedFileManagement: boolean;
  allowShellCommands: boolean;
  moodAdaptiveTone: boolean;
  conversationStyle: 'adaptive' | 'friendly' | 'professional' | 'concise';
};
const DEFAULTS: JessPreferences = {
  permissionMode: 'ask', fullControlEnabled: false, startInFullControl: false, confirmHighRiskOutLoud: true, memoryEnabled: true, contextEnabled: true,
  personalization: '', webResearchEnabled: true, screenVerificationEnabled: true,
  allowSystemWideFileScan: true, allowAutomatedFileManagement: true, allowShellCommands: true,
  moodAdaptiveTone: true, conversationStyle: 'adaptive',
};

export function JessSettings() {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<JessPreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [desktopState, setDesktopState] = useState<{ active?: boolean; startedAt?: string | null; permissionMode?: string } | null>(null);
  const [error, setError] = useState('');
  const [executionEvents, setExecutionEvents] = useState<JessExecutionEvent[]>([]);
  const [chromeBridgeState, setChromeBridgeState] = useState<{ available?: boolean; serverListening?: boolean; connected?: boolean; authenticated?: boolean; pendingRequests?: number; lastHandshakeAt?: string | null; lastDisconnectAt?: string | null; lastError?: string | null; transport?: string; pipe?: string } | null>(null);
  const [chromeSetupBusy, setChromeSetupBusy] = useState(false);
  const [chromeSetupMessage, setChromeSetupMessage] = useState('');
  const [companionVisibilityMessage, setCompanionVisibilityMessage] = useState('');

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    return onSnapshot(doc(db, 'users', profile.id, 'private', 'jessSettings'), snapshot => {
      const raw = snapshot.exists() ? snapshot.data() : {};
      const loaded = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, raw[key] ?? (DEFAULTS as any)[key]])) as JessPreferences;
      setPrefs(current => JSON.stringify(current) === JSON.stringify(loaded) ? current : loaded);
      setHydrated(true);
      try { localStorage.setItem('hubmind.jess.preferences', JSON.stringify(loaded)); } catch {}
      void (async () => { try { const desktop = (window as any).hubMindDesktop; if (!desktop?.getJessPreferences) return; const live = await desktop.getJessPreferences(); setDesktopState({ active: live?.fullControlActive === true, startedAt: live?.startedAt || null, permissionMode: live?.preferences?.permissionMode || loaded.permissionMode }); } catch { /* Browser workspace may run without the desktop shell. */ } })();
      setLoading(false);
    }, () => { setError('Could not load Jess settings. Check your connection and permissions.'); setLoading(false); });
  }, [profile?.id]);

  useEffect(() => {
    const refresh = () => setExecutionEvents(
      profile?.id
        ? readJessExecutionEvents().filter(event => event.userId === profile.id).slice().reverse().slice(0, 8)
        : [],
    );
    refresh();
    window.addEventListener('hubmind:jess-execution-event', refresh);
    return () => window.removeEventListener('hubmind:jess-execution-event', refresh);
  }, [profile?.id]);

  useEffect(() => {
    const desktop = (window as any).hubMindDesktop;
    if (!desktop?.chromeStatus) return;
    let disposed = false;
    const refresh = async () => {
      try { const status = await desktop.chromeStatus(); if (!disposed) setChromeBridgeState(status); }
      catch { if (!disposed) setChromeBridgeState({ available: false }); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  const setDesktopCharacterVisible = async (visible: boolean) => {
    const desktop = (window as any).hubMindDesktop;
    const action = visible ? desktop?.showCompanion : desktop?.hideCompanion;
    if (typeof action !== 'function') {
      setCompanionVisibilityMessage('Desktop character controls are available in the installed Windows app.');
      return;
    }
    try {
      const result = await action();
      if (result === false || result?.ok === false) throw new Error('Hub-Mind could not update the character window.');
      setCompanionVisibilityMessage(visible ? 'Jess is visible on the desktop.' : 'Jess is hidden. Use Show Jess character in the Windows tray menu to restore her.');
    } catch (controlError: any) {
      setCompanionVisibilityMessage(controlError?.message || 'Could not update Jess visibility.');
    }
  };

  const setupChromeBridge = async () => {
    const desktop = (window as any).hubMindDesktop;
    if (!desktop?.installChromeBridge) { setChromeSetupMessage('Chrome setup is available in the installed Windows desktop app, not the browser workspace.'); return; }
    setChromeSetupBusy(true); setChromeSetupMessage('');
    try {
      const result = await desktop.installChromeBridge();
      if (result?.ok) setChromeSetupMessage('Native host registered. ' + String(result.output || '') + ' In Chrome, open chrome://extensions, enable Developer mode, and load the extension folder printed above.');
      else if (result?.cancelled) setChromeSetupMessage('Chrome setup cancelled.');
      else setChromeSetupMessage(String(result?.error || 'Chrome setup failed.'));
      const status = await desktop.chromeStatus();
      setChromeBridgeState(status);
    } catch (e: any) { setChromeSetupMessage(e?.message || 'Chrome setup failed.'); }
    finally { setChromeSetupBusy(false); }
  };

  const update = <K extends keyof JessPreferences,>(key: K, value: JessPreferences[K]) => {
    setPrefs(current => ({ ...current, [key]: value }));
    setSaved(false);
  };
  useEffect(() => {
    if (!hydrated || !profile?.id) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSaving(true); setError('');
      try {
        await setDoc(doc(db, 'users', profile.id, 'private', 'jessSettings'), {
          ...prefs, updatedAt: new Date().toISOString(), updatedBy: profile.id,
        }, { merge: true });
        const desktop = (window as any).hubMindDesktop;
        if (desktop?.setJessPreferences) {
          const live = await desktop.setJessPreferences(prefs, profile.id);
          if (!cancelled) setDesktopState({ active: live?.fullControlActive === true, startedAt: live?.startedAt || null, permissionMode: live?.preferences?.permissionMode || prefs.permissionMode });
          if (live?.cancelled && !cancelled) { setPrefs({ ...DEFAULTS, ...(live.preferences || {}) }); setError('Full Control was not enabled because the native confirmation was cancelled.'); }
        }
        try { localStorage.setItem('hubmind.jess.preferences', JSON.stringify(prefs)); } catch {}
        if (!cancelled) setSaved(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not auto-save Jess settings.');
      } finally { if (!cancelled) setSaving(false); }
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [hydrated, profile?.id, prefs]);

  if (loading) return <div className="p-8 text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" size={18}/> Loading Jess settings…</div>;
  return <div className="min-h-full bg-slate-950 text-slate-100 p-5 md:p-8">
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl border border-teal-300/20 bg-teal-300/10 text-teal-200 grid place-items-center"><SlidersHorizontal size={22}/></div>
        <div><p className="text-xs tracking-[.18em] uppercase text-teal-300 font-semibold">Personal assistant</p><h1 className="text-2xl md:text-3xl font-semibold mt-1">Jess settings</h1><p className="text-sm text-slate-400 mt-2 max-w-2xl">Set how Jess remembers you, uses context, researches the web, and handles desktop actions. These preferences are saved to your account.</p></div>
      </div>
      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4"><MonitorCog className="text-teal-300" size={20}/><div><h2 className="font-semibold">Desktop character</h2><p className="text-xs text-slate-400 mt-1">Keep Jess available while you work, or hide her until you need her again.</p></div></div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void setDesktopCharacterVisible(true)} disabled={!((window as any).hubMindDesktop?.isDesktopApp)} className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Show Jess character</button>
            <button type="button" onClick={() => void setDesktopCharacterVisible(false)} disabled={!((window as any).hubMindDesktop?.isDesktopApp)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40">Hide Jess character</button>
          </div>
          {companionVisibilityMessage && <p role="status" aria-live="polite" className="mt-3 text-xs text-slate-300">{companionVisibilityMessage}</p>}
          <p className="mt-3 text-xs text-slate-500">You can also use the Windows Hub-Mind tray menu. Hiding Jess does not quit Hub-Mind or end an active voice conversation.</p>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4"><ShieldCheck className="text-teal-300" size={20}/><div><h2 className="font-semibold">Desktop permissions</h2><p className="text-xs text-slate-400 mt-1">Changes auto-save and the desktop reports its live session state.</p></div></div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 p-4 mb-4"><span><strong className="block text-sm">Full Control</strong><span className="block text-xs text-slate-400 mt-1">Enable Windows and connected Chrome controls when the desktop session is active.</span></span><input type="checkbox" checked={prefs.fullControlEnabled} onChange={e => setPrefs(current => ({ ...current, fullControlEnabled: e.target.checked, ...(e.target.checked ? { permissionMode: 'allow-everything', confirmHighRiskOutLoud: false, allowSystemWideFileScan: true, allowAutomatedFileManagement: true, allowShellCommands: true } : { permissionMode: 'ask' }) }))} className="w-5 h-5 accent-teal-400"/></label>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Permission mode</div>
          <label className="flex gap-3 rounded-xl border border-slate-800 p-4 cursor-pointer mb-3"><input type="radio" name="permissionMode" checked={prefs.permissionMode==='ask'} onChange={() => update('permissionMode','ask')} className="mt-1 accent-teal-400"/><span><strong className="block text-sm">Ask</strong><span className="block text-xs text-slate-400 mt-1">Ask before each mutating native action.</span></span></label>
          <label className="flex gap-3 rounded-xl border border-slate-800 p-4 cursor-pointer mb-3"><input type="radio" name="permissionMode" checked={prefs.permissionMode==='allow-routine'} onChange={() => setPrefs(current => ({ ...current, permissionMode: 'allow-routine', fullControlEnabled: true }))} className="mt-1 accent-teal-400"/><span><strong className="block text-sm">Allow routine</strong><span className="block text-xs text-slate-400 mt-1">Routine desktop actions proceed without repeated prompts. High-impact operations still require explicit handling.</span></span></label>
          <label className="flex gap-3 rounded-xl border border-rose-400/25 bg-rose-400/5 p-4 cursor-pointer mb-4"><input type="radio" name="permissionMode" checked={prefs.permissionMode==='allow-everything'} onChange={() => setPrefs(current => ({ ...current, permissionMode: 'allow-everything', fullControlEnabled: true, confirmHighRiskOutLoud: false, allowSystemWideFileScan: true, allowAutomatedFileManagement: true, allowShellCommands: true }))} className="mt-1 accent-rose-400"/><span><strong className="block text-sm">Allow everything</strong><span className="block text-xs text-slate-400 mt-1">The first Full Control grant is saved for this Windows profile. After that, Jess proceeds without per-action permission prompts while Allow Everything is enabled. Windows secure-desktop/UAC prompts remain OS-controlled.</span></span></label>
          <label className="flex items-center justify-between gap-4 py-3 border-t border-slate-800"><span><strong className="block text-sm">Start in Full Control when Hub-Mind launches</strong><span className="block text-xs text-slate-400">Uses your saved consent and current permission mode.</span></span><input type="checkbox" checked={prefs.startInFullControl} onChange={e => update('startInFullControl', e.target.checked)} className="w-5 h-5 accent-teal-400"/></label>
          <label className="flex items-center justify-between gap-4 py-3"><span><strong className="block text-sm">Ask out loud before high-impact actions</strong><span className="block text-xs text-slate-400">For deleting, formatting, shutting down or sending. Requires a verified spoken yes/no flow; this switch does not itself create speech confirmation.</span></span><input type="checkbox" checked={prefs.confirmHighRiskOutLoud} disabled={prefs.permissionMode === 'allow-everything'} onChange={e => update('confirmHighRiskOutLoud', e.target.checked)} className="w-5 h-5 accent-teal-400"/></label>
          <div className="mt-3 rounded-lg bg-slate-950 p-3 text-xs text-slate-400" aria-live="polite">Desktop live state: <strong className={desktopState?.active ? 'text-emerald-300' : 'text-amber-200'}>{desktopState?.active ? 'Full Control active' : 'Not active / browser only'}</strong>{desktopState?.permissionMode ? ` · Main-process mode: ${desktopState.permissionMode}` : ''}{desktopState?.startedAt ? ` · Started ${new Date(desktopState.startedAt).toLocaleTimeString()}` : ''}</div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4"><ShieldCheck className="text-teal-300" size={20}/><div><h2 className="font-semibold">Advanced local access</h2><p className="text-xs text-slate-400 mt-1">Choose what Jess may do on this Windows account. Changes auto-save.</p></div></div>
          <label className="flex items-center justify-between gap-4 py-3 border-b border-slate-800">
            <span><strong className="block text-sm">Scan all local drives</strong><span className="block text-xs text-slate-400 mt-1">Allow recursive read-only scans of ready fixed drives, including C:. You can still scan a specific folder when this is off.</span></span>
            <input type="checkbox" checked={prefs.allowSystemWideFileScan} disabled={prefs.permissionMode === 'allow-everything'} onChange={e => update('allowSystemWideFileScan', e.target.checked)} className="w-5 h-5 accent-teal-400"/>
          </label>
          <label className="flex items-center justify-between gap-4 py-3 border-b border-slate-800">
            <span><strong className="block text-sm">Automated file management</strong><span className="block text-xs text-slate-400 mt-1">Permit creating, writing, copying, moving, renaming and recycling files through Jess. Storage cleanup remains previewed and uses the configured cleanup behaviour.</span></span>
            <input type="checkbox" checked={prefs.allowAutomatedFileManagement} disabled={prefs.permissionMode === 'allow-everything'} onChange={e => update('allowAutomatedFileManagement', e.target.checked)} className="w-5 h-5 accent-teal-400"/>
          </label>
          <label className="flex items-center justify-between gap-4 py-3">
            <span><strong className="block text-sm">Advanced shell commands</strong><span className="block text-xs text-slate-400 mt-1">Allow broader PowerShell commands, including script launches, as your current Windows user. The app does not elevate privileges or bypass Windows/UAC prompts. Commands have a configurable 1–120 second timeout.</span></span>
            <input type="checkbox" checked={prefs.allowShellCommands} disabled={prefs.permissionMode === 'allow-everything'} onChange={e => update('allowShellCommands', e.target.checked)} className="w-5 h-5 accent-teal-400"/>
          </label>
          <p className="mt-3 rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-400">Allow Everything automatically enables Jess's full product-level desktop capabilities and removes further Jess permission prompts for the active Full Control session. Windows account permissions, protected folders, device policies, UAC and secure-desktop prompts remain controlled by Windows.</p>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4"><MonitorCog className="text-teal-300" size={20}/><div><h2 className="font-semibold">Chrome browser bridge</h2><p className="text-xs text-slate-400 mt-1">Connect Jess to real Chrome tabs through the installed desktop app.</p></div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm space-y-2" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-slate-300">Desktop named-pipe listener</span><span className={chromeBridgeState?.serverListening ? 'text-emerald-300' : 'text-amber-200'}>{chromeBridgeState?.serverListening ? 'Listening' : chromeBridgeState ? 'Not listening' : 'Checking…'}</span></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-slate-300">Native host connection</span><span className={chromeBridgeState?.connected ? 'text-emerald-300' : 'text-amber-200'}>{chromeBridgeState?.connected ? 'Connected' : chromeBridgeState ? 'Disconnected' : 'Checking…'}</span></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-slate-300">Token authentication</span><span className={chromeBridgeState?.authenticated ? 'text-emerald-300' : 'text-amber-200'}>{chromeBridgeState?.authenticated ? 'Authenticated' : chromeBridgeState ? 'Not authenticated' : 'Checking…'}</span></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-slate-300">Pending Chrome actions</span><span className="text-slate-200">{chromeBridgeState ? String(chromeBridgeState.pendingRequests ?? 0) : '—'}</span></div>
            {chromeBridgeState?.lastHandshakeAt && <p className="text-xs text-slate-500">Last authenticated handshake: {new Date(chromeBridgeState.lastHandshakeAt).toLocaleString()}</p>}
            {chromeBridgeState?.lastDisconnectAt && <p className="text-xs text-slate-500">Last disconnect: {new Date(chromeBridgeState.lastDisconnectAt).toLocaleString()}</p>}
            {chromeBridgeState?.lastError && <p className="text-xs text-amber-200 break-words">Bridge diagnostic: {chromeBridgeState.lastError}</p>}
            {chromeBridgeState?.available && <p className="text-xs text-emerald-300">Jess can send Chrome actions through the authenticated bridge.</p>}
          </div>
          <p className="text-xs text-slate-500 mt-3">Setup registers the local native-messaging host for your Windows account. It does not bypass Chrome extension consent or automatically force-install the extension.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => void setupChromeBridge()} disabled={chromeSetupBusy || !((window as any).hubMindDesktop?.isDesktopApp)} className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{chromeSetupBusy ? 'Setting up…' : 'Set up Chrome bridge'}</button>
            <button type="button" onClick={() => { void (async () => { try { const status = await (window as any).hubMindDesktop?.chromeStatus?.(); setChromeBridgeState(status || { available: false }); } catch { setChromeBridgeState({ available: false }); } })(); }} disabled={!((window as any).hubMindDesktop?.isDesktopApp)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-40">Refresh status</button>
          </div>
          {chromeSetupMessage && <p className="mt-3 text-xs text-slate-300" role="status">{chromeSetupMessage}</p>}
        </section>
        <JessMcpServersSettings userId={profile?.id || ''} />
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4"><MonitorCog className="text-teal-300" size={20}/><div><h2 className="font-semibold">Recent Jess execution activity</h2><p className="text-xs text-slate-400 mt-1">A lightweight trace of tool execution. Argument values are not stored.</p></div></div>
          {executionEvents.length === 0 ? <p className="text-sm text-slate-500">No recent tool executions in this app session.</p> : <div className="space-y-2">
            {executionEvents.map(event => <div key={event.executionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="min-w-0"><p className="text-sm font-medium truncate">{event.toolName}</p><p className="text-xs text-slate-500">{new Date(event.at).toLocaleTimeString()} · {event.durationMs} ms</p></div>
              <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${event.status === 'failed' ? 'bg-rose-400/10 text-rose-300' : event.status === 'sent_unverified' ? 'bg-amber-400/10 text-amber-200' : 'bg-teal-400/10 text-teal-200'}`}>{event.status.replace(/_/g, ' ')}</span><span className="text-[10px] text-slate-500">{event.retrySafe ? 'read-only' : 'do not auto-retry'}</span></div>
            </div>)}
          </div>}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4"><Brain className="text-teal-300" size={20}/><div><h2 className="font-semibold">Memory and personalization</h2><p className="text-xs text-slate-400 mt-1">Control how Jess adapts to your working style.</p></div></div>
          <label className="flex items-center justify-between gap-4 py-3 border-b border-slate-800"><span><strong className="block text-sm">Remember useful details</strong><span className="text-xs text-slate-400">Allow Jess to store and use saved memories.</span></span><input type="checkbox" checked={prefs.memoryEnabled} onChange={e => update('memoryEnabled',e.target.checked)} className="w-5 h-5 accent-teal-400"/></label>
          <label className="flex items-center justify-between gap-4 py-3 border-b border-slate-800"><span><strong className="block text-sm">Use workspace context</strong><span className="text-xs text-slate-400">Use relevant open-page and workspace information.</span></span><input type="checkbox" checked={prefs.contextEnabled} onChange={e => update('contextEnabled',e.target.checked)} className="w-5 h-5 accent-teal-400"/></label>
          <label className="flex items-center justify-between gap-4 py-3 border-b border-slate-800"><span><strong className="block text-sm">Adapt to my mood and conversational cues</strong><span className="text-xs text-slate-400">Let Jess become calmer, more encouraging, playful or focused when the situation calls for it without guessing or forcing a mood.</span></span><input type="checkbox" checked={prefs.moodAdaptiveTone} onChange={e => update('moodAdaptiveTone',e.target.checked)} className="w-5 h-5 accent-teal-400"/></label>
          <label className="block py-3 border-b border-slate-800"><span className="text-sm font-medium">Conversation style</span><select value={prefs.conversationStyle} onChange={e => update('conversationStyle',e.target.value as JessPreferences['conversationStyle'])} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 focus:border-teal-400 focus:outline-none"><option value="adaptive">Adaptive and natural</option><option value="friendly">Friendly and companionable</option><option value="professional">Professional and composed</option><option value="concise">Concise and direct</option></select><span className="mt-1 block text-xs text-slate-400">Jess can sound warm and familiar without pretending to be human or claiming to have real feelings.</span></label>
          <label className="flex items-center justify-between gap-4 py-3"><span><strong className="block text-sm">Web research</strong><span className="text-xs text-slate-400">Allow Jess to use available online search and URL context tools.</span></span><input type="checkbox" checked={prefs.webResearchEnabled} onChange={e => update('webResearchEnabled',e.target.checked)} className="w-5 h-5 accent-teal-400"/></label>
          <label className="flex items-center justify-between gap-4 py-3 border-t border-slate-800"><span><strong className="block text-sm">Verify actions visually</strong><span className="text-xs text-slate-400">When screen access is available, ask Jess to inspect the result before claiming success.</span></span><input type="checkbox" checked={prefs.screenVerificationEnabled} onChange={e => update('screenVerificationEnabled',e.target.checked)} className="w-5 h-5 accent-teal-400"/></label>
          <label className="block mt-4"><span className="text-sm font-medium">Personalization instructions</span><textarea value={prefs.personalization} onChange={e => update('personalization',e.target.value.slice(0,2000))} rows={4} maxLength={2000} placeholder="For example: be concise, explain unfamiliar terms, prefer keyboard shortcuts, and use my preferred writing tone." className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none"/></label>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <Layers className="text-teal-300 shrink-0" size={20}/>
              <div>
                <h2 className="font-semibold">Desktop Releases & Version History</h2>
                <p className="text-xs text-slate-400 mt-1">Inspect official releases, Windows installers, recent GitHub commits, and codebase history.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('hubmind:open-updates-panel'))}
              className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Download size={14}/>
              <span>View Releases Panel</span>
            </button>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs space-y-2 text-slate-300">
            <div className="flex items-center justify-between">
              <span>Public GitHub Repository</span>
              <a href="https://github.com/Jaystarbliss-studios/HUB-MIND" target="_blank" rel="noreferrer" className="text-teal-400 hover:underline inline-flex items-center gap-1">
                Jaystarbliss-studios/HUB-MIND <ExternalLink size={12}/>
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span>Jess GitHub Awareness</span>
              <span className="text-emerald-300">Enabled (Releases, Commits, Codebase inspection)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Global Web Search</span>
              <span className={prefs.webResearchEnabled ? "text-emerald-300" : "text-amber-300"}>
                {prefs.webResearchEnabled ? "Active (Google Search Grounding)" : "Disabled"}
              </span>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 flex gap-3"><MonitorCog className="text-slate-400 shrink-0" size={19}/><p className="text-xs leading-relaxed text-slate-400">Full Control operates through the installed desktop app. The web workspace cannot itself control Windows. UAC secure-desktop prompts require user interaction.</p></section>
        <div className="flex items-center justify-end gap-3"><span aria-live="polite" className="text-xs text-emerald-300">{saving ? 'Saving…' : saved ? 'Auto-saved' : 'Changes save automatically'}</span></div>
      </div>
    </div>
  </div>;
}
