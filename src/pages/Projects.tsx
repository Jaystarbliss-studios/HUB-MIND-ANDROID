import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { Project, Task, Client } from '../types';
import { getLocalProjects, setLocalProjects } from '../lib/localWorkspaceStore';
import { Loader2, Plus, Folder, Search, LayoutGrid, CalendarRange, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProjectTimelineView } from '../components/ProjectTimelineView';

function mergeSnapshots<T extends { id: string }>(...lists: T[][]) { const map = new Map<string, T>(); lists.flat().forEach(item => map.set(item.id, item)); return [...map.values()]; }

export function Projects() {
  const { profile } = useAuth(); const [projects, setProjects] = useState<Project[]>(() => getLocalProjects()); const [tasks, setTasks] = useState<Task[]>([]); const [clients, setClients] = useState<Client[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid'); const [loading, setLoading] = useState(true); const [show, setShow] = useState(false); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [search, setSearch] = useState(''); const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return; setLoading(true); const unsubs: (() => void)[] = [];
    const listenResource = (collectionName: string, setter: (items: any[]) => void) => {
      const lists: any[][] = [];
      const queries = profile.role === 'admin' ? [collection(db, collectionName)] : [query(collection(db, collectionName), where('ownerId', '==', profile.id)), query(collection(db, collectionName), where('visibility', '==', 'workspace')), query(collection(db, collectionName), where(`sharedWith.${profile.id}`, 'in', ['read', 'write']))];
      queries.forEach((q: any, index) => { unsubs.push(onSnapshot(q, (snap: any) => { lists[index] = snap.docs ? snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) : []; setter(mergeSnapshots(...lists)); setLoading(false); }, () => setLoading(false))); });
    };
    listenResource('projects', items => { const value = items as Project[]; setProjects(value); setLocalProjects(value); });
    listenResource('tasks', items => setTasks(items as Task[]));
    listenResource('clients', items => setClients(items as Client[]));
    return () => unsubs.forEach(unsub => unsub());
  }, [profile]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!profile || !name.trim()) return; setWriteError(null); const now = new Date().toISOString();
    try { const ref = await addDoc(collection(db, 'projects'), { name: name.trim(), description, status: 'active', ownerId: profile.id, visibility: 'private', createdAt: now, updatedAt: now }); setProjects(current => [{ id: ref.id, name: name.trim(), description, status: 'active', ownerId: profile.id, visibility: 'private', createdAt: now, updatedAt: now } as Project, ...current]); setName(''); setDescription(''); setShow(false); }
    catch (err: any) { console.error('Project cloud write failed', err); setWriteError(err?.message || 'Project could not be saved. Nothing was marked as created.'); }
  };

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20"><header className="flex flex-col sm:flex-row justify-between gap-4"><div><h1 className="text-3xl font-bold text-white flex items-center gap-2"><Folder className="w-6 h-6 text-accent"/>Projects</h1><p className="text-sm text-slate-400">Projects are the parent workspace object for related work.</p></div><div className="flex gap-2"><button onClick={() => setViewMode('grid')} className={`px-3 py-2 rounded-lg ${viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'bg-slate-900 text-slate-400'}`}><LayoutGrid className="w-4 h-4"/></button><button onClick={() => setViewMode('timeline')} className={`px-3 py-2 rounded-lg ${viewMode === 'timeline' ? 'bg-accent/20 text-accent' : 'bg-slate-900 text-slate-400'}`}><CalendarRange className="w-4 h-4"/></button><button onClick={() => setShow(true)} className="bg-accent text-slate-950 font-bold px-4 py-2 rounded-lg inline-flex gap-2"><Plus className="w-4 h-4"/>New Project</button></div></header><div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects" className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white"/></div>{writeError && <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-300"><AlertTriangle className="w-4 h-4 mt-0.5"/>{writeError}</div>}{show && <form onSubmit={create} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"><input required value={name} onChange={e => setName(e.target.value)} placeholder="Project name" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"/><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"/><div className="flex gap-2"><button className="bg-accent text-slate-950 font-bold px-4 py-2 rounded-lg">Create</button><button type="button" onClick={() => setShow(false)} className="bg-slate-800 text-slate-200 px-4 py-2 rounded-lg">Cancel</button></div></form>}{loading ? <div className="p-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-accent"/></div> : viewMode === 'timeline' ? <ProjectTimelineView projects={filtered} tasks={tasks} clients={clients}/> : <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">{filtered.map(p => <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><div className="flex justify-between"><Folder className="w-6 h-6 text-accent"/><span className="text-[10px] uppercase bg-slate-800 text-slate-400 px-2 py-1 rounded">{p.status}</span></div><h3 className="text-lg font-bold text-white mt-4">{p.name}</h3><p className="text-sm text-slate-400 mt-2 min-h-10">{p.description || 'No description.'}</p><div className="mt-5 pt-4 border-t border-slate-800 flex justify-end"><Link to={`/projects/${p.id}`} className="text-sm font-bold text-accent">Open project</Link></div></div>)}{filtered.length === 0 && <div className="col-span-full p-12 text-center text-slate-500">No projects found.</div>}</div>}</div>;
}
