
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { InboxItem } from '../types';
import { Loader2, Archive, CheckSquare, Users, Calendar, Book, X, Share2, Send } from 'lucide-react';
import { safeParseISO, safeFormat } from "../lib/dateUtils";
import { format, parseISO } from 'date-fns';
import { ShareResourceModal } from '../components/ShareResourceModal';
import { InboxCommunication } from '../components/InboxCommunication';
import { MessageSquare, Inbox as InboxIcon } from 'lucide-react';

function CapturedInbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isShared = new URLSearchParams(location.search).get('shared') === 'true';
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [sharingItem, setSharingItem] = useState<InboxItem | null>(null);

  const [activeItem, setActiveItem] = useState<InboxItem | null>(null);
  const [actionType, setActionType] = useState<'task' | 'meeting' | null>(null);
  const [actionDate, setActionDate] = useState('');
  const [actionTime, setActionTime] = useState('');
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<{id: string, name: string}[]>([]);
  const [viewMode, setViewMode] = useState<'unprocessed' | 'processed'>('unprocessed');

  useEffect(() => {
    const fetchClients = async () => {
      const { getDocs, collection } = await import('firebase/firestore');
      const snap = await getDocs(collection(db, 'clients'));
      setClients(snap.docs.map(d => ({id: d.id, name: d.data().name})));
    };
    fetchClients();
    if (!profile) return;
    const q = profile.role === 'admin'
      ? query(
          collection(db, 'inbox'),
          where('status', '==', viewMode)
        )
      : query(
          collection(db, 'inbox'),
          where('status', '==', viewMode),
          where('createdBy', '==', profile.id)
        );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as InboxItem));
      data = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching inbox:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile, viewMode]);

  const handleArchive = async (item: InboxItem) => {
    setProcessingId(item.id);
    try {
      await updateDoc(doc(db, 'inbox', item.id), {
        status: 'processed',
        convertedTo: { type: 'archived', id: '' }
      });
    } catch (err) {
      console.error(err);
      
    } finally {
      setProcessingId(null);
    }
  };

  const convertToKnowledge = async (item: InboxItem) => {
    setProcessingId(item.id);
    try {
      const docRef = await addDoc(collection(db, 'knowledge'), {
        title: item.text.split('\n')[0].substring(0, 50) || 'New Knowledge',
        content: item.text,
        category: 'faq',
        tags: [],
        createdBy: profile?.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await updateDoc(doc(db, 'inbox', item.id), {
        status: 'processed',
        convertedTo: { type: 'knowledge', id: docRef.id }
      });
    } catch (err) {
      console.error(err);
      
    } finally {
      setProcessingId(null);
    }
  };

  const convertToClient = async (item: InboxItem) => {
    setProcessingId(item.id);
    try {
      const docRef = await addDoc(collection(db, 'clients'), {
        name: item.text,
        type: 'lead',
        status: 'active',
        ownerId: profile?.id,
          createdAt: new Date().toISOString()
        });
      await updateDoc(doc(db, 'inbox', item.id), {
        status: 'processed',
        convertedTo: { type: 'client', id: docRef.id }
      });
    } catch (err) {
      console.error(err);
      
    } finally {
      setProcessingId(null);
    }
  };

  const handleActionSubmit = async () => {
    if (!activeItem || !actionType) return;
    setProcessingId(activeItem.id);

    try {
      let isoString = new Date().toISOString();
      if (actionDate) {
        if (actionTime) {
          isoString = new Date(`${actionDate}T${actionTime}`).toISOString();
        } else {
          isoString = new Date(actionDate).toISOString();
        }
      }

      let docRefId = '';

      if (actionType === 'task') {
        const docRef = await addDoc(collection(db, 'tasks'), {
          title: activeItem.text,
          description: '',
          priority: 'medium',
          status: 'pending',
          assignedTo: profile?.id,
          createdBy: profile?.id,
          clientId: clientId || null,
          checklist: [],
          comments: [],
          deadline: actionDate ? isoString : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        docRefId = docRef.id;
      } else if (actionType === 'meeting') {
        const docRef = await addDoc(collection(db, 'meetings'), {
          notesRaw: activeItem.text,
          date: isoString,
          attendees: [],
          actionPoints: [],
          generatedDocs: [],
          ownerId: profile?.id,
          clientId: clientId || null,
          createdAt: new Date().toISOString()
        });
        docRefId = docRef.id;
      }

      await updateDoc(doc(db, 'inbox', activeItem.id), {
        status: 'processed',
        convertedTo: { type: actionType, id: docRefId }
      });

      setActiveItem(null);
      setActionType(null);
      if (actionType === 'task' && docRefId) {
        navigate('/tasks/' + docRefId);
      }
      setActionDate('');
      setActionTime('');
    setClientId('');
    } catch (err) {
      console.error(err);
      
    } finally {
      setProcessingId(null);
    }
  };

  const openActionForm = (item: InboxItem, type: 'task' | 'meeting') => {
    setActiveItem(item);
    setActionType(type);
    setActionDate(format(new Date(), 'yyyy-MM-dd'));
    setActionTime('09:00');
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 md:space-y-8 h-full flex flex-col min-h-0">
      
      <div className="shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Inbox</h1>
        <p className="text-sm text-slate-400 mt-1">Quick captures and notes</p>
      </div>
      
      <div className="flex border-b border-slate-800 shrink-0">
        <button 
          onClick={() => setViewMode('unprocessed')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'unprocessed' ? 'border-accent text-accent' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          Unprocessed
        </button>
        <button 
          onClick={() => setViewMode('processed')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'processed' ? 'border-accent text-accent' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          Archived
        </button>
      </div>


      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 border border-slate-800 border-dashed rounded-2xl bg-slate-900/50">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <CheckSquare className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{viewMode === 'unprocessed' ? 'Inbox Zero' : 'No Archived Items'}</h2>
          <p className="text-slate-400 text-center text-sm max-w-sm">
            {viewMode === 'unprocessed' ? 'All your captured thoughts have been processed. Tap the Quick Capture button to add more.' : 'You have not archived any items yet.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {items.map(item => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start gap-4">
                <p className="text-white text-lg leading-relaxed whitespace-pre-wrap flex-1">{item.text}</p>
                <span className="text-xs font-medium text-slate-500 shrink-0">
                  {safeFormat(item.createdAt, 'MMM d, h:mm a')}
                </span>
              </div>
              
              {activeItem?.id === item.id && actionType ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mt-2">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                      Convert to {actionType}
                    </h4>
                    <button onClick={() => setActiveItem(null)} className="text-slate-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                      <input 
                        type="date"
                        value={actionDate}
                        onChange={e => setActionDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                      />
                    </div>
                    {(actionType === 'meeting' || actionType === 'task') && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Time</label>
                        <input 
                          type="time"
                          value={actionTime}
                          onChange={e => setActionTime(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                        />
                      </div>
                    )}
                  </div>
                  
                  
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-slate-400 mb-1">Related Client (Optional)</label>
                    <select 
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    >
                      <option value="">None</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
  
<div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setActiveItem(null)}
                      className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleActionSubmit}
                      disabled={processingId === item.id}
                      className="px-4 py-2 text-sm font-bold bg-accent text-slate-950 rounded-lg hover:bg-white flex items-center gap-2"
                    >
                      {processingId === item.id && <Loader2 className="w-4 h-4 animate-spin" />}
                      Confirm
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-800/50">
                  <button
                    onClick={() => openActionForm(item, 'task')}
                    disabled={processingId === item.id}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-lg transition-colors text-sm flex-1 md:flex-none justify-center"
                  >
                    <CheckSquare className="w-4 h-4 text-accent" />
                    <span className="hidden sm:inline">To Task</span>
                  </button>
                  <button
                    onClick={() => openActionForm(item, 'meeting')}
                    disabled={processingId === item.id}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-lg transition-colors text-sm flex-1 md:flex-none justify-center"
                  >
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span className="hidden sm:inline">To Meeting</span>
                  </button>
                  <button
                    onClick={() => convertToClient(item)}
                    disabled={processingId === item.id}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-lg transition-colors text-sm flex-1 md:flex-none justify-center"
                  >
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">To Client</span>
                  </button>
                  <button
                    onClick={() => convertToKnowledge(item)}
                    disabled={processingId === item.id}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-lg transition-colors text-sm flex-1 md:flex-none justify-center"
                  >
                    <Book className="w-4 h-4 text-purple-400" />
                    <span className="hidden sm:inline">To Knowledge</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharingItem(item)}
                    disabled={processingId === item.id}
                    className="flex items-center gap-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-semibold px-3 py-2 rounded-lg border border-teal-500/30 transition-colors text-sm flex-1 md:flex-none justify-center cursor-pointer"
                    title="Send this note to a connected friend"
                  >
                    <Share2 className="w-4 h-4 text-teal-400" />
                    <span>Send to Friend</span>
                  </button>
                  <button
                    onClick={() => handleArchive(item)}
                    disabled={processingId === item.id}
                    className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold px-3 py-2 rounded-lg transition-colors text-sm md:ml-auto justify-center w-full md:w-auto"
                  >
                    <Archive className="w-4 h-4" />
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {sharingItem && (
        <ShareResourceModal
          isOpen={!!sharingItem}
          onClose={() => setSharingItem(null)}
          resourceType="document"
          resourceId={sharingItem.id}
          resourceTitle={sharingItem.text.slice(0, 60) || 'Quick Note'}
        />
      )}
    </div>
  );
}


export function Inbox() {
  const [section, setSection] = useState<'messages' | 'captures'>('messages');
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 pb-20 sm:px-5 md:px-8 md:py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-accent">Hub-Mind communications</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Inbox</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Messages, notifications, drafts and captured items—together in one place.</p>
        </div>
        <div className="flex w-full gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-1 sm:w-auto">
          <button type="button" onClick={() => setSection('messages')} className={`inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-none ${section === 'messages' ? 'bg-accent/10 text-accent' : 'text-slate-400 hover:text-white'}`}><MessageSquare size={14}/> Messages</button>
          <button type="button" onClick={() => setSection('captures')} className={`inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-none ${section === 'captures' ? 'bg-accent/10 text-accent' : 'text-slate-400 hover:text-white'}`}><InboxIcon size={14}/> Captured items</button>
        </div>
      </header>
      {section === 'messages' ? <InboxCommunication /> : <CapturedInbox />}
    </div>
  );
}
