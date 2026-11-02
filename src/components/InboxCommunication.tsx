import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Bell, FileText, Inbox, Loader2, Mail, MessageSquare, Plus, Send, Trash2, X } from 'lucide-react';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import './inbox-communication.css';

type InboxTab = 'received' | 'sent' | 'drafts' | 'notifications';
type WorkspaceUser = { id: string; name?: string; displayName?: string; username?: string; email?: string; status?: string; role?: string };
type WorkspaceMessage = { id: string; senderId: string; recipientId: string; senderName?: string; recipientName?: string; subject?: string; text: string; createdAt: string; updatedAt?: string; read?: boolean; readAt?: string };
type MessageDraft = { id: string; userId: string; recipientId?: string; recipientName?: string; subject?: string; text?: string; updatedAt?: string; createdAt?: string };
type InboxNotification = { id: string; userId: string; title?: string; body?: string; type?: string; messageId?: string; createdAt?: string; read?: boolean; readAt?: string };

const tabs: { id: InboxTab; label: string; icon: React.ElementType }[] = [
  { id: 'received', label: 'Received', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export function InboxCommunication() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<InboxTab>('received');
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [drafts, setDrafts] = useState<MessageDraft[]>([]);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<WorkspaceMessage | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    return onSnapshot(collection(db, 'users'), snapshot => {
      setUsers(snapshot.docs.map(item => ({ id: item.id, ...(item.data() as any) } as WorkspaceUser)).filter(item => item.id !== profile.id && item.status === 'active'));
    }, err => console.warn('[Inbox] Workspace contacts unavailable:', err?.message || err));
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    return onSnapshot(query(collection(db, 'notifications'), where('userId', '==', profile.id)), snapshot => {
      const list = snapshot.docs.map(item => ({ id: item.id, ...(item.data() as any) } as InboxNotification));
      list.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setNotifications(list);
    }, err => console.warn('[Inbox] Notification badge could not update:', err?.message || err));
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    setLoading(true);
    const collectionName = tab === 'notifications' ? 'notifications' : tab === 'drafts' ? 'messageDrafts' : 'messages';
    const field = tab === 'received' ? 'recipientId' : tab === 'sent' ? 'senderId' : 'userId';
    if (tab === 'notifications') { setLoading(false); return; }
    if (tab === 'drafts') {
      const stop = onSnapshot(query(collection(db, collectionName), where('userId', '==', profile.id)), snapshot => {
        const list = snapshot.docs.map(item => ({ id: item.id, ...(item.data() as any) } as MessageDraft));
        list.sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        setDrafts(list); setLoading(false);
      }, err => { console.error('[Inbox] Drafts unavailable:', err); setError('Could not load drafts. Check your connection and access.'); setLoading(false); });
      return () => stop();
    }
    const stop = onSnapshot(query(collection(db, collectionName), where(field, '==', profile.id)), snapshot => {
      const list = snapshot.docs.map(item => ({ id: item.id, ...(item.data() as any) } as WorkspaceMessage));
      list.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setMessages(list); setLoading(false);
    }, err => { console.error('[Inbox] Messages unavailable:', err); setError('Could not load messages. Check your connection and access.'); setLoading(false); });
    return () => stop();
  }, [profile?.id, tab]);

  const unreadCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications]);
  const resetComposer = () => { setDraftId(null); setRecipientId(''); setSubject(''); setText(''); setError(''); };
  const openCompose = (draft?: MessageDraft) => {
    setError(''); setNotice('');
    if (draft) {
      setDraftId(draft.id); setRecipientId(draft.recipientId || ''); setSubject(draft.subject || ''); setText(draft.text || '');
    } else resetComposer();
    setComposeOpen(true);
  };

  const saveDraft = async () => {
    if (!profile?.id) return;
    setSaving(true); setError(''); setNotice('');
    const recipient = users.find(item => item.id === recipientId);
    const now = new Date().toISOString();
    const payload = { userId: profile.id, recipientId: recipientId || '', recipientName: recipient?.name || recipient?.displayName || recipient?.username || '', subject: subject.trim(), text: text.slice(0,12000), updatedAt: now };
    try {
      if (draftId) await updateDoc(doc(db, 'messageDrafts', draftId), payload);
      else {
        const ref = await addDoc(collection(db, 'messageDrafts'), { ...payload, createdAt: now });
        setDraftId(ref.id);
      }
      setNotice('Draft saved.');
    } catch (err: any) { setError(err?.message || 'Could not save this draft.'); }
    finally { setSaving(false); }
  };

  const send = async () => {
    if (!profile?.id || !recipientId || !text.trim()) { setError('Choose a recipient and write a message before sending.'); return; }
    setSaving(true); setError(''); setNotice('');
    const recipient = users.find(item => item.id === recipientId);
    const senderName = profile.preferredName || profile.displayName || profile.name || profile.username || profile.email;
    const recipientName = recipient?.name || recipient?.displayName || recipient?.username || recipient?.email || 'Workspace member';
    const now = new Date().toISOString();
    try {
      const messageRef = await addDoc(collection(db, 'messages'), {
        senderId: profile.id, recipientId, senderName, recipientName,
        subject: subject.trim() || 'No subject', text: text.trim().slice(0,12000),
        createdAt: now, updatedAt: now, read: false,
      });
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: recipientId, createdBy: profile.id, messageId: messageRef.id,
          type: 'message', title: 'New message from ' + senderName,
          body: (subject.trim() || text.trim()).slice(0,180), createdAt: now, read: false,
        });
      } catch (notificationError) {
        console.warn('[Inbox] Message sent but notification creation failed:', notificationError);
      }
      if (draftId) await deleteDoc(doc(db, 'messageDrafts', draftId)).catch(() => {});
      setComposeOpen(false); resetComposer(); setTab('sent'); setNotice('Message sent.');
    } catch (err: any) { setError(err?.message || 'Could not send this message.'); }
    finally { setSaving(false); }
  };

  const openMessage = async (message: WorkspaceMessage) => {
    setSelectedMessage(message);
    if (tab === 'received' && !message.read && profile?.id) {
      await updateDoc(doc(db, 'messages', message.id), { read: true, readAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).catch(err => console.warn('[Inbox] Read receipt failed:', err));
    }
  };

  const markNotificationRead = async (item: InboxNotification) => {
    if (!item.read) await updateDoc(doc(db, 'notifications', item.id), { read: true, readAt: new Date().toISOString() }).catch(err => console.warn('[Inbox] Could not mark notification read:', err));
    if (item.messageId) {
      try {
        const snapshot = await getDoc(doc(db, 'messages', item.messageId));
        if (snapshot.exists()) { const message = { id: snapshot.id, ...(snapshot.data() as any) } as WorkspaceMessage; setSelectedMessage(message); if (!message.read) await updateDoc(doc(db, 'messages', message.id), { read: true, readAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).catch(() => {}); }
      } catch (err) { console.warn('[Inbox] Linked message could not be opened:', err); }
    }
  };

  return (
    <section className="hm-inbox-communications">
      <div className="hm-inbox-heading">
        <div><p className="hm-inbox-eyebrow">YOUR COMMUNICATIONS</p><h2>Messages & notifications</h2><p>Keep conversations, drafts and updates in one place.</p></div>
        <button type="button" className="hm-inbox-compose" onClick={() => openCompose()}><Plus size={16}/> Compose</button>
      </div>
      <nav className="hm-inbox-tabs" aria-label="Inbox folders">
        {tabs.map(item => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => { setTab(item.id); setError(''); setNotice(''); }} className={tab === item.id ? 'is-active' : ''}><Icon size={15}/><span>{item.label}</span>{item.id === 'notifications' && unreadCount > 0 && <b>{unreadCount}</b>}</button>; })}
      </nav>
      {notice && <div role="status" className="hm-inbox-notice">{notice}</div>}
      {error && <div role="alert" className="hm-inbox-error">{error}</div>}
      <div className="hm-inbox-list">
        {loading ? <div className="hm-inbox-empty"><Loader2 size={20} className="animate-spin"/> Loading your {tab}…</div> :
          tab === 'notifications' ? notifications.length ? notifications.map(item => <button type="button" key={item.id} className={'hm-inbox-row ' + (!item.read ? 'is-unread' : '')} onClick={() => void markNotificationRead(item)}><span className="hm-inbox-row-icon"><Bell size={17}/></span><span className="hm-inbox-row-main"><strong>{item.title || 'Notification'}</strong><span>{item.body || 'You have an update in Hub-Mind.'}</span><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small></span>{!item.read && <i className="hm-inbox-unread-dot"/>}</button>) : <div className="hm-inbox-empty"><Bell size={22}/><strong>You’re all caught up</strong><span>New messages and workspace updates will appear here.</span></div> :
          tab === 'drafts' ? drafts.length ? drafts.map(item => <div key={item.id} className="hm-inbox-row"><button type="button" className="hm-inbox-row-main hm-inbox-row-open" onClick={() => openCompose(item)}><strong>{item.subject || 'Untitled draft'}</strong><span>{item.text || 'No message content yet.'}</span><small>Draft · Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'recently'}</small></button><button type="button" className="hm-inbox-icon-action is-danger" onClick={() => void deleteDoc(doc(db,'messageDrafts',item.id))} aria-label="Delete draft"><Trash2 size={15}/></button></div>) : <div className="hm-inbox-empty"><FileText size={22}/><strong>No drafts yet</strong><span>Start a message and save it to finish later.</span></div> :
          messages.length ? messages.map(item => { const otherName = tab === 'received' ? item.senderName || item.senderId : item.recipientName || item.recipientId; return <button type="button" key={item.id} className={'hm-inbox-row ' + (tab === 'received' && !item.read ? 'is-unread' : '')} onClick={() => void openMessage(item)}><span className="hm-inbox-row-icon">{tab === 'received' ? <Mail size={17}/> : <Send size={17}/>}</span><span className="hm-inbox-row-main"><strong>{item.subject || 'No subject'}</strong><span>{tab === 'received' ? 'From ' : 'To '}{otherName} · {item.text}</span><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small></span>{tab === 'received' && !item.read && <i className="hm-inbox-unread-dot"/>}</button>; }) : <div className="hm-inbox-empty"><MessageSquare size={22}/><strong>{tab === 'received' ? 'Your inbox is clear' : 'Nothing sent yet'}</strong><span>{tab === 'received' ? 'Messages sent to you will show up here.' : 'Messages you send will appear here.'}</span><button type="button" onClick={() => openCompose()}><Plus size={14}/> Compose a message</button></div>
        }
      </div>

      {composeOpen && <div className="hm-inbox-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setComposeOpen(false); } }}>
        <section className="hm-inbox-modal" role="dialog" aria-modal="true" aria-labelledby="hm-compose-title">
          <header><div><span className="hm-inbox-modal-kicker">WORKSPACE MESSAGE</span><h3 id="hm-compose-title">{draftId ? 'Edit draft' : 'Compose a message'}</h3></div><button type="button" onClick={() => setComposeOpen(false)} aria-label="Close composer"><X size={18}/></button></header>
          <label>To<select value={recipientId} onChange={event => setRecipientId(event.target.value)}><option value="">Choose a workspace member…</option>{users.map(item => <option key={item.id} value={item.id}>{item.name || item.displayName || item.username || item.email} · {item.email}</option>)}</select></label>
          <label>Subject<input value={subject} onChange={event => setSubject(event.target.value)} maxLength={180} placeholder="What is this about?"/></label>
          <label>Message<textarea value={text} onChange={event => setText(event.target.value)} maxLength={12000} rows={7} placeholder="Write your message…"/></label>
          {error && <div role="alert" className="hm-inbox-error">{error}</div>}
          <footer><span>{text.length}/12000</span><div><button type="button" className="hm-inbox-secondary" onClick={() => void saveDraft()} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin"/> : <FileText size={14}/>} Save draft</button><button type="button" className="hm-inbox-compose" onClick={() => void send()} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Send message</button></div></footer>
        </section>
      </div>}

      {selectedMessage && <div className="hm-inbox-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedMessage(null); }}>
        <section className="hm-inbox-modal hm-inbox-message-detail" role="dialog" aria-modal="true" aria-labelledby="hm-message-title">
          <header><div><span className="hm-inbox-modal-kicker">{tab === 'received' || tab === 'notifications' ? 'RECEIVED MESSAGE' : 'SENT MESSAGE'}</span><h3 id="hm-message-title">{selectedMessage.subject || 'No subject'}</h3></div><button type="button" onClick={() => setSelectedMessage(null)} aria-label="Close message"><X size={18}/></button></header>
          <div className="hm-inbox-message-meta"><span>{tab === 'received' || tab === 'notifications' ? 'From' : 'To'} <strong>{tab === 'received' || tab === 'notifications' ? selectedMessage.senderName || selectedMessage.senderId : selectedMessage.recipientName || selectedMessage.recipientId}</strong></span><time>{selectedMessage.createdAt ? new Date(selectedMessage.createdAt).toLocaleString() : ''}</time></div>
          <p className="hm-inbox-message-body">{selectedMessage.text}</p>
          <footer><button type="button" className="hm-inbox-secondary" onClick={() => setSelectedMessage(null)}>Close</button>{(tab === 'received' || tab === 'notifications') && <button type="button" className="hm-inbox-compose" onClick={() => { setSubject('Re: ' + (selectedMessage.subject || '')); setRecipientId(selectedMessage.senderId); setText(''); setSelectedMessage(null); setDraftId(null); setComposeOpen(true); }}><MessageSquare size={14}/> Reply</button>}</footer>
        </section>
      </div>}
    </section>
  );
}
