import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useLoading } from '../lib/loadingContext';
import { ClientsSkeleton } from '../components/skeletons/ClientsSkeleton';
import { collection, query, getDocs, orderBy, where, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Client } from '../types';
import { getLocalClients, setLocalClients, upsertLocalClient } from '../lib/localWorkspaceStore';
import { Loader2, Plus, Search, Building2, User, Users as UsersIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useUsers } from '../lib/useUsers';
import { getThumbnailUrl } from '../lib/cloudinary';

export function Clients() {
  const { profile } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const [clients, setClients] = useState<Client[]>(() => getLocalClients());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'school' | 'parent' | 'partner'>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState<'school' | 'parent' | 'partner'>('school');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const { users } = useUsers();

  useEffect(() => {
    if (!profile) return;
    startLoading('clients');
    
    const q = query(collection(db, 'clients'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.docs.length > 0) {
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Client));
        data = data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setLocalClients(data);
        setClients(data);
      } else {
        setClients(getLocalClients());
      }
      setLoading(false);
      stopLoading('clients');
    }, (error) => {
      console.warn("Clients listener warning, fallback to local storage:", error);
      setClients(getLocalClients());
      setLoading(false);
      stopLoading('clients');
    });

    return () => {
      unsubscribe();
      stopLoading('clients');
    };
  }, [profile, startLoading, stopLoading]);

  const filteredClients = clients.filter(c => 
    (activeTab === 'all' || c.type === activeTab) &&
    ((c.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (c.email || '').toLowerCase().includes(search.toLowerCase()))
  );

  
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim() || !profile) return;
    setIsSubmitting(true);
    const newClient: Client = {
      id: `client-${Date.now()}`,
      name: newClientName,
      type: newClientType,
      email: newClientEmail,
      phone: newClientPhone,
      status: 'active',
      ownerId: profile.id,
      createdAt: new Date().toISOString()
    };
    upsertLocalClient(newClient);
    setClients(prev => [newClient, ...prev].sort((a, b) => (a.name || '').localeCompare(b.name || '')));

    try {
      await addDoc(collection(db, 'clients'), {
        name: newClientName,
        type: newClientType,
        email: newClientEmail,
        phone: newClientPhone,
        status: 'active',
        ownerId: profile.id,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn("Saved client locally (cloud sync pending):", error);
    } finally {
      setIsDialogOpen(false);
      setNewClientName('');
      setNewClientEmail('');
      setNewClientPhone('');
      setNewClientType('school');
      setIsSubmitting(false);
    }
  };

  const getClientIcon = (type: string) => {
    switch (type) {
      case 'school': return <Building2 className="w-5 h-5 text-indigo-400" />;
      case 'parent': return <User className="w-5 h-5 text-emerald-400" />;
      default: return <UsersIcon className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 flex flex-col h-full min-h-0 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Clients</h1>
          <p className="text-xs sm:text-sm text-slate-400">Manage partners, schools, and parent relationships</p>
        </div>
        
        {profile && (
          <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Dialog.Trigger asChild>
              <button className="h-10 px-4 py-2 bg-accent hover:bg-accent-hover text-slate-950 font-bold rounded-lg text-sm transition-all duration-150 flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] w-full sm:w-auto shrink-0">
                <Plus className="w-4 h-4" />
                <span>New Client</span>
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl z-50 focus:outline-none">
                <Dialog.Title className="text-xl font-bold text-white mb-4">Add New Client</Dialog.Title>
                <Dialog.Close className="absolute top-4 right-4 text-slate-500 hover:text-slate-300">
                  <X className="w-5 h-5" />
                </Dialog.Close>
                <form onSubmit={handleCreateClient} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                    <input 
                      type="text" 
                      required
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent"
                      placeholder="Client Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Type</label>
                    <select 
                      value={newClientType}
                      onChange={(e) => setNewClientType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="school">School</option>
                      <option value="parent">Parent</option>
                      <option value="partner">Partner</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
                    <input 
                      type="email" 
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Phone</label>
                    <input 
                      type="text" 
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-accent"
                      placeholder="+1 234 567 890"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full h-10 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-slate-950 font-bold px-4 py-2 rounded-lg transition-all duration-150 mt-6 shadow-xs active:scale-[0.98]"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Client'}
                  </button>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0 hide-scrollbar bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
          {(['all', 'school', 'parent', 'partner'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-8 px-3.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all duration-150 ${
                activeTab === tab 
                  ? 'bg-accent text-slate-950 shadow-xs font-bold' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
            >
              {tab === 'all' ? 'All Clients' : tab}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text"
            placeholder="Search clients by name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <ClientsSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 overflow-y-auto flex-1 min-h-0 pb-4">
          {filteredClients.map(client => (
            <Link key={client.id} to={`/clients/${client.id}`} className="block h-full">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 hover:border-accent/50 transition-colors h-full flex flex-col relative">
                <div className="flex items-start gap-4 mb-4">
                  {client.photoUrl ? (
                    <img src={getThumbnailUrl(client.photoUrl, 64, 64)} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-700" loading="lazy" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700 shrink-0">
                      {getClientIcon(client.type)}
                    </div>
                  )}
                  <div className="min-w-0 pr-8">
                    <h3 className="font-semibold text-slate-200 truncate">{client.name}</h3>
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">{client.type}</span>
                  </div>
                </div>
                
                {client.ownerId && (
                  <div className="absolute top-4 right-4 bg-slate-800 px-2 py-1 rounded text-[10px] font-bold text-slate-400">
                    {users[client.ownerId] ? (
      <span className="flex items-center gap-1.5">
        {users[client.ownerId].photoUrl ? (
          <img src={users[client.ownerId].photoUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
        ) : (
          <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[8px] text-white font-bold">{users[client.ownerId].name.charAt(0)}</span>
        )}
        {users[client.ownerId].name}
      </span>
    ) : 'Owner'}
                  </div>
                )}
                
                <div className="mt-auto pt-4 border-t border-slate-800 space-y-2 text-sm text-slate-400">
                  {client.email && <p className="truncate flex items-center gap-2"><span className="text-slate-500">•</span> {client.email}</p>}
                  {client.phone && <p className="flex items-center gap-2"><span className="text-slate-500">•</span> {client.phone}</p>}
                </div>
              </div>
            </Link>
          ))}
          {filteredClients.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
              No clients found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
