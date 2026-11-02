import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PlugZap, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

type McpServer = {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable-http';
  enabled: boolean;
  connected: boolean;
  toolCount: number;
  error?: string | null;
};

const fieldClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none';

export function JessMcpServersSettings({ userId }: { userId: string }) {
  const desktop = (typeof window !== 'undefined' ? (window as any).hubMindDesktop : null);
  const isDesktop = desktop?.isDesktopApp === true;
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>('stdio');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [cwd, setCwd] = useState('');
  const [url, setUrl] = useState('');

  const refresh = useCallback(async () => {
    if (!isDesktop || !userId || typeof desktop?.mcpListServers !== 'function') {
      setServers([]);
      return;
    }
    setLoading(true);
    try {
      const result = await desktop.mcpListServers(userId);
      setServers(Array.isArray(result) ? result : []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load MCP servers.');
    } finally {
      setLoading(false);
    }
  }, [desktop, isDesktop, userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const addServer = async () => {
    if (!isDesktop || !userId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const config: Record<string, unknown> = {
        id: 'mcp-' + crypto.randomUUID(),
        name: name.trim(),
        transport,
        enabled: true,
      };
      if (transport === 'stdio') {
        config.command = command.trim();
        config.args = argsText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (cwd.trim()) config.cwd = cwd.trim();
      } else {
        config.url = url.trim();
      }
      const result = await desktop.mcpSaveServer(config, userId);
      if (result?.cancelled) setNotice('MCP server setup was cancelled.');
      else setNotice('MCP server saved. Tool calls will ask for approval.');
      setName(''); setCommand(''); setArgsText(''); setCwd(''); setUrl('');
      await refresh();
    } catch (e: any) {
      await refresh();
      setError(e?.message || 'Could not add the MCP server.');
    } finally {
      setBusy(false);
    }
  };

  const addWindowsMcpPreset = async () => {
    if (!isDesktop || !userId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const config = {
        id: 'mcp-windows-mcp',
        name: 'Windows-MCP (telemetry off)',
        transport: 'stdio' as const,
        enabled: true,
        command: 'uvx',
        args: ['windows-mcp', 'serve'],
        env: {
          ANONYMIZED_TELEMETRY: 'false',
          WINDOWS_MCP_EXCLUDE_TOOLS: 'PowerShell,Registry,Process,FileSystem,Screenshot',
        },
      };
      await desktop.mcpSaveServer(config, userId);
      setNotice('Windows-MCP preset saved with anonymous telemetry disabled and PowerShell, Registry, Process, and FileSystem tool groups excluded. It requires uvx and a compatible Python runtime on this PC.');
      await refresh();
    } catch (e: any) {
      await refresh();
      setError(e?.message || 'Could not configure Windows-MCP. Install uv/uvx first, then retry.');
    } finally { setBusy(false); }
  };

  const connectServer = async (serverId: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await desktop.mcpConnectServer(serverId, userId);
      if (result?.cancelled) setNotice('Connection was cancelled.');
      else setNotice('MCP server connected.');
      await refresh();
    } catch (e: any) {
      await refresh();
      setError(e?.message || 'Could not connect to the MCP server.');
    } finally { setBusy(false); }
  };

  const removeServer = async (serverId: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await desktop.mcpRemoveServer(serverId, userId);
      if (result?.cancelled) setNotice('Server removal was cancelled.');
      else setNotice('MCP server removed.');
      await refresh();
    } catch (e: any) {
      await refresh();
      setError(e?.message || 'Could not remove the MCP server.');
    } finally { setBusy(false); }
  };

  if (!isDesktop) {
    return <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 md:p-6">
      <div className="flex items-center gap-3 mb-2"><PlugZap className="text-teal-300" size={20}/><h2 className="font-semibold">MCP integrations</h2></div>
      <p className="text-sm text-slate-400">MCP server connections are available in the installed Hub-Mind desktop app. Browser sessions do not start local processes.</p>
    </section>;
  }

  return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3"><PlugZap className="text-teal-300" size={20}/><div><h2 className="font-semibold">MCP integrations</h2><p className="text-xs text-slate-400 mt-1">Connect Jess to external tool servers using local stdio or HTTPS Streamable HTTP.</p></div></div>
      <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-50" aria-label="Refresh MCP servers"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button>
    </div>
    <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100/80">
      Only connect servers you trust. By default, Hub-Mind asks before MCP tool calls and records approval/result events in the local audit log. Allow everything can suppress approvals only after explicit consent. Local servers run as your current Windows user without elevation. Only a small allowlist of non-secret environment variables is supported; arbitrary variables and API secrets are rejected.
    </div>
    {error && <div role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
    {notice && <p role="status" className="mb-3 text-sm text-teal-200">{notice}</p>}
    <div className="mb-5 rounded-xl border border-teal-400/20 bg-teal-400/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="text-sm font-semibold text-teal-100">Windows-MCP desktop automation</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">Optional UI Automation MCP server. The preset disables anonymous telemetry and excludes PowerShell, Registry, Process, and FileSystem tool groups. It needs <code>uvx</code> and Python 3.14+; Hub-Mind still applies its MCP approval policy.</p></div>
        <button type="button" onClick={() => void addWindowsMcpPreset()} disabled={busy || loading} className="shrink-0 rounded-lg border border-teal-300/40 px-3 py-2 text-xs font-semibold text-teal-100 hover:bg-teal-300/10 disabled:opacity-50">{busy ? 'Configuring…' : 'Add Windows-MCP (telemetry off)'}</button>
      </div>
    </div>
    <div className="space-y-2 mb-6">
      {loading && servers.length === 0 && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="animate-spin" size={15}/> Loading servers…</p>}
      {!loading && servers.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No MCP servers configured.</p>}
      {servers.map(server => <div key={server.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="font-medium text-sm">{server.name}</p><p className="mt-1 text-xs text-slate-500">{server.transport === 'stdio' ? 'Local stdio process' : 'Streamable HTTP'} · {server.toolCount} tools</p>
            <p className={'mt-2 text-xs ' + (server.connected ? 'text-emerald-300' : 'text-amber-300')}>{server.connected ? 'Connected' : server.error || 'Disconnected'}</p>
          </div>
          <div className="flex items-center gap-2">
            {!server.connected && <button type="button" disabled={busy} onClick={() => void connectServer(server.id)} className="rounded-lg border border-teal-400/30 px-3 py-2 text-xs text-teal-200 disabled:opacity-50">Connect</button>}
            <button type="button" disabled={busy} onClick={() => void removeServer(server.id)} className="rounded-lg border border-rose-500/25 p-2 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50" aria-label={'Remove ' + server.name}><Trash2 size={15}/></button>
          </div>
        </div>
      </div>)}
    </div>
    <div className="border-t border-slate-800 pt-5">
      <h3 className="text-sm font-semibold mb-3">Add an MCP server</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-slate-400">Display name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="My local tools" className={fieldClass}/></label>
        <label className="block text-xs text-slate-400">Transport<select value={transport} onChange={e => setTransport(e.target.value as 'stdio' | 'streamable-http')} className={fieldClass}><option value="stdio">Local stdio process</option><option value="streamable-http">HTTPS Streamable HTTP</option></select></label>
        {transport === 'stdio' ? <>
          <label className="block text-xs text-slate-400 md:col-span-2">Executable path or command<input value={command} onChange={e => setCommand(e.target.value)} maxLength={500} placeholder="C:\Tools\my-mcp-server.exe" className={fieldClass}/></label>
          <label className="block text-xs text-slate-400 md:col-span-2">Arguments (one per line)<textarea value={argsText} onChange={e => setArgsText(e.target.value)} rows={3} placeholder={'--mode\nstdio'} className={fieldClass}/></label>
          <label className="block text-xs text-slate-400 md:col-span-2">Working directory (optional, absolute path)<input value={cwd} onChange={e => setCwd(e.target.value)} maxLength={1000} placeholder="C:\Tools" className={fieldClass}/></label>
        </> : <label className="block text-xs text-slate-400 md:col-span-2">MCP endpoint URL<input value={url} onChange={e => setUrl(e.target.value)} maxLength={2000} placeholder="https://example.com/mcp" className={fieldClass}/></label>}
      </div>
      <button type="button" onClick={() => void addServer()} disabled={busy || !name.trim() || (transport === 'stdio' ? !command.trim() : !url.trim())} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} Add and connect
      </button>
    </div>
  </section>;
}
